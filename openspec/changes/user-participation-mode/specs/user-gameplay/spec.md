## ADDED Requirements

### Requirement: 用户作为固定第 4 座位参与游戏
系统 SHALL 在游戏开始时将座位 4 分配给人类用户，其余 6 个座位为 AI 玩家（共 7 人）。用户 MAY 是平民或卧底，概率 1/7。用户的词语 SHALL 通过 `getPublicState()` 的 `myWord` 字段返回，仅用户可见。

#### Scenario: 游戏开始时分配座位
- **WHEN** 用户调用 `POST /:gameId/start`
- **THEN** 座位 4 的玩家 `isHuman` 为 `true`，`name` 为"你"，`avatar` 为"🎮"；其余 6 个座位为 AI 玩家（共 7 人）

#### Scenario: 用户获取自己的词
- **WHEN** 游戏开始后用户调用 `GET /:gameId/state`
- **THEN** 返回的 `myWord` 字段包含用户的词语，`myPlayerId` 为 4

### Requirement: 信息隔离 — 用户存活时隐藏敏感信息
当人类用户处于存活状态时，`getPublicState()` SHALL NOT 返回其他玩家的 `isUndercover` 和 `word` 字段，SHALL NOT 返回 `wordPair`。仅返回用户的词（`myWord`）。

#### Scenario: 用户存活时查看游戏状态
- **WHEN** 用户存活且游戏未结束时调用 `GET /:gameId/state`
- **THEN** 其他玩家的 `isUndercover` 为 `undefined`，`word` 为 `undefined`；`wordPair` 为 `null`；`myWord` 包含用户的词

#### Scenario: 用户被淘汰后解锁信息
- **WHEN** 用户被淘汰后调用 `GET /:gameId/state`
- **THEN** 所有玩家的 `isUndercover` 和 `word` 返回真实值；`wordPair` 返回完整词对

### Requirement: 描述阶段拆分为两段 SSE
描述阶段 SHALL 拆分为 `POST /:gameId/describe-batch`（SSE 流式）和 `POST /:gameId/user-describe`（用户提交文本）两个端点。第一个 `describe-batch` 流式输出座位 1-3 的 AI 描述后发送 `user_turn` 事件并结束。用户通过 `user-describe` 提交描述后，第二个 `describe-batch` 流式输出座位 5-7 的 AI 描述并结束。

#### Scenario: 第一段 SSE — AI 座位 1-3 描述
- **WHEN** 用户调用 `POST /:gameId/describe-batch`（用户存活）
- **THEN** SSE 依次输出座位 1、2、3 的 AI 描述，然后发送 `user_turn` 事件，SSE 结束

#### Scenario: 用户提交描述
- **WHEN** 用户调用 `POST /:gameId/user-describe`，body 包含 `{ text: "描述内容" }`
- **THEN** 系统将描述存入游戏实例的 `currentDescriptions`

#### Scenario: 第二段 SSE — AI 座位 5-6 描述
- **WHEN** 用户提交描述后调用 `POST /:gameId/describe-batch`（第二次）
- **THEN** SSE 依次输出座位 5、6 的 AI 描述，然后发送 `round_complete` 事件

#### Scenario: 用户被淘汰后描述阶段
- **WHEN** 用户被淘汰后调用 `POST /:gameId/describe-batch`
- **THEN** SSE 连续输出所有存活 AI 的描述（无 `user_turn` 中断），以 `round_complete` 结束

### Requirement: 投票阶段拆分为三步
投票阶段 SHALL 拆分为 `POST /:gameId/ai-vote`、`POST /:gameId/user-vote`、`POST /:gameId/vote-result` 三个端点。`ai-vote` 触发 AI 投票（concurrency 控制）并返回结果。`user-vote` 接收用户投票。`vote-result` 合并所有票数，执行淘汰，检查游戏结束。

#### Scenario: AI 投票
- **WHEN** 用户调用 `POST /:gameId/ai-vote`
- **THEN** 系统执行所有存活 AI 玩家的投票（concurrency=2），返回 AI 投票结果数组

#### Scenario: 用户提交投票
- **WHEN** 用户调用 `POST /:gameId/user-vote`，body 包含 `{ voteFor: "玩家名" }`
- **THEN** 系统将用户投票存入游戏实例

#### Scenario: 投票结果
- **WHEN** 用户提交投票后调用 `POST /:gameId/vote-result`
- **THEN** 系统合并 AI 和用户票数，淘汰得票最多者，检查游戏结束，返回淘汰结果和游戏状态

#### Scenario: 用户被淘汰后投票
- **WHEN** 用户被淘汰后调用 `POST /:gameId/ai-vote` 然后 `POST /:gameId/vote-result`（无需 user-vote）
- **THEN** 系统仅统计 AI 票数，执行淘汰

### Requirement: 用户离开页面触发游戏结束
系统 SHALL 提供 `POST /:gameId/abandon` 端点。前端 SHALL 在 `beforeunload` 事件中通过 `navigator.sendBeacon` 调用此端点。后端收到请求后 SHALL 将游戏状态设为 `GAME_OVER`，并根据用户角色决定胜方。

#### Scenario: 用户关闭页面
- **WHEN** 用户关闭或刷新页面，`beforeunload` 触发 `sendBeacon` 调用 `POST /:gameId/abandon`
- **THEN** 游戏状态变为 `GAME_OVER`，如果用户是卧底则平民胜，如果用户是平民则卧底胜

#### Scenario: 游戏结束后的清理
- **WHEN** `abandon` 请求触发游戏结束
- **THEN** 系统 5 分钟后自动清理该游戏实例（复用 `scheduleCleanup`）
