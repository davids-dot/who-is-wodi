## 1. 引擎层 — Map 存储与 gameId 参数化

- [x] 1.1 将 `let game = createInitialGame()` 替换为 `const games = new Map()`，新增 `getGame(gameId)` 方法（延迟创建：Map 中不存在时调用 `createInitialGame()` 并存入）
- [x] 1.2 新增 `deleteGame(gameId)` 方法，从 Map 中删除指定游戏实例
- [x] 1.3 为每个游戏实例新增 `lastActivity` 时间戳字段，在 `getGame()` 和所有写操作中更新
- [x] 1.4 将 `startGame()` 改为 `startGame(gameId)`，内部通过 `getGame(gameId)` 获取实例
- [x] 1.5 将 `nextRound()` 改为 `nextRound(gameId)`
- [x] 1.6 将 `generateDescription(player)` 改为 `generateDescription(gameId, player)`，内部通过 `getGame(gameId)` 获取实例
- [x] 1.7 将 `executeVotes()` 改为 `executeVotes(gameId)`
- [x] 1.8 将 `eliminatePlayer()` 改为 `eliminatePlayer(gameId)`
- [x] 1.9 将 `checkGameOver()` 改为 `checkGameOver(gameId)`
- [x] 1.10 将 `resetGame()` 改为 `resetGame(gameId)`，重新创建实例替换 Map 中的旧实例
- [x] 1.11 将 `getPublicState()` 改为 `getPublicState(gameId)`
- [x] 1.12 将 `getHistory()` 改为 `getHistory(gameId)`
- [x] 1.13 将 `getAlivePlayers()` 改为 `getAlivePlayers(gameId)`
- [x] 1.14 更新 `module.exports` 中所有函数签名为带 `gameId` 参数

## 2. 引擎层 — 投票并发控制

- [x] 2.1 新增 `runWithConcurrency(items, concurrency, fn)` 工具函数，将数组分批执行，每批 `concurrency` 个并行
- [x] 2.2 修改 `executeVotes(gameId)` 中的 `Promise.all(votePromises)` 改为 `runWithConcurrency(alivePlayers, LLM_CONCURRENCY, generateVote)`，其中 `LLM_CONCURRENCY` 从 `process.env.LLM_CONCURRENCY || 2` 读取
- [x] 2.3 验证：6 个玩家分 3 批执行，每批 2 个并行

## 3. 引擎层 — 内存清理

- [x] 3.1 新增 `cleanupStaleGames()` 方法，遍历 `games` Map，删除 `lastActivity` 超过 30 分钟的实例
- [x] 3.2 新增 `scheduleCleanup(gameId)` 方法，`GAME_OVER` 时 `setTimeout(5min)` 后调用 `deleteGame(gameId)`
- [x] 3.3 在 `checkGameOver()` 中检测到 `GAME_OVER` 时调用 `scheduleCleanup(gameId)`
- [x] 3.4 在模块加载时启动 `setInterval(cleanupStaleGames, 10 * 60 * 1000)` 定时扫描（使用 `.unref()` 避免阻止退出）
- [x] 3.5 导出 `deleteGame` 和 `cleanupStaleGames` 方法供路由层使用

## 4. 路由层 — gameId 路径参数

- [x] 4.1 将 `router.post('/start', ...)` 改为 `router.post('/:gameId/start', ...)`，从 `req.params.gameId` 取 gameId 传入 `engine.startGame(gameId)`
- [x] 4.2 将 `/next-round` 改为 `/:gameId/next-round`，传入 `engine.nextRound(gameId)` 和 `engine.getAlivePlayers(gameId)` 和 `engine.generateDescription(gameId, player)` 和 `engine.getPublicState(gameId)`
- [x] 4.3 将 `/vote` 改为 `/:gameId/vote`，传入 `engine.executeVotes(gameId)` 和 `engine.eliminatePlayer(gameId)` 和 `engine.checkGameOver(gameId)` 和 `engine.getPublicState(gameId)`
- [x] 4.4 将 `/state` 改为 `/:gameId/state`，传入 `engine.getPublicState(gameId)`
- [x] 4.5 将 `/history` 改为 `/:gameId/history`，传入 `engine.getHistory(gameId)`
- [x] 4.6 将 `/reset` 改为 `/:gameId/reset`，传入 `engine.resetGame(gameId)`
- [x] 4.7 更新路由文件头部注释中的 API 列表

## 5. 前端 — gameId 生成与 API 改造

- [x] 5.1 在 `src/services/gameApi.ts` 新增 `getGameId()` 函数：从 `sessionStorage.getItem('wodi-game-id')` 读取，不存在则 `crypto.randomUUID()` 生成并存储
- [x] 5.2 修改 `startGame()` — URL 改为 `${API_BASE}/game/${getGameId()}/start`
- [x] 5.3 修改 `nextRound()` — URL 改为 `${API_BASE}/game/${getGameId()}/next-round`
- [x] 5.4 修改 `vote()` — URL 改为 `${API_BASE}/game/${getGameId()}/vote`
- [x] 5.5 修改 `getGameState()` — URL 改为 `${API_BASE}/game/${getGameId()}/state`
- [x] 5.6 修改 `getHistory()` — URL 改为 `${API_BASE}/game/${getGameId()}/history`
- [x] 5.7 修改 `resetGame()` — URL 改为 `${API_BASE}/game/${getGameId()}/reset`，并在成功后重新生成 gameId（新游戏新实例）

## 6. 前端 — Vite dev proxy 适配

- [x] 6.1 检查 `vite.config.ts` 中公网模式 `/game` proxy 是否能匹配 `/game/:gameId/start` 路径（已确认：`/game` 前缀匹配，原样转发）
- [x] 6.2 验证盒子模式 `/api` proxy 的 rewrite 不会截断 gameId 路径段（已确认：rewrite 只去掉 `/api` 前缀）

## 7. 构建与验证

- [x] 7.1 执行 `npm run build` 验证 TypeScript 编译通过（公网模式）
- [x] 7.2 执行 `npm run build` 验证 TypeScript 编译通过（盒子模式）
- [x] 7.3 检查 lint 无错误
- [x] 7.4 验证：两个不同 gameId 的 API 请求操作的是不同游戏实例（代码逻辑已确认：`getGame(gameId)` 从 Map 中按 gameId 隔离获取）
