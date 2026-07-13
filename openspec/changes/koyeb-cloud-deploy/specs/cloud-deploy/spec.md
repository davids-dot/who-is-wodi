## ADDED Requirements

### Requirement: Dockerfile 使用公共基础镜像
Dockerfile 中所有 FROM 指令 SHALL 使用 Docker Hub 公共镜像 `node:18-alpine`，不得引用私有镜像仓库地址。

#### Scenario: 公网环境构建
- **WHEN** 在 Koyeb 或任何公网环境执行 `docker build`
- **THEN** 所有基础镜像可从 Docker Hub 直接拉取，构建成功

#### Scenario: 盒子环境构建
- **WHEN** 在盒子环境执行 `docker build`
- **THEN** 使用相同的 Docker Hub 公共镜像构建，不再依赖华为云私有镜像仓库

### Requirement: Nacos 服务注册可通过环境变量禁用
系统 SHALL 通过 `NACOS_ENABLED` 环境变量控制 Nacos 服务注册的启停。当 `NACOS_ENABLED=false` 时，系统 SHALL 跳过 Nacos 初始化且不产生任何连接错误。

#### Scenario: 公网模式禁用 Nacos
- **WHEN** 环境变量 `NACOS_ENABLED=false` 时启动服务
- **THEN** 服务正常启动，不尝试连接 Nacos，健康检查端点返回 `nacos: disabled`

#### Scenario: 盒子模式启用 Nacos
- **WHEN** 环境变量 `NACOS_ENABLED=true`（或未设置）时启动服务
- **THEN** 服务正常初始化 Nacos 注册，行为与当前一致

### Requirement: Nacos 模块延迟加载
当 `NACOS_ENABLED=false` 时，系统 SHALL 不加载 `nacos.js` 模块（即不执行 `require('./nacos')`），避免因 `nacos-naming` 依赖问题导致启动失败。

#### Scenario: 公网模式无 Nacos 依赖
- **WHEN** `NACOS_ENABLED=false` 且 `nacos-naming` 包不可用
- **THEN** 服务正常启动，不抛出模块加载错误

### Requirement: LLM 客户端支持云端 API 鉴权
LLM 客户端 SHALL 通过 `LLM_API_KEY` 环境变量设置 API 密钥。当 `LLM_API_KEY` 未设置时，SHALL 回退为 `'not-needed'`（兼容盒子 cube-llm 无鉴权模式）。

#### Scenario: 使用 DeepSeek 云端 API
- **WHEN** 设置 `LLM_BASE_URL=https://api.deepseek.com/v1` 和 `LLM_API_KEY=sk-xxx`
- **THEN** OpenAI SDK 使用该 baseURL 和 apiKey 发起请求，成功获得 LLM 响应

#### Scenario: 使用盒子本地模型
- **WHEN** 设置 `LLM_BASE_URL=cube-llm:11435/v1` 且未设置 `LLM_API_KEY`
- **THEN** OpenAI SDK 使用 `'not-needed'` 作为 apiKey，行为与当前一致

### Requirement: vLLM 扩展参数条件传递
LLM 客户端 SHALL 仅在 `LLM_PROVIDER=vllm` 时传递 `chat_template_kwargs` 参数。当 `LLM_PROVIDER` 未设置或为其他值时，SHALL 不传递该参数。

#### Scenario: 云端 API 不传 vLLM 扩展参数
- **WHEN** `LLM_PROVIDER=deepseek`（或未设置）时调用 chat 函数
- **THEN** 请求参数中不包含 `chat_template_kwargs` 字段

#### Scenario: 盒子 vLLM 保留扩展参数
- **WHEN** `LLM_PROVIDER=vllm` 时调用 chat 函数
- **THEN** 请求参数中包含 `chat_template_kwargs: { enable_thinking: ... }`

### Requirement: 路由前缀可通过环境变量配置
系统 SHALL 通过 `BASE_PATH` 环境变量配置 Express 路由挂载前缀。当 `BASE_PATH` 未设置时，SHALL 使用空字符串（即根路径 `/`）。

#### Scenario: 公网模式根路径
- **WHEN** 未设置 `BASE_PATH` 环境变量
- **THEN** API 端点挂载到 `/game/...`，前端静态文件挂载到 `/`

#### Scenario: 盒子模式带前缀
- **WHEN** 设置 `BASE_PATH=/who-is-wodi`
- **THEN** API 端点挂载到 `/who-is-wodi/game/...`，前端静态文件挂载到 `/who-is-wodi/`

### Requirement: 前端 API 基础路径跟随部署模式
前端构建时 SHALL 通过 `VITE_BASE_PATH` 环境变量配置静态资源基础路径和 API 前缀。当未设置时默认为 `/`。

#### Scenario: 公网模式前端
- **WHEN** 前端构建时未设置 `VITE_BASE_PATH`
- **THEN** `vite.config.ts` 的 `base` 为 `/`，`gameApi.ts` 的 `API_BASE` 为 `/api`

#### Scenario: 盒子模式前端
- **WHEN** 前端构建时设置 `VITE_BASE_PATH=/who-is-wodi/`
- **THEN** `vite.config.ts` 的 `base` 为 `/who-is-wodi/`，`gameApi.ts` 的 `API_BASE` 为 `/api/who-is-wodi`

### Requirement: 提供公网部署环境变量模板
项目根目录 SHALL 包含 `.env.example` 文件，列出公网部署所需的全部环境变量及其说明。

#### Scenario: 用户参考模板配置
- **WHEN** 用户查看 `.env.example` 文件
- **THEN** 能看到 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL_CHAT`、`NACOS_ENABLED`、`BASE_PATH` 等变量的示例值和注释说明

### Requirement: docker-compose 适配公网独立运行
公网部署用的 docker-compose 配置 SHALL 不依赖外部网络（cube-network）和 Nacos 相关环境变量，SHALL 包含 LLM 相关环境变量。

#### Scenario: 公网 docker-compose 启动
- **WHEN** 使用公网配置的 docker-compose 启动容器
- **THEN** 容器不连接 cube-network，不尝试注册 Nacos，通过 LLM_API_KEY 调用云端 API

### Requirement: Koyeb 部署配置
项目 SHALL 包含 `koyeb.yaml` 配置文件，指定构建上下文、Dockerfile 路径和端口暴露。

#### Scenario: Koyeb 自动部署
- **WHEN** Koyeb 平台读取 `koyeb.yaml` 并执行部署
- **THEN** 成功构建 Docker 镜像，在端口 5201 启动服务，并通过 HTTP 健康检查验证服务可用性
