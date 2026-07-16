## ADDED Requirements

### Requirement: AI 描述间思考间隔
系统 SHALL 在 SSE 描述流中，每个 AI 玩家描述结束后、下一个 AI 玩家描述开始前，发送 `thinking` SSE 事件并等待 2 秒。`thinking` 事件 SHALL 包含下一个要描述的玩家的 `playerId` 和 `playerName`。

#### Scenario: 两个 AI 描述之间的思考间隔
- **WHEN** AI 玩家 A 描述结束（`describe_end` 事件发送后），下一个 AI 玩家 B 尚未开始描述
- **THEN** 系统发送 `thinking` 事件（包含玩家 B 的 id 和 name），等待 2 秒后发送玩家 B 的 `describe_start` 事件

#### Scenario: 用户回合前的思考间隔
- **WHEN** AI 座位 3 描述结束，下一个是用户（座位 4）
- **THEN** 系统发送 `thinking` 事件（包含用户信息），等待 2 秒后发送 `user_turn` 事件

#### Scenario: 用户回合后的思考间隔
- **WHEN** 用户提交描述后，第一个 AI（座位 5）开始描述前
- **THEN** 第二段 SSE 开始时先发送 `thinking` 事件（包含座位 5 玩家信息），等待 2 秒后开始描述

### Requirement: 前端显示思考动画
前端 SHALL 在收到 `thinking` SSE 事件时，显示对应玩家的"正在思考..."动画状态，持续到收到该玩家的 `describe_start` 事件。

#### Scenario: 前端收到 thinking 事件
- **WHEN** 前端收到 `thinking` 事件，data 包含 `{ playerId: 2, playerName: "小美" }`
- **THEN** 前端在玩家 2 的位置显示"小美 正在思考..."状态

#### Scenario: thinking 结束转为描述中
- **WHEN** 前端收到同一玩家的 `describe_start` 事件
- **THEN** "正在思考..."状态消失，显示流式描述内容
