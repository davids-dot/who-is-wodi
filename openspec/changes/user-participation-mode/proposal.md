## Why

当前游戏是纯旁观者模式——6 个 AI 玩，用户只能看。用户希望亲自参与：坐到第 4 个座位，与 6 个 AI 组成 7 人局，拿到自己的词，描述阶段输入一句话，投票阶段选择投谁。用户不知道谁是卧底，只知道自己的词。用户被淘汰后切换回观战模式，可看到全部信息。用户离开页面则游戏结束。

同时优化体验细节：Lily 人设描述需明确"中文为主偶尔夹英文词"避免说整句英文；AI 玩家描述之间加 2 秒思考间隔，通过 SSE thinking 事件呈现"正在思考..."效果。

## What Changes

- **BREAKING**: 游戏从 6 AI 纯观战改为 6 AI + 1 用户 = 7 人参与模式，用户固定座位 4，全部 6 个 AI 角色保留
- **BREAKING**: `getPublicState()` 实现信息隔离——用户存活时不返回 `isUndercover`、`wordPair`、他人 `word`；用户被淘汰后解锁全部信息
- **BREAKING**: 描述阶段从单次连续 SSE 拆分为两段 SSE（batch1: AI 1-3 → user_turn → batch2: AI 5-7），中间等待用户 POST 描述文本
- **BREAKING**: 投票阶段从 `POST /vote` 拆分为 `POST /ai-vote` → 用户投票 → `POST /vote-result` 三步
- 新增 `POST /:gameId/user-describe` 端点 — 用户提交描述文本
- 新增 `POST /:gameId/ai-vote` 端点 — AI 投票，返回 AI 投票结果
- 新增 `POST /:gameId/user-vote` 端点 — 用户提交投票
- 新增 `POST /:gameId/vote-result` 端点 — 统计淘汰 + 检查游戏结束
- 新增 `POST /:gameId/abandon` 端点 — 用户离开页面时通过 `sendBeacon` 通知后端，游戏结束
- 新增 SSE `thinking` 事件 — AI 描述间隔 2 秒，前端显示"XXX 正在思考..."
- 修改 `server/game/players.js` — Lily 人设改为"中文为主，偶尔夹英文词"；新增第 7 个玩家用户人设（id=4, name="你", avatar="🎮", isHuman=true），原大刘/Lily/老张顺延为座位 5/6/7
- 用户被淘汰后：后续轮次切回纯 AI 连续 SSE 模式，`getPublicState()` 解锁全部信息

## Capabilities

### New Capabilities
- `user-gameplay`: 用户参与游戏机制，包括座位分配、信息隔离、描述输入、投票选择、被淘汰后观战、离开页面处理
- `thinking-interval`: AI 描述间思考间隔，SSE thinking 事件 + 前端"正在思考..."动画

### Modified Capabilities
- `game-session`: 修改 `getPublicState()` 实现信息隔离；新增 `abandonGame()` 方法；拆分描述和投票流程的端点变更

## Impact

- **server/game/engine.js**: 新增 `humanPlayerId`、`describeBatch(gameId)`、`userDescribe(gameId, text)`、`aiVote(gameId)`、`userVote(gameId, target)`、`voteResult(gameId)`、`abandonGame(gameId)`；修改 `startGame()` 分配用户座位和词；修改 `getPublicState()` 信息隔离
- **server/game/players.js**: Lily 人设修改；PLAYERS 数组从 6 个扩为 7 个，座位 4 插入用户人设，原 4-6 顺延为 5-7
- **server/routes/game.js**: 新增 6 个端点（describe-batch、user-describe、ai-vote、user-vote、vote-result、abandon）；改造现有 next-round 和 vote 端点
- **src/services/gameApi.ts**: 新增 6 个 API 函数；改造 nextRound 和 vote；新增 thinking SSE 事件处理
- **src/pages/GamePage.tsx**: 新增用户词展示区、描述输入框、投票选择 UI、思考动画；改造描述和投票流程；新增 beforeunload → abandon 逻辑
- **src/types/game.ts**: Player 新增 `isHuman` 字段；GamePublicState 新增 `myWord`、`myPlayerId`、`isMyTurn`；SSEEvent 新增 thinking 类型
