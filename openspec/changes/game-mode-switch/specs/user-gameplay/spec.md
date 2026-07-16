## MODIFIED Requirements

### Requirement: 用户作为固定第 4 座位参与游戏
系统 SHALL 在游戏模式为 `'participate'` 时将座位 4 分配给人类用户，其余 6 个座位为 AI 玩家（共 7 人）。用户 MAY 是平民或卧底，概率 1/7。用户的词语 SHALL 通过 `getPublicState()` 的 `myWord` 字段返回，仅用户可见。AI 观战模式（`'ai'`）下 SHALL NOT 分配人类座位，全部 7 个座位均为 AI 玩家。

#### Scenario: 参与模式游戏开始时分配座位
- **WHEN** 用户调用 `POST /:gameId/start`，mode 为 `'participate'`
- **THEN** 座位 4 的玩家 `isHuman` 为 `true`，`name` 为"你"，`avatar` 为"🎮"；其余 6 个座位为 AI 玩家（共 7 人）

#### Scenario: 观战模式游戏开始时无人类玩家
- **WHEN** 用户调用 `POST /:gameId/start`，mode 为 `'ai'`
- **THEN** 所有 7 个座位的 `isHuman` 均为 `false`，座位 4 为 AI 人设；`getPublicState()` 的 `myWord` 为 `null`，`myPlayerId` 为 `null`

#### Scenario: 参与模式用户获取自己的词
- **WHEN** 参与模式游戏开始后用户调用 `GET /:gameId/state`
- **THEN** 返回的 `myWord` 字段包含用户的词语，`myPlayerId` 为 4

### Requirement: 信息隔离 — 用户存活时隐藏敏感信息
当游戏模式为 `'participate'` 且人类用户处于存活状态时，`getPublicState()` SHALL NOT 返回其他玩家的 `isUndercover` 和 `word` 字段，SHALL NOT 返回 `wordPair`。仅返回用户的词（`myWord`）。AI 观战模式（`'ai'`）下 SHALL 始终返回全部信息（`showAll = true`）。

#### Scenario: 参与模式用户存活时查看游戏状态
- **WHEN** 参与模式用户存活且游戏未结束时调用 `GET /:gameId/state`
- **THEN** 其他玩家的 `isUndercover` 为 `undefined`，`word` 为 `undefined`；`wordPair` 为 `null`；`myWord` 包含用户的词

#### Scenario: 参与模式用户被淘汰后解锁信息
- **WHEN** 参与模式用户被淘汰后调用 `GET /:gameId/state`
- **THEN** 所有玩家的 `isUndercover` 和 `word` 返回真实值；`wordPair` 返回完整词对

#### Scenario: 观战模式始终可见全部信息
- **WHEN** AI 观战模式下调用 `GET /:gameId/state`
- **THEN** 所有玩家的 `isUndercover` 和 `word` 返回真实值；`wordPair` 返回完整词对；`myWord` 为 `null`

### Requirement: 描述阶段拆分为两段 SSE
当游戏模式为 `'participate'` 时，描述阶段 SHALL 拆分为 `POST /:gameId/describe-batch`（SSE 流式）和 `POST /:gameId/user-describe`（用户提交文本）两个端点。第一个 `describe-batch` 流式输出座位 1-3 的 AI 描述后发送 `user_turn` 事件并结束。用户通过 `user-describe` 提交描述后，第二个 `describe-batch` 流式输出座位 5-7 的 AI 描述并结束。AI 观战模式（`'ai'`）下，`describe-batch` SHALL 连续输出所有存活 AI 的描述（无 `user_turn` 中断），以 `round_complete` 结束。

#### Scenario: 参与模式第一段 SSE — AI 座位 1-3 描述
- **WHEN** 参与模式用户调用 `POST /:gameId/describe-batch`（用户存活）
- **THEN** SSE 依次输出座位 1、2、3 的 AI 描述，然后发送 `user_turn` 事件，SSE 结束

