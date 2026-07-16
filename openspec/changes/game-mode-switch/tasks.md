## 1. 后端 — 玩家阵容与模式支持

- [x] 1.1 在 `server/game/players.js` 中新增座位 4 的 AI 人设（观战模式专用，如 name="小陈", avatar="🧑‍💻", 独立 personality 和 style）
- [x] 1.2 在 `server/game/players.js` 中导出 `getPlayers(mode)` 函数：`'ai'` 返回 7 个 AI 玩家（座位 4 用新 AI 人设），`'participate'` 返回现有阵容（6 AI + 1 人类）
- [x] 1.3 修改 `server/game/engine.js` 的 `createInitialGame(mode)`：接受 mode 参数，调用 `getPlayers(mode)` 选择玩家阵容，将 `mode` 存入游戏实例
- [x] 1.4 修改 `server/game/engine.js` 的 `startGame(gameId, mode)`：将 mode 透传给 `createInitialGame`
- [x] 1.5 修改 `server/game/engine.js` 的 `resetGame(gameId, mode)`：将 mode 透传给 `createInitialGame`
- [x] 1.6 修改 `server/game/engine.js` 的 `getPublicState(gameId)`：在返回结果中新增 `mode` 字段

## 2. 后端 — 路由层

- [x] 2.1 修改 `server/routes/game.js` 的 `POST /:gameId/start`：从 `req.body.mode` 读取模式，默认 `'participate'`，透传给 `engine.startGame(gameId, mode)`
- [x] 2.2 修改 `server/routes/game.js` 的 `POST /:gameId/reset`：从 `req.body.mode` 读取模式，透传给 `engine.resetGame(gameId, mode)`

## 3. 前端 — 类型与 API 层

- [x] 3.1 在 `src/types/game.ts` 中新增 `GameMode` 类型（`'ai' | 'participate'`），在 `GamePublicState` 接口中新增 `mode` 字段
- [x] 3.2 修改 `src/services/gameApi.ts` 的 `startGame(mode: GameMode)`：在 POST body 中传入 `{ mode }`
- [x] 3.3 修改 `src/services/gameApi.ts` 的 `resetGame(mode: GameMode)`：在 POST body 中传入 `{ mode }`

## 4. 前端 — GamePage 逻辑

- [x] 4.1 在 `src/pages/GamePage.tsx` 中新增 `gameMode` state（`'participate'` 为默认值）
- [x] 4.2 修改 `handleStart`：传入 `gameMode` 调用 `gameApi.startGame(mode)`，从返回的 state 中读取 `mode` 并同步到 state
- [x] 4.3 修改 `handleVote`：检查 `gameMode === 'ai'` 时，调用 `aiVote()` 后直接调用 `voteResult(aiVotes, null)` 跳过 `USER_VOTE` 阶段（现有 `humanAlive` 检查已自动处理）
- [x] 4.4 修改 `handleReset`：传入当前 `gameMode` 调用 `gameApi.resetGame(mode)`
- [x] 4.5 修改 `beforeunload` 事件处理器：仅在 `gameMode === 'participate'` 且用户存活时触发 `abandon()`
- [x] 4.6 修改 `canDescribe` / `canVote` 条件：确保 AI 观战模式下投票按钮在描述完成后可用（无用户输入阶段）

## 5. 前端 — UI 组件

- [x] 5.1 修改 `src/components/GameControls.tsx`：在开始游戏前显示模式选择器（Radio.Group: "AI 观战" / "亲自参与"），游戏开始后隐藏
- [x] 5.2 将选中的 `mode` 通过回调传递给 `GamePage`，确保 `GameControls` 的 `onStart` 触发时携带 mode
- [x] 5.3 修改 `src/pages/GamePage.tsx` 的 header 区域：AI 观战模式下不显示"观战中"指示器（因无人类玩家，`humanPlayer` 为 undefined 自动不渲染）
- [x] 5.4 确认 AI 观战模式下 `USER_INPUT` 和 `USER_VOTE` 的 UI（描述输入框、投票选择器）不渲染（SSE 不发 `user_turn`，phase 不会进入 `USER_INPUT`；`humanAlive` 为 false，不会进入 `USER_VOTE`）

## 6. 验证与测试

- [x] 6.1 启动前后端服务，选择「AI 观战」模式开始游戏，验证 7 个 AI 连续描述、无 user_turn 中断
- [x] 6.2 验证 AI 观战模式下投票阶段直接出结果（无用户投票步骤）
- [x] 6.3 验证 AI 观战模式下 `getPublicState` 返回全部信息（所有 isUndercover/word 可见）
- [x] 6.4 切换到「亲自参与」模式，验证现有流程不受影响（描述输入、用户投票正常）
- [x] 6.5 验证 AI 观战模式下关闭页面不触发 `abandon` 请求
- [x] 6.6 验证重置游戏后模式选择器重新出现，可切换模式重新开始
