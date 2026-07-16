## 1. 人设与数据模型

- [x] 1.1 修改 `server/game/players.js`：Lily 人设改为"说话以中文为主，偶尔在中文句子里蹦出一两个英文单词（如vibe、amazing），从不说整句英文"，style 改为"中文为主，偶尔夹英文词"
- [x] 1.2 修改 `server/game/players.js`：在 PLAYERS 数组座位 4 位置插入用户人设 `{ id: 4, name: '你', avatar: '🎮', personality: '人类玩家', style: '人类玩家', isHuman: true }`，原大刘(id4→5)、Lily(id5→6)、老张(id6→7)顺延，PLAYERS 从 6 个扩为 7 个
- [x] 1.3 修改 `src/types/game.ts`：`Player` 接口新增 `isHuman?: boolean` 字段
- [x] 1.4 修改 `src/types/game.ts`：`GamePublicState` 接口新增 `myWord?: string`、`myPlayerId?: number`、`isMyTurn?: boolean` 字段
- [x] 1.5 修改 `src/types/game.ts`：`SSEEvent` 接口新增 `thinking` 事件类型支持（data 含 playerId、playerName）

## 2. 引擎层 — 游戏逻辑改造

- [x] 2.1 修改 `server/game/engine.js`：`createInitialGame()` 中 players 数组使用 PLAYERS（含 isHuman 标记的座位 4）
- [x] 2.2 修改 `server/game/engine.js`：`startGame(gameId)` 中随机分配卧底时，用户（座位 4）有 1/7 概率成为卧底
- [x] 2.3 修改 `server/game/engine.js`：`getPublicState(gameId)` 实现信息隔离 — 检测人类玩家存活状态，存活时隐藏其他人的 isUndercover/word/wordPair，返回 myWord/myPlayerId
- [x] 2.4 修改 `server/game/engine.js`：新增 `describeBatch(gameId, isFirstBatch)` — 返回需要描述的 AI 玩家列表（batch1: 座位1-3，batch2: 座位5-7），用户被淘汰时返回所有存活 AI
- [x] 2.5 修改 `server/game/engine.js`：新增 `userDescribe(gameId, text)` — 将用户描述存入 currentDescriptions
- [x] 2.6 修改 `server/game/engine.js`：新增 `aiVote(gameId)` — 执行 AI 投票（复用现有 generateVote + runWithConcurrency），返回 AI 投票数组，不执行淘汰
- [x] 2.7 修改 `server/game/engine.js`：新增 `userVote(gameId, voteFor)` — 将用户投票存入 currentVotes
- [x] 2.8 修改 `server/game/engine.js`：新增 `voteResult(gameId)` — 合并 AI + 用户票数，调用 eliminatePlayer + checkGameOver，返回结果
- [x] 2.9 修改 `server/game/engine.js`：新增 `abandonGame(gameId)` — 设 state=GAME_OVER，根据用户角色决定 winner，调用 scheduleCleanup
- [x] 2.10 更新 `server/game/engine.js` 的 `module.exports` 导出新方法

## 3. 路由层 — 新增端点

- [x] 3.1 修改 `server/routes/game.js`：新增 `POST /:gameId/describe-batch` — SSE 端点，调用 `engine.describeBatch(gameId)` 获取 AI 列表，流式输出描述，每个 AI 之间发 `thinking` 事件等 2s，用户存活时 batch1 末尾发 `user_turn`，用户被淘汰时无中断
- [x] 3.2 修改 `server/routes/game.js`：新增 `POST /:gameId/user-describe` — 从 body 取 text，调用 `engine.userDescribe(gameId, text)`
- [x] 3.3 修改 `server/routes/game.js`：新增 `POST /:gameId/ai-vote` — 调用 `engine.aiVote(gameId)`，返回 AI 投票结果
- [x] 3.4 修改 `server/routes/game.js`：新增 `POST /:gameId/user-vote` — 从 body 取 voteFor，调用 `engine.userVote(gameId, voteFor)`
- [x] 3.5 修改 `server/routes/game.js`：新增 `POST /:gameId/vote-result` — 调用 `engine.voteResult(gameId)`，返回淘汰结果和游戏状态
- [x] 3.6 修改 `server/routes/game.js`：新增 `POST /:gameId/abandon` — 调用 `engine.abandonGame(gameId)`，返回 `{ ok: true }`
- [x] 3.7 更新 `server/routes/game.js` 头部注释 API 列表

## 4. 前端 — API 层

- [x] 4.1 修改 `src/services/gameApi.ts`：新增 `describeBatch(isFirstBatch, isNewRound, callbacks)` — SSE 请求 `POST /game/${getGameId()}/describe-batch`，处理 describe_start/chunk/end/thinking/user_turn/round_complete 事件
- [x] 4.2 修改 `src/services/gameApi.ts`：新增 `userDescribe(text)` — POST 请求 `POST /game/${getGameId()}/user-describe`
- [x] 4.3 修改 `src/services/gameApi.ts`：新增 `aiVote()` — POST 请求 `POST /game/${getGameId()}/ai-vote`
- [x] 4.4 修改 `src/services/gameApi.ts`：新增 `userVote(voteFor)` — POST 请求 `POST /game/${getGameId()}/user-vote`
- [x] 4.5 修改 `src/services/gameApi.ts`：新增 `voteResult()` — POST 请求 `POST /game/${getGameId()}/vote-result`
- [x] 4.6 修改 `src/services/gameApi.ts`：新增 `abandon()` — 用 `navigator.sendBeacon` 发送 `POST /game/${getGameId()}/abandon`
- [x] 4.7 修改 `src/services/gameApi.ts`：SSE 回调新增 `onThinking(playerId, playerName)` 和 `onUserTurn()` 回调

## 5. 前端 — 页面与组件

- [x] 5.1 修改 `src/pages/GamePage.tsx`：新增用户词展示区 — `myWord` 非空时显示"你的词语：{myWord}"
- [x] 5.2 修改 `src/pages/GamePage.tsx`：改造描述流程 — 用状态机管理 `AI_DESCRIBING → USER_INPUT → AI_DESCRIBING → ROUND_COMPLETE`
- [x] 5.3 修改 `src/pages/GamePage.tsx`：新增描述输入框 — `user_turn` 事件触发显示 `Input.TextArea`，用户提交后调用 `userDescribe()`
- [x] 5.4 修改 `src/pages/GamePage.tsx`：新增投票选择 UI — `aiVote()` 返回后显示候选人列表，用户选择后调用 `userVote()` + `voteResult()`
- [x] 5.5 修改 `src/pages/GamePage.tsx`：新增 `thinking` 动画 — 收到 `onThinking` 回调时在对应玩家位置显示"正在思考..."
- [x] 5.6 修改 `src/pages/GamePage.tsx`：新增 `beforeunload` → `abandon()` — 组件卸载或页面关闭时发送 abandon 请求
- [x] 5.7 修改 `src/pages/GamePage.tsx`：用户被淘汰后切换观战模式 — 后续轮次用连续 SSE（describe-batch 只调一次）+ ai-vote + vote-result（跳过 user-vote）

## 6. 构建与验证

- [x] 6.1 执行 `npm run build` 验证 TypeScript 编译通过（公网模式）
- [x] 6.2 执行 `npm run build` 验证 TypeScript 编译通过（盒子模式）
- [x] 6.3 检查 lint 无错误
- [x] 6.4 验证：用户词展示、信息隔离、描述输入、投票选择流程完整
