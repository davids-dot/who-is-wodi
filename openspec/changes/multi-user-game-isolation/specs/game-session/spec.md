## ADDED Requirements

### Requirement: 每个用户拥有独立游戏实例
系统 SHALL 使用 `Map<gameId, gameInstance>` 存储多个游戏实例，每个 gameId 对应一个独立游戏。不同 gameId 的游戏状态互不影响。

#### Scenario: 两个用户同时开始游戏
- **WHEN** 用户 A 和用户 B 同时调用 `POST /game/<gameIdA>/start` 和 `POST /game/<gameIdB>/start`
- **THEN** 系统创建两个独立游戏实例，A 的操作不影响 B 的游戏状态

#### Scenario: 用户刷新页面
- **WHEN** 用户刷新浏览器页面（同一 tab）
- **THEN** `sessionStorage` 保留 gameId，后续请求继续操作同一游戏实例

#### Scenario: 用户打开新标签页
- **WHEN** 用户在同一浏览器打开新标签页
- **THEN** 新 tab 生成新的 gameId，创建独立游戏实例，与旧 tab 互不干扰

### Requirement: gameId 通过 URL 路径参数传递
所有游戏 API 端点 SHALL 在 URL 路径中包含 `gameId` 参数，格式为 `/game/:gameId/<action>`。

#### Scenario: 前端发起 API 请求
- **WHEN** 前端调用任意游戏 API（start、next-round、vote、state、history、reset）
- **THEN** 请求 URL 包含 gameId 路径段，如 `POST /game/abc-123/start`

#### Scenario: 后端路由解析 gameId
- **WHEN** Express 路由匹配 `/:gameId/start`
- **THEN** `req.params.gameId` 包含 gameId 字符串，传递给引擎方法

### Requirement: gameId 在前端生成并存储于 sessionStorage
前端 SHALL 在模块初始化时使用 `crypto.randomUUID()` 生成 gameId，并存储在 `sessionStorage` 中。后续所有 API 请求从 `sessionStorage` 读取 gameId 并拼入 URL。

#### Scenario: 首次访问页面
- **WHEN** 用户首次打开页面，`sessionStorage` 中无 gameId
- **THEN** 前端调用 `crypto.randomUUID()` 生成 gameId，存入 `sessionStorage`，用于后续所有 API 请求

#### Scenario: gameId 已存在
- **WHEN** 用户刷新页面，`sessionStorage` 中已有 gameId
- **THEN** 前端复用已有 gameId，不重新生成

### Requirement: 游戏实例延迟创建
后端 SHALL 在首次收到某个 gameId 的请求时自动创建游戏实例。不需要显式的"创建游戏"接口。

#### Scenario: 首次请求自动创建
- **WHEN** 后端收到 `POST /game/<newGameId>/start`，且 `games` Map 中不存在该 gameId
- **THEN** 系统自动创建初始游戏实例并存入 Map，然后执行 startGame 逻辑

#### Scenario: 已存在 gameId 复用
- **WHEN** 后端收到 `GET /game/<existingGameId>/state`，且 Map 中已存在该 gameId
- **THEN** 系统直接返回该游戏实例的状态

### Requirement: 投票 LLM 调用并发控制
系统 SHALL 限制投票阶段的 LLM 并发请求数量，默认每批 2 个并发请求，批次间串行等待。并发数可通过 `LLM_CONCURRENCY` 环境变量配置。

#### Scenario: 6 个 AI 玩家投票（concurrency=2）
- **WHEN** `LLM_CONCURRENCY=2`（或未设置，默认 2）时执行投票
- **THEN** 6 个投票请求分为 3 批执行，每批 2 个并行，批次间串行等待

#### Scenario: 自定义并发数
- **WHEN** 设置 `LLM_CONCURRENCY=3` 时执行投票
- **THEN** 6 个投票请求分为 2 批执行，第一批 3 个并行，第二批 3 个并行

### Requirement: 游戏实例自动清理
系统 SHALL 在游戏结束后 5 分钟自动删除对应游戏实例。系统 SHALL 每 10 分钟扫描一次所有游戏实例，删除超过 30 分钟无活动的实例。

#### Scenario: 游戏结束后定时清理
- **WHEN** 游戏状态变为 `GAME_OVER`
- **THEN** 系统 5 分钟后自动从 Map 中删除该游戏实例

#### Scenario: 长时间无活动清理
- **WHEN** 某游戏实例超过 30 分钟没有任何 API 请求
- **THEN** 定时扫描任务将该实例从 Map 中删除

#### Scenario: 活跃游戏不被清理
- **WHEN** 某游戏实例在 30 分钟内有 API 请求活动
- **THEN** 定时扫描任务保留该实例
