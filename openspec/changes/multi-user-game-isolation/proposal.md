## Why

当前游戏状态是模块级单例（`let game = createInitialGame()`），所有用户共享同一个游戏实例。两个用户同时访问就会串台——A 点开始游戏，B 看到的就是 A 的游戏。公网部署后必须支持多用户独立游戏。

同时，投票阶段虽然已使用 `Promise.all` 并行调用 LLM，但 DashScope API 有 QPS 限制（免费档约 2 并发），6 个并发请求可能触发 429 限流。需要加入并发控制（concurrency=2）避免限流。

## What Changes

- **BREAKING**: API 路由从 `/game/start` 改为 `/game/:gameId/start`，所有端点加入 `gameId` 路径参数
- **BREAKING**: 游戏引擎从单例 `let game` 改为 `Map<gameId, gameInstance>`，所有方法接受 `gameId` 参数
- 前端 `gameApi.ts` 使用 `crypto.randomUUID()` 在 `sessionStorage` 生成 gameId，所有请求 URL 带上 gameId
- 投票阶段加入并发控制（concurrency=2），将 6 个 LLM 请求分批执行避免 DashScope 429 限流
- 新增游戏实例清理机制：游戏结束后 5 分钟自动删除，或 30 分钟无活动自动清理
- 新增 `getGame(gameId)` 和 `deleteGame(gameId)` 引擎方法

## Capabilities

### New Capabilities
- `game-session`: 多用户游戏会话隔离，包括 gameId 生成与传递、Map 存储管理、自动清理机制

### Modified Capabilities
（现有 `game-engine`、`ai-players`、`game-ui` 的需求不变，仅实现层从单例改为多实例，不涉及行为变化）

## Impact

- **server/game/engine.js**: 核心改造 — 单例改为 `Map<gameId, game>`；所有导出函数签名增加 `gameId` 参数；新增 `getGame()`、`deleteGame()`、`cleanupStaleGames()` 方法；投票并发控制工具函数
- **server/routes/game.js**: 路由从 `/start` 改为 `/:gameId/start`（6 个端点全部改）；从 `req.params.gameId` 取 gameId 传入 engine
- **src/services/gameApi.ts**: `sessionStorage` 生成/读取 gameId；所有 fetch URL 加 `/${gameId}` 前缀
- **src/pages/GamePage.tsx**: 初始化时获取 gameId（从 gameApi 模块导出），无需额外逻辑
- **新增并发控制**: 在 `engine.js` 的 `executeVotes()` 中加入分批执行逻辑（每批 2 个，等待完成再下一批）
