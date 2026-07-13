const { NacosNamingClient } = require('nacos-naming');
const os = require('os');
const logger = require('./logger');

const STALE_THRESHOLD = 5 * 60 * 1000; // 5 分钟
const INITIAL_BACKOFF_MS = 5000; // supervisor 初始退避 5s
const MAX_BACKOFF_MS = 60000; // supervisor 退避上限 60s（与 SDK gRPC 对齐）
const DEFAULT_SUPERVISOR_INTERVAL_MS = 30000; // supervisor 检查间隔 30s

/**
 * Nacos 服务注册管理（基于 nacos-sdk-nodejs gRPC 传输）
 *
 * 架构：gRPC 传输 + 薄层 supervisor 兜底
 *
 * SDK 内置能力（GrpcConnection）：
 *   - gRPC 长连接 + 连接级心跳（5s HealthCheckRequest）
 *   - 断线自动重连（指数退避 1s → 60s）
 *   - DNS 重解析（Nacos 容器换 IP 时自动适应）
 *
 * Supervisor 补全的缺口：
 *   - SDK 重连后不会自动重新调用 registerInstance()
 *   - 首次启动 Nacos 未就绪时 init+register 的重试
 *
 * 健康监控：supervisor 每 30s 检查注册状态，
 * 连续 5 分钟未成功确认则 isHealthy() 返回 false。
 */
class NacosRegistry {
  constructor(options = {}) {
    this.serverAddr = options.serverAddr || process.env.NACOS_SERVER || 'nacos:8848';
    this.namespace = options.namespace || process.env.NACOS_NAMESPACE || 'public';
    this.serviceName = options.serviceName || process.env.NACOS_SERVICE_NAME
      || process.env.PROJECT_NAME || 'fde-service';
    this.groupName = options.groupName || process.env.NACOS_GROUP || 'DEFAULT_GROUP';
    this.port = parseInt(options.port || process.env.SERVER_PORT || '5201', 10);
    this.ip = options.ip || process.env.POD_IP || this._getLocalIP();
    this.enabled = process.env.NACOS_ENABLED !== 'false';
    this.username = options.username || process.env.NACOS_USERNAME || 'nacos';
    this.password = options.password || process.env.NACOS_PASSWORD || 'nacos';
    this.appKey = options.appKey || process.env.APP_KEY || this.serviceName;
    this.supervisorInterval = parseInt(
      options.supervisorInterval || process.env.NACOS_HEALTH_CHECK_INTERVAL || String(DEFAULT_SUPERVISOR_INTERVAL_MS), 10
    );

    this.client = null;
    this.registered = false;
    this._supervisorTimer = null;
    this._backoffMs = INITIAL_BACKOFF_MS;
    this.lastHealthyTime = Date.now();
    this._metadata = {};
  }

  /**
   * 构建鉴权排除规则 JSON 字符串
   * 注册到 Nacos metadata 的 authUrls 字段，供 Gateway 识别免鉴权路径
   */
  _buildAuthUrls() {
    const appKey = this.appKey;
    const authUrls = {
      excludeUrls: `/${appKey}/**,/api/${appKey}/**`,
      notAuthenticationUrls: '',
    };
    return JSON.stringify(authUrls);
  }

  /**
   * 构建 Spring Cloud Gateway 路由配置 JSON 字符串
   * 注册到 Nacos metadata 的 routes 字段，供 Gateway 自动发现路由
   */
  _buildGatewayRoutes() {
    const appKey = this.appKey;
    const routes = [
      {
        id: `${appKey}_api_route`,
        uri: `lb://${appKey}`,
        predicates: [{ name: 'Path', args: { pattern: `/api/${appKey}/**` } }],
        filters: [{
          name: 'RewritePath',
          args: { regexp: '/api/(?<segment>.*)', replacement: '/${segment}' },
        }],
      },
      {
        id: `${appKey}_static_route`,
        uri: `lb://${appKey}`,
        predicates: [{ name: 'Path', args: { pattern: `/${appKey}/**` } }],
      },
    ];
    return JSON.stringify(routes);
  }

