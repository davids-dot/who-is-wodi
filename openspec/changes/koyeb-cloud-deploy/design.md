## Context

"谁是卧底"AI 对战游戏当前运行在盒子内网环境中，依赖以下盒子专属基础设施：
- **华为云私有镜像仓库** (`swr.cn-north-4.myhuaweicloud.com/xbh/node:18-alpine`) — 公网无法访问
- **Nacos 服务注册** — 盒子网关通过 Nacos 自动发现服务并路由，公网无此组件
- **cube-llm 本地大模型** (`cube-llm:11435/v1`) — 盒子上运行的 vLLM 服务，使用 Qwen3.6-35B-A3B 模型
- **cube-network Docker 网络** — 盒子内容器互联的外部网络
- **网关路由前缀** (`/<appKey>/`) — 盒子 Spring Cloud Gateway 的路由规则

项目使用 SSE（Server-Sent Events）进行流式通信，非 WebSocket，适合常驻进程模式部署。

## Goals / Non-Goals

**Goals:**
- 使项目可在 Koyeb 等 Docker 容器云平台上一键部署
- LLM 调用切换为云端 API（DeepSeek / DashScope），无需本地 GPU
- 保留盒子内网部署的兼容性（通过环境变量切换模式）
- 前后端一体的 Docker 部署架构不变（单容器、单端口）
- 零停机迁移：盒子用户不受影响，公网用户获得独立实例

**Non-Goals:**
- 不拆分前后端为独立服务（单容器足够）
- 不引入数据库（游戏状态仍为内存存储）
- 不实现用户认证/多租户（当前阶段为公开展示）
- 不做 CDN 加速（Koyeb 自带全球边缘网络）
- 不做自动化 CI/CD 流水线（手动推送镜像或连接 GitHub 自动构建）

## Decisions

### 1. 基础镜像替换为 Docker Hub 公共镜像

**选择**: `node:18-alpine`（Docker Hub 官方）

**替代方案**: 
- `node:18-slim` — 体积更大（~150MB vs ~80MB），无优势
- `node:20-alpine` — 可用但项目未测试 Node 20，保守选择 18

**理由**: Docker Hub 官方镜像在所有容器云平台都可直接拉取，无需认证。

### 2. Nacos 依赖处理 — 延迟加载 + 环境变量开关

**选择**: 保留 `nacos.js` 代码和 `nacos-naming` 依赖，但将 `require('./nacos')` 改为延迟加载（`NACOS_ENABLED !== 'false'` 时才加载）

**替代方案**:
- 完全移除 nacos 代码 — 破坏盒子兼容性，不可取
- 将 nacos-naming 改为 optionalDependencies — npm 不保证可选依赖安装成功，不可靠

**理由**: `nacos-naming` 使用 `file:vendor/nacos-naming` 本地路径依赖，在 Koyeb 构建环境中 `vendor/` 目录存在（在 COPY 范围内），npm install 会正常安装。关键问题是 gRPC 连接 Nacos 失败会阻塞启动 — 通过 `NACOS_ENABLED=false` 跳过整个初始化即可。延迟加载确保即使在 `NACOS_ENABLED=false` 时也不会因 require 失败而崩溃。

### 3. LLM 客户端适配 — 双模式（vLLM / Cloud API）

**选择**: 在 `llm-client.js` 中新增 `LLM_API_KEY` 环境变量，`chat_template_kwargs` 仅在 `LLM_PROVIDER=vllm` 时传递

**替代方案**:
- 完全移除 `chat_template_kwargs` — 丢失盒子环境的思考模式功能
- 新建独立的 `llm-client-cloud.js` — 代码重复，维护成本高

**理由**: DeepSeek / DashScope 的 OpenAI 兼容 API 不识别 `chat_template_kwargs` 参数，传递会导致 400 错误。通过 `LLM_PROVIDER` 环境变量区分，盒子端设 `vllm`（或不设，默认兼容），公网设 `deepseek` 或 `dashscope`。同时 `apiKey` 从硬编码 `'not-needed'` 改为读取 `LLM_API_KEY` 环境变量。

### 4. 路由前缀 — 环境变量驱动，默认根路径

**选择**: 新增 `BASE_PATH` 环境变量，默认空字符串（根路径 `/`），盒子模式设为 `/<appKey>`

**替代方案**:
- 硬编码根路径 — 破坏盒子兼容性
- 用 `PUBLIC_MODE` 布尔值切换 — 语义不如直接配 `BASE_PATH` 清晰

**理由**: 盒子网关需要 `/<appKey>/` 前缀路由到正确服务，公网直连无需前缀。前后端需同步调整：
- 后端 `server/index.js`：`app.use(BASE_PATH, baseRouter)` → `BASE_PATH` 为空时挂载到 `/`
- 前端 `vite.config.ts`：`base` 改为读取 `VITE_BASE_PATH` 环境变量，默认 `/`
- 前端 `gameApi.ts`：`API_BASE` 跟随 `__APP_KEY__` 变化，公网模式下 `__APP_KEY__` 为空

### 5. 部署平台 — Koyeb

**选择**: Koyeb 作为首选部署平台

**替代方案**:
- Render — 免费 Web Service 30分钟休眠，冷启动慢
- Fly.io — 需要安装 flyctl CLI，配置较复杂
- Zeabur — 免费额度较小，且面向亚太用户延迟较高
- Railway — 无免费额度

**理由**: Koyeb 提供免费 Eco 实例（512MB RAM），支持 Docker 直接部署，不休眠，全球 CDN，GitHub 自动构建。适合低流量展示型应用。

### 6. nacos-naming vendor 依赖处理

**选择**: 保留 `server/vendor/nacos-naming` 目录在 Docker 构建上下文中

**风险**: `server/package.json` 中 `"nacos-naming": "file:vendor/nacos-naming"` 在 `npm install` 时需要该目录存在。当前 Dockerfile `COPY server/ .` 已包含 vendor 目录，无需额外处理。

**验证点**: 需确认 vendor 目录中包含 `package.json`（npm file: 依赖的必要文件）。

## Risks / Trade-offs

- **[LLM API 费用]** → DeepSeek API 价格极低（~0.001元/千token），单局游戏约 6 次描述 + 6 次投票 ≈ 5000 token，成本约 0.005 元/局。可通过 Rate Limiting 控制。
- **[512MB 内存限制]** → Koyeb 免费实例 512MB RAM，Node.js + Express + OpenAI SDK 基础占用约 80MB，单局游戏内存存储 < 1MB，余量充足。
- **[SSE 超时]** → Koyeb 默认请求超时可能短于 SSE 描述阶段（6 个 AI 依次描述，每个 5-10 秒，总计 30-60 秒）。→ 在 Koyeb 配置中设置 `request_timeout: 120s`。
- **[nacos-naming 安装失败]** → 如果 vendor 目录不完整，`npm install` 会失败。→ 在 Dockerfile 中添加 `|| true` 容错（仅公网模式），或通过 `.env` 控制 `npm install --omit=optional`。
- **[前后端 BASE_PATH 不同步]** → 如果前端构建时的 `VITE_BASE_PATH` 与后端 `BASE_PATH` 不一致，路由会 404。→ 通过 Docker 构建参数统一传入。
- **[无持久化]** → 游戏状态在内存中，容器重启后丢失。→ 当前阶段可接受（展示型应用），后续可加 Redis。
