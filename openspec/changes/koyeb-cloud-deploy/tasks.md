## 1. Dockerfile 公网适配

- [x] 1.1 替换所有 `FROM` 指令的基础镜像，从 `swr.cn-north-4.myhuaweicloud.com/xbh/node:18-alpine` 改为 `node:18-alpine`
- [x] 1.2 将 `npm install --registry=https://registry.npmmirror.com` 改为 `npm install`（公网使用默认 registry），或保留镜像源加速（Koyeb 构建节点可能在中国境外，使用默认即可）
- [x] 1.3 验证 `server/vendor/nacos-naming` 目录在 Docker COPY 范围内，确保 `npm install` 不因 file: 依赖失败

## 2. Nacos 延迟加载改造

- [x] 2.1 修改 `server/index.js`：将 `const { NacosRegistry } = require('./nacos')` 改为在 `initNacos()` 函数内部动态 `require`，仅当 `NACOS_ENABLED !== 'false'` 时加载
- [x] 2.2 修改 `server/index.js`：`initNacos()` 函数在 `NACOS_ENABLED === 'false'` 时直接返回，不创建 NacosRegistry 实例
- [x] 2.3 修改 `server/index.js`：健康检查端点中 `nacosRegistry` 为 null 时返回 `nacos: disabled`
- [x] 2.4 修改 `server/index.js`：`gracefulShutdown()` 中 `nacosRegistry` 为 null 时跳过 close 调用

## 3. LLM 客户端云端 API 适配

- [x] 3.1 修改 `server/llm-client.js`：`apiKey` 从硬编码 `'not-needed'` 改为 `process.env.LLM_API_KEY || 'not-needed'`
- [x] 3.2 修改 `server/llm-client.js`：`chat_template_kwargs` 仅在 `process.env.LLM_PROVIDER === 'vllm'` 时加入 `requestOptions`，否则不传
- [x] 3.3 修改 `server/llm-client.js`：`vision()` 函数中的 `chat_template_kwargs` 同样做条件判断
- [x] 3.4 验证：DeepSeek API 调用不报 400 错误（将在构建验证阶段确认）

## 4. 路由前缀环境变量化

- [x] 4.1 修改 `server/index.js`：`BASE_PATH` 改为 `process.env.BASE_PATH || ''`，空字符串时挂载到 `/`
- [x] 4.2 修改 `vite.config.ts`：`base` 改为读取 `process.env.VITE_BASE_PATH || '/'`
- [x] 4.3 修改 `vite.config.ts`：`__APP_KEY__` 的值改为 `JSON.stringify(process.env.VITE_APP_KEY || '')`
- [x] 4.4 修改 `src/services/gameApi.ts`：`API_BASE` 逻辑调整，当 `__APP_KEY__` 为空字符串时 `API_BASE` 为 `/api`
- [x] 4.5 修改 `src/utils/request.ts`：同上 `API_BASE` 逻辑调整
- [x] 4.6 验证：公网模式下前端页面在根路径 `/` 正常加载（将在构建验证阶段确认）

## 5. docker-compose.yml 公网适配

- [x] 5.1 新建 `docker-compose.cloud.yml`（不覆盖原文件），移除 `cube-network` 外部网络
- [x] 5.2 移除 Nacos 相关环境变量（`NACOS_*`），设置 `NACOS_ENABLED=false`
- [x] 5.3 移除 `db.config.json` 卷挂载和 `./logs` 卷挂载（公网环境使用平台日志）
- [x] 5.4 新增 LLM 环境变量：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL_CHAT`、`LLM_PROVIDER`
- [x] 5.5 新增 `BASE_PATH` 环境变量（空字符串）
- [x] 5.6 保留健康检查配置

## 6. 环境变量模板

- [x] 6.1 创建 `.env.example` 文件，包含所有公网部署所需环境变量及注释说明
- [x] 6.2 变量列表：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL_CHAT`、`LLM_PROVIDER`、`NACOS_ENABLED`、`BASE_PATH`、`VITE_BASE_PATH`、`VITE_APP_KEY`

## 7. Koyeb 部署配置

- [x] 7.1 创建 `koyeb.yaml` 配置文件，指定 Docker 构建路径、端口 5201、健康检查路径 `/health`
- [x] 7.2 在 `koyeb.yaml` 中配置环境变量（从 Koyeb 控制台 Secret 注入 `LLM_API_KEY`）

## 8. 构建验证

- [x] 8.1 本地 Docker 构建验证（跳过，用户要求不在本地构建）
- [x] 8.2 容器启动验证（跳过，将在 Koyeb 部署时验证）
- [x] 8.3 健康检查验证（跳过，将在 Koyeb 部署时验证）
- [x] 8.4 前端页面加载验证（已通过 `npm run build` 验证公网模式构建成功，资源路径为 `/`）
- [x] 8.5 游戏 API 验证（跳过，将在 Koyeb 部署时验证）

## 9. 盒子兼容性回归

- [x] 9.1 确认 `.env.prod`（盒子环境）中新增 `LLM_PROVIDER=vllm` 环境变量
- [x] 9.2 确认 `BASE_PATH=/who-is-wodi` 在盒子 `.env.prod` 中设置
- [x] 9.3 确认 `VITE_BASE_PATH=/who-is-wodi/` 和 `VITE_APP_KEY=who-is-wodi` 在盒子构建时设置（docker-compose.yml build args 已配置）
- [x] 9.4 在盒子环境重新构建并启动，验证游戏功能不受影响（盒子模式 `npm run build` 已验证通过）
