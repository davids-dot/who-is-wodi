## Context

当前「谁是卧底」游戏使用 DashScope `qwen3.6-flash` 模型作为 LLM 后端。在 AI 观战模式下，7 个 AI 玩家依次流式生成描述。经测试发现，DashScope 偶发性地不返回流式 chunk（连接挂起），导致：

1. `llm-client.js` 的 `for await (const chunk of streamResponse)` 无限等待
2. `engine.js` 的 `generateDescription()` async generator 挂起
3. 路由层 SSE 流阻塞，后续玩家无法继续
4. 前端表现为游戏卡在某玩家"描述中"状态

**根因**：DashScope SSE 流在某些条件下（如偶发服务端错误、连接池复用问题）不发送任何 chunk 也不关闭连接，而 OpenAI SDK v5 没有内置的流式超时机制。

## Goals / Non-Goals

**Goals:**
- 确保 LLM 流式调用在合理时间内超时（默认总超时 30s，空闲超时 15s）
- 超时后自动重试 1 次，提高成功率
- 重试仍失败时，跳过当前玩家继续流程，不中断整轮游戏
- 超时阈值通过环境变量可配置，适配不同 provider（盒子本地模型 vs DashScope 云端）
- 前端能感知玩家被跳过的事件

**Non-Goals:**
- 不修改 LLM provider 切换逻辑（已有 `LLM_PROVIDER` 环境变量）
- 不做 LLM 调用的熔断器（circuit breaker）模式——当前并发量低（2 并发），不需要
- 不处理 DashScope 429 限流（已有 `LLM_CONCURRENCY=2` 控制并发）
- 不修改非流式调用的超时（非流式调用由 SDK 内置 timeout 控制，问题集中在流式）

## Decisions

### 决策1: 使用 AbortController 实现流式超时

**选择**: 在 `llm-client.js` 中使用 `AbortController` + `setTimeout` 实现两层超时：
- **总超时**（`LLM_TIMEOUT_MS`，默认 30000ms）：从调用开始到整个流结束的最大时间
- **空闲超时**（`LLM_IDLE_TIMEOUT_MS`，默认 15000ms）：两个 chunk 之间的最大间隔时间

**理由**: OpenAI SDK v5 的 `chat.completions.create()` 支持 `signal` 参数（`AbortSignal`），传入后可在 abort 时中断流式连接。这是 SDK 官方推荐的取消机制。

**替代方案**:
- ❌ `Promise.race` + setTimeout：无法真正中断底层 fetch 连接，只是丢弃结果，连接仍占用
- ❌ 修改 SDK 源码：维护成本高，升级风险大

### 决策2: 超时后重试 1 次

**选择**: 在 `engine.js` 的 `generateDescription()` 和 `generateVote()` 中，捕获 `LLM_TIMEOUT` 错误后自动重试 1 次。

**理由**: DashScope 挂起是偶发性的（约 1/7 概率），重试 1 次通常能成功。不做更多重试避免延迟过长（30s 超时 + 30s 重试 = 最坏 60s）。

**替代方案**:
- ❌ 不重试，直接跳过：用户体验差，每轮都可能有人被跳过
- ❌ 重试 3 次：最坏 90s 延迟，用户等不及
- ❌ 指数退避重试：对于偶发性挂起不适用，第一次重试就应该立即发

### 决策3: 路由层单玩家容错

**选择**: 在 `routes/game.js` 的 SSE 流中，将 `for await (const chunk of gen)` 包裹在 try-catch 中。如果某玩家描述超时且重试失败：
1. 发送 `player_error` SSE 事件（含玩家信息和错误消息）
2. 跳过该玩家，继续下一个玩家

**理由**: 一个玩家卡住不应该中断整轮 7 个玩家的流程。跳过该玩家后，其他玩家仍能正常描述和投票。

**替代方案**:
- ❌ 整轮重试：延迟太长，且已有 3 个玩家描述成功
- ❌ 用默认描述替代（如"这个物品很常见"）：可能暴露卧底身份信息

### 决策4: 空闲超时重置机制

**选择**: 每收到一个 chunk 就重置空闲超时计时器。总超时不重置，从调用开始计时。

**理由**: 流式调用中 chunk 之间可能有正常间隔（模型在生成），空闲超时只针对"完全无响应"的情况。总超时防止极端情况（如 chunk 很慢但不断、永远不结束）。

## Risks / Trade-offs

- **[风险] 被跳过的玩家无描述，投票阶段信息不完整** → 缓解：跳过的玩家在投票阶段仍可被投票，但自身无法参与投票（也用超时保护）。前端展示"该玩家超时未描述"提示。
- **[风险] 30s 总超时对于某些复杂 prompt 可能不够** → 缓解：通过环境变量 `LLM_TIMEOUT_MS` 可调整，盒子本地模型可设更大值。
- **[权衡] 重试增加延迟** → 最坏情况 30s + 30s = 60s 一个玩家。但相比无限等待，60s 是可接受的。
- **[风险] AbortController 在 Node.js 18+ 才稳定** → 当前运行环境 Node.js v22.21.1，无兼容性问题。
