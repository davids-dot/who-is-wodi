require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const gameRouter = require('./routes/game');

const app = express();
const PORT = process.env.SERVER_PORT || 5201;

// 从 package.json 读取 appKey
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const APP_KEY = process.env.APP_KEY || process.env.PROJECT_NAME || pkg.fde?.appKey || pkg.name || 'app';
// BASE_PATH 通过环境变量配置：公网模式默认空字符串（根路径），盒子模式设为 /<appKey>
const BASE_PATH = process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : '/' + APP_KEY;

// HTTP 请求日志
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
}));

// 健康检查端点
app.get('/health', (req, res) => {
  const nacosStatus = nacosRegistry ? (nacosRegistry.enabled ? (nacosRegistry.isHealthy() ? 'ok' : 'failed') : 'disabled') : 'disabled';
  // NACOS_ENABLED=false 时也返回 disabled
  const healthy = nacosStatus === 'ok' || nacosStatus === 'disabled';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks: {
      server: 'ok',
      nacos: nacosStatus,
      uptime: process.uptime(),
    },
  });
});

const baseRouter = express.Router();

// 全局上下文中间件
app.use((req, res, next) => {
  req.context = {
    orgId: req.headers['ns-org-id'] ? parseInt(req.headers['ns-org-id'], 10) : null,
    userId: req.headers['ns-user-id'] ? parseInt(req.headers['ns-user-id'], 10) : null,
    username: req.headers['ns-username'] || null,
  };
  next();
});

// 中间件
baseRouter.use(cors());
baseRouter.use(express.json());

// 游戏 API
baseRouter.use('/game', gameRouter);

// 前端静态文件服务
const distPath = path.join(__dirname, '..', 'dist');
baseRouter.use(express.static(distPath, {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    if (!filePath.startsWith(path.join(distPath, 'assets'))) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA 路由回退
baseRouter.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// 挂载到 /<appKey>
app.use(BASE_PATH, baseRouter);

// Nacos 服务注册（延迟加载：仅在 NACOS_ENABLED !== 'false' 时 require 模块）
let nacosRegistry = null;
const nacosEnabled = process.env.NACOS_ENABLED !== 'false';

async function initNacos() {
  if (!nacosEnabled) {
    logger.info('[Nacos] 服务注册已禁用 (NACOS_ENABLED=false)');
    return;
  }
  try {
    // 延迟加载 nacos 模块，避免公网环境下 vendor 依赖问题
    const { NacosRegistry } = require('./nacos');
    nacosRegistry = new NacosRegistry({
      port: PORT,
      serviceName: process.env.NACOS_SERVICE_NAME || APP_KEY,
    });
    await nacosRegistry.start({
      appKey: APP_KEY,
      startTime: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, '[Nacos] 初始化失败');
  }
}

// 启动
const server = app.listen(PORT, async () => {
  logger.info({ port: PORT, appKey: APP_KEY, basePath: BASE_PATH }, 'Server started');
  logger.info(`  - Game API:  ${BASE_PATH}/game/`);
  await initNacos();
});

// 优雅关闭
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Starting graceful shutdown');
  server.close(async () => {
    logger.info('HTTP server closed');
    if (nacosRegistry) {
      await nacosRegistry.close();
    }
    process.exit(0);
  });
  // nacosRegistry 为 null 时跳过 close 调用（公网模式）
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