  _getLocalIP() {
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
      }
    }
    return '127.0.0.1';
  }

  /**
   * 构建实例对象（register 和 reRegister 共用）
   */
  _buildInstance() {
    return {
      ip: this.ip,
      port: this.port,
      weight: 1.0,
      ephemeral: true,
      clusterName: 'DEFAULT',
      metadata: {
        version: '1.0.0',
        routes: this._buildGatewayRoutes(),
        authUrls: this._buildAuthUrls(),
        ...this._metadata,
      },
    };
  }

  /**
   * 启动 Nacos 注册（入口方法）
   *
   * 1. 若 Nacos 禁用 → 直接返回
   * 2. 尝试 init + register（best effort，不阻塞）
   * 3. 无条件启动 supervisor 定时器
   *
   * @param {object} metadata - 注册 metadata（appKey, startTime 等）
   * @returns {Promise<boolean>} 初始注册是否成功
   */
  async start(metadata = {}) {
    if (!this.enabled) {
      logger.info('[Nacos] 服务注册已禁用');
      return true;
    }

    this._metadata = metadata;
    const ok = await this._ensureReady();
    this._startSupervisor();
    return ok;
  }

  /**
   * 初始化 client + 注册实例（带退避控制）
   * 失败后递增退避，成功后重置
   */
  async _ensureReady() {
    // Step 1: 初始化 client（如果尚未创建）
    if (!this.client) {
      try {
        this.client = new NacosNamingClient({
          logger: console,
          serverList: this.serverAddr,
          namespace: this.namespace,
          username: this.username,
          password: this.password,
        });
        await this.client.ready();
        logger.info({ server: this.serverAddr, namespace: this.namespace }, '[Nacos] gRPC 已连接');
      } catch (e) {
        logger.error({ err: e }, '[Nacos] gRPC 连接失败，等待 supervisor 重试');
        this.client = null;
        return false;
      }
    }

    // Step 2: 注册实例（如果尚未注册）
    if (!this.registered) {
      try {
        const instance = this._buildInstance();
        logger.info({ service: this.serviceName, ip: this.ip, port: this.port }, '[Nacos] 正在注册');
        await this.client.registerInstance(this.serviceName, instance, this.groupName);
        this.registered = true;
        this.lastHealthyTime = Date.now();
        this._backoffMs = INITIAL_BACKOFF_MS; // 重置退避
        logger.info({ service: this.serviceName, ip: this.ip, port: this.port }, '[Nacos] 注册成功');
      } catch (e) {
        logger.error({ err: e }, '[Nacos] 注册失败，等待 supervisor 重试');
        return false;
      }
    }

    return true;
  }

  /**
   * 启动 supervisor 定时器
   *
   * 职责：
   *   1. 若未注册 → 调用 _ensureReady() 重试（init + register）
   *   2. 若已注册 → 查询 Nacos 确认实例存在
   *      - 找到 → 更新 lastHealthyTime
   *      - 缺失 → 重新注册（补偿 SDK 重连后不自动重注册的缺口）
   *      - 查询失败 → 依赖 gRPC 自动重连，等待下次 tick
   */
  _startSupervisor() {
    if (this._supervisorTimer) return;

    this._supervisorTimer = setInterval(async () => {
      if (!this.registered) {
        // 未注册 → 尝试 init + register
        logger.info({ backoff: this._backoffMs }, '[Nacos] supervisor: 未注册，尝试初始化');
        await this._ensureReady();
        return;
      }

      // 已注册 → 验证实例是否存在
      // 使用 subscribe=false 直接查询服务端，绕过 HostReactor 本地缓存
      // 原因：gRPC 版 SDK 的 HostReactor 存在 key 映射 bug（服务端返回的 name
      //   无 group 前缀，但 getAllInstances 用 grouped name 查找缓存），导致
      //   subscribe=true 模式始终返回空数组
      try {
        const instances = await this.client.getAllInstances(this.serviceName, this.groupName, '', false);
        const found = instances.some(
          (inst) => inst.ip === this.ip && inst.port === this.port
        );

        if (found) {
          this.lastHealthyTime = Date.now();
        } else {
          logger.warn('[Nacos] supervisor: 实例不存在，重新注册');
          this.registered = false;
          await this._ensureReady();
        }
      } catch (e) {
        // 查询失败通常是 gRPC 连接断开
        // SDK 的 GrpcConnection 会自动重连（1s → 60s 退避）
        // supervisor 等待 gRPC 恢复后下次 tick 再检查
        logger.warn({ err: e.message }, '[Nacos] supervisor: 查询失败，等待 gRPC 重连');
      }
    }, this.supervisorInterval);

    // 确保定时器不阻止进程退出
    if (this._supervisorTimer.unref) {
      this._supervisorTimer.unref();
    }
  }

  /**
   * 健康状态判定
   * enabled=false → true; client=null → false; registered=false → false;
   * now - lastHealthyTime > 5min → false; 否则 → true
   */
  isHealthy() {
    if (!this.enabled) return true;
    if (!this.client) return false;
    if (!this.registered) return false;
    return (Date.now() - this.lastHealthyTime) < STALE_THRESHOLD;
  }

  /**
   * 注销实例（优雅关闭时调用）
   * 即使不调用，Nacos 也会在 gRPC 连接断开后自动摘除临时实例
   */
  async deregister() {
    if (this._supervisorTimer) {
      clearInterval(this._supervisorTimer);
      this._supervisorTimer = null;
    }

    if (!this.enabled || !this.client || !this.registered) return false;

    try {
      await this.client.deregisterInstance(this.serviceName, {
        ip: this.ip,
        port: this.port,
      }, this.groupName);
      this.registered = false;
      logger.info({ service: this.serviceName, ip: this.ip, port: this.port }, '[Nacos] 已注销');
      return true;
    } catch (e) {
      logger.error({ err: e }, '[Nacos] 注销异常');
      return false;
    }
  }

  /**
   * 关闭 client（优雅关闭时调用）
   */
  async close() {
    await this.deregister();
    if (this.client) {
      try {
        this.client.close();
      } catch (e) {
        logger.warn({ err: e }, '[Nacos] client 关闭异常');
      }
    }
  }
}

module.exports = { NacosRegistry };
