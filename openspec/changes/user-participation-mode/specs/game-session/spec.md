## MODIFIED Requirements

### Requirement: 每个用户拥有独立游戏实例
系统 SHALL 使用 `Map<gameId, gameInstance>` 存储多个游戏实例。每个 gameId 对应一个独立游戏。游戏实例 SHALL 包含 `humanPlayerId` 字段标识人类玩家座位（固定为 4）。

#### Scenario: 两个用户同时开始游戏
- **WHEN** 用户 A 和用户 B 同时调用 `POST /game/<gameIdA>/start` 和 `POST /game/<gameIdB>/start`
- **THEN** 系统创建两个独立游戏实例，A 的操作不影响 B 的游戏状态，各自的 `humanPlayerId` 均为 4

#### Scenario: 用户刷新页面
- **WHEN** 用户刷新浏览器页面（同一 tab）
- **THEN** `sessionStorage` 保留 gameId，后续请求继续操作同一游戏实例

### Requirement: 获取游戏状态支持信息隔离
`getPublicState(gameId)` SHALL 根据人类用户的存活状态返回不同信息。用户存活时隐藏其他玩家的 `isUndercover`、`word` 和 `wordPair`；用户被淘汰或游戏结束时返回完整信息。

#### Scenario: 用户存活时获取状态
- **WHEN** 人类用户存活且游戏未结束时调用 `GET /:gameId/state`
- **THEN** 返回的 `players` 数组中，其他玩家的 `isUndercover` 为 `undefined`，`word` 为 `undefined`；`wordPair` 为 `null`；新增 `myWord`（用户的词）和 `myPlayerId`（固定 4）

#### Scenario: 用户被淘汰后获取状态
- **WHEN** 人类用户被淘汰后调用 `GET /:gameId/state`
- **THEN** 返回所有玩家的真实 `isUndercover` 和 `word`，`wordPair` 包含完整词对

### Requirement: 游戏实例自动清理
系统 SHALL 在游戏结束后 5 分钟自动删除对应游戏实例。系统 SHALL 每 10 分钟扫描一次所有游戏实例，删除超过 30 分钟无活动的实例。`abandonGame()` 触发的游戏结束也 SHALL 调用 `scheduleCleanup()`。

#### Scenario: 用户离开后清理
- **WHEN** 用户离开页面触发 `abandon` 请求
- **THEN** 游戏 5 分钟后自动从 Map 中删除

#### Scenario: 活跃游戏不被清理
- **WHEN** 某游戏实例在 30 分钟内有 API 请求活动
- **THEN** 定时扫描任务保留该实例
