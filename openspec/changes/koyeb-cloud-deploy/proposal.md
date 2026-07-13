## Why

当前项目依赖盒子内网环境（华为云私有镜像、Nacos 服务注册、cube-llm 本地大模型、cube-network 容器网络），无法直接部署到公网。用户希望将"谁是卧底"AI 对战游戏发布到公网供他人访问，需要将部署架构从盒子内网迁移到 Render 等容器云平台，同时将 LLM 调用从本地 cube-llm 切换为云端 API（如 DeepSeek / DashScope）。

## What Changes

- **BREAKING**: 替换 Dockerfile 基础镜像 — 从华为云私有镜像 `swr.cn-north-4.myhuaweicloud.com/xbh/node:18-alpine` 改为 Docker Hub 公共镜像 `node:18-alpine`
- **BREAKING**: 禁用 Nacos 服务注册 — 云环境无 Nacos，通过 `NACOS_ENABLED=false` 关闭，同时移除 `nacos-naming` 依赖的硬性引用（保留代码但不启动）
- **BREAKING**: LLM 后端迁移 — 从 `cube-llm:11435/v1`（盒子内网本地模型）切换为云端 OpenAI 兼容 API，通过环境变量 `LLM_BASE_URL` + `LLM_API_KEY` 配置（如 DeepSeek `https://api.deepseek.com/v1`）
- 移除 `chat_template_kwargs`（vLLM 扩展参数）— 云端 API（DeepSeek/DashScope）不识别此参数，需在 `llm-client.js` 中做条件判断或移除
- **BREAKING**: 移除 BASE_PATH 路由前缀 — 盒子网关使用 `/<appKey>/` 前缀路由，公网直连无需前缀，根路径 `/` 直接提供服务
- 简化 docker-compose.yml — 移除 cube-network 外部网络、db.config.json 挂载、Nacos 环境变量，保留健康检查和日志配置
- 新增 `.env.example` — 提供公网部署所需的环境变量模板（LLM_API_KEY、LLM_BASE_URL、LLM_MODEL_CHAT 等）
- 新增 `render.yaml` — Render Blueprint 配置文件，指定 Docker 构建、端口、健康检查、环境变量

## Capabilities

### New Capabilities
- `cloud-deploy`: 公网容器云部署能力，包括 Dockerfile 公网适配、环境变量驱动的 LLM 配置、无 Nacos 的独立运行模式、Render Blueprint 部署配置

### Modified Capabilities
（无已有 spec 能力修改 — 现有 `game-engine`、`ai-players`、`game-ui` 的需求不变，仅运行环境变化）

## Impact

- **Dockerfile**: 替换基础镜像（3 处 FROM），其余多阶段构建逻辑不变
- **server/llm-client.js**: 新增 `LLM_API_KEY` 环境变量支持；`chat_template_kwargs` 改为条件传递（仅在 LLM_PROVIDER=vllm 时发送）
- **server/index.js**: BASE_PATH 改为可配置，默认 `/`（公网模式），保留 `/<appKey>/` 兼容盒子模式
- **docker-compose.yml**: 移除 cube-network、Nacos 变量、db.config.json 挂载；新增 LLM_API_KEY 环境变量
- **vite.config.ts**: `base` 路径改为可配置，公网模式默认 `/`
- **src/services/gameApi.ts**: `API_BASE` 跟随 base 路径变化，公网模式为空字符串
- **新增文件**: `.env.example`、`render.yaml`
- **依赖变化**: `nacos-naming` 保留但在公网模式下不加载（延迟加载机制避免 vendor 路径问题）
- **环境变量新增**: `LLM_API_KEY`、`LLM_PROVIDER`（区分 vllm/cloud）、`PUBLIC_MODE`（是否公网模式）
