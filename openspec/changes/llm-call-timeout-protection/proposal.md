## Why

DashScope `qwen3.6-flash` 模型存在偶发性流式响应挂起问题——LLM 调用发出后服务端不返回任何 chunk，连接无限等待。当前代码（`llm-client.js` 和 `engine.js`）没有任何超时或重试机制，一旦某个玩家的 LLM 调用挂起，整个 SSE 流和后续所有玩家全部卡死，游戏无法继续。

## What Changes

- 在 `llm-client.js` 的流式 `chat()` 函数中添加 **总超时**（默认 30s）和 **空闲超时**（默认 15s，两个 chunk 之间最大间隔），超时后主动 abort 连接并抛出 `LLM_TIMEOUT` 错误
- 在 `engine.js` 的 `generateDescription()` 中添加 **自动重试**（默认 1 次），超时后重试一次 LLM 调用；重试仍失败则抛出错误
- 在 `engine.js` 的 `generateVote()` 中添加相同的超时与重试保护
- 在路由层 SSE 流（`describe-batch` 和 `next-round`）中添加 **单玩家容错**：某个玩家描述超时且重试失败后，发送 error 事件并跳过该玩家，继续下一个玩家，避免整条 SSE 流中断
- 超时阈值通过环境变量 `LLM_TIMEOUT_MS`（总超时）和 `LLM_IDLE_TIMEOUT_MS`（空闲超时）可配置，提供合理默认值

## Capabilities

### New Capabilities
- `llm-resilience`: LLM 调用的超时保护与重试机制，覆盖流式和非流式调用，确保单次 LLM 调用不会无限挂起

### Modified Capabilities
- `game-engine`: 描述生成和投票生成的容错行为变更——单玩家 LLM 失败不再中断整轮流程，而是跳过该玩家继续

## Impact

- **代码文件**:
  - `server/llm-client.js` — 流式 chat() 添加超时 + abort 逻辑
  - `server/game/engine.js` — `generateDescription()` 和 `generateVote()` 添加重试 + 超时错误处理
  - `server/routes/game.js` — SSE 流添加单玩家容错，error 后继续下一个玩家
- **环境变量**: 新增 `LLM_TIMEOUT_MS`（默认 30000）和 `LLM_IDLE_TIMEOUT_MS`（默认 15000）
- **API 行为**: SSE 流新增 `player_error` 事件类型（某玩家超时跳过时发送），前端需处理该事件并展示提示
- **依赖**: 无新依赖，使用 Node.js 原生 `AbortController` + `setTimeout`