#### Scenario: 参与模式用户提交描述
- **WHEN** 参与模式用户调用 `POST /:gameId/user-describe`，body 包含 `{ text: "描述内容" }`
- **THEN** 系统将描述存入游戏实例的 `currentDescriptions`

#### Scenario: 参与模式第二段 SSE — AI 座位 5-7 描述
- **WHEN** 参与模式用户提交描述后调用 `POST /:gameId/describe-batch`（第二次）
- **THEN** SSE 依次输出座位 5、6、7 的 AI 描述，然后发送 `round_complete` 事件

#### Scenario: 观战模式连续 SSE 描述
- **WHEN** AI 观战模式下调用 `POST /:gameId/describe-batch`
- **THEN** SSE 连续输出所有存活 AI 的描述（无 `user_turn` 中断），以 `round_complete` 结束

#### Scenario: 参与模式用户被淘汰后描述阶段
- **WHEN** 参与模式用户被淘汰后调用 `POST /:gameId/describe-batch`
- **THEN** SSE 连续输出所有存活 AI 的描述（无 `user_turn` 中断），以 `round_complete` 结束

### Requirement: 投票阶段拆分为三步
当游戏模式为 `'participate'` 时，投票阶段 SHALL 拆分为 `POST /:gameId/ai-vote`、`POST /:gameId/user-vote`、`POST /:gameId/vote-result` 三个端点。AI 观战模式（`'ai'`）下，投票阶段 SHALL 仅调用 `POST /:gameId/ai-vote` 和 `POST /:gameId/vote-result`（无需 `user-vote`）。

#### Scenario: 参与模式 AI 投票
- **WHEN** 参与模式用户调用 `POST /:gameId/ai-vote`
- **THEN** 系统执行所有存活 AI 玩家的投票（concurrency=2），返回 AI 投票结果数组

#### Scenario: 参与模式用户提交投票
- **WHEN** 参与模式用户调用 `POST /:gameId/user-vote`，body 包含 `{ voteFor: "玩家名" }`
- **THEN** 系统将用户投票存入游戏实例

#### Scenario: 参与模式投票结果
- **WHEN** 参与模式用户提交投票后调用 `POST /:gameId/vote-result`
- **THEN** 系统合并 AI 和用户票数，淘汰得票最多者，检查游戏结束，返回淘汰结果和游戏状态

#### Scenario: 观战模式投票
- **WHEN** AI 观战模式下调用 `POST /:gameId/ai-vote` 然后 `POST /:gameId/vote-result`（无需 user-vote）
- **THEN** 系统仅统计 AI 票数，执行淘汰

#### Scenario: 参与模式用户被淘汰后投票
- **WHEN** 参与模式用户被淘汰后调用 `POST /:gameId/ai-vote` 然后 `POST /:gameId/vote-result`（无需 user-vote）
- **THEN** 系统仅统计 AI 票数，执行淘汰

### Requirement: 用户离开页面触发游戏结束
系统 SHALL 提供 `POST /:gameId/abandon` 端点。前端 SHALL 仅在 `'participate'` 模式下且用户存活时通过 `beforeunload` 事件中 `navigator.sendBeacon` 调用此端点。AI 观战模式（`'ai'`）下 SHALL NOT 调用 `abandon`。后端收到请求后 SHALL 将游戏状态设为 `GAME_OVER`，并根据用户角色决定胜方。

#### Scenario: 参与模式用户关闭页面
- **WHEN** 参与模式用户关闭或刷新页面，`beforeunload` 触发 `sendBeacon` 调用 `POST /:gameId/abandon`
- **THEN** 游戏状态变为 `GAME_OVER`，如果用户是卧底则平民胜，如果用户是平民则卧底胜

#### Scenario: 观战模式用户关闭页面
- **WHEN** AI 观战模式用户关闭或刷新页面
- **THEN** 前端 SHALL NOT 调用 `abandon` 端点，游戏实例在 30 分钟无活动后由定时清理机制自动删除

#### Scenario: 游戏结束后的清理
- **WHEN** `abandon` 请求触发游戏结束
- **THEN** 系统 5 分钟后自动清理该游戏实例（复用 `scheduleCleanup`）
