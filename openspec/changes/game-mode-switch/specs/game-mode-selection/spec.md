## ADDED Requirements

### Requirement: 用户在开始游戏前选择游戏模式
系统 SHALL 在游戏开始前提供两种模式选择：「AI 观战」（`'ai'`）和「亲自参与」（`'participate'`）。模式选择 SHALL 通过 `POST /:gameId/start` 请求 body 中的 `mode` 字段传递给后端。未传 `mode` 时 SHALL 默认为 `'participate'`。

#### Scenario: 选择 AI 观战模式
- **WHEN** 用户选择「AI 观战」模式并点击开始游戏
- **THEN** 前端调用 `POST /:gameId/start`，body 包含 `{ mode: 'ai' }`，后端使用 7 个 AI 玩家初始化游戏实例

#### Scenario: 选择亲自参与模式
- **WHEN** 用户选择「亲自参与」模式并点击开始游戏
- **THEN** 前端调用 `POST /:gameId/start`，body 包含 `{ mode: 'participate' }`，后端使用 6 AI + 1 人类玩家初始化游戏实例

#### Scenario: 未传 mode 字段时的默认行为
- **WHEN** 前端调用 `POST /:gameId/start` 且 body 中未包含 `mode` 字段
- **THEN** 后端 SHALL 使用 `'participate'` 模式初始化游戏

### Requirement: 游戏实例存储模式信息
游戏实例 SHALL 存储 `mode` 字段（`'ai'` 或 `'participate'`）。`getPublicState()` SHALL 在返回结果中包含 `mode` 字段。重置游戏时 SHALL 接受新的 `mode` 参数。

#### Scenario: 游戏状态返回模式信息
- **WHEN** 前端调用 `GET /:gameId/state` 获取游戏状态
- **THEN** 返回的 JSON 中 SHALL 包含 `mode` 字段，值为 `'ai'` 或 `'participate'`

#### Scenario: 重置游戏时切换模式
- **WHEN** 前端调用 `POST /:gameId/reset`，body 包含 `{ mode: 'ai' }`
- **THEN** 游戏实例 SHALL 以 AI 观战模式重新初始化，`mode` 字段更新为 `'ai'`

### Requirement: AI 观战模式玩家阵容
AI 观战模式 SHALL 使用 7 个 AI 玩家（无 `isHuman` 标志）。座位 4 在观战模式 SHALL 使用独立的 AI 人设，而非人类玩家「你」。

#### Scenario: AI 观战模式初始化玩家
- **WHEN** `startGame(gameId, 'ai')` 被调用
- **THEN** 游戏实例的 `players` 数组 SHALL 包含 7 个玩家，所有玩家的 `isHuman` 均为 `false`，座位 4 为 AI 人设

#### Scenario: 参与模式初始化玩家
- **WHEN** `startGame(gameId, 'participate')` 被调用
- **THEN** 游戏实例的 `players` 数组 SHALL 包含 7 个玩家，其中座位 4 的 `isHuman` 为 `true`，`name` 为「你」
