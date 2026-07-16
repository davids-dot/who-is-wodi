## Why

当前游戏硬编码为「用户参与模式」——座位 4 固定是人类玩家，用户必须亲自参与描述和投票。但有时用户只想旁观 7 个 AI 互相博弈（纯观战体验），不参与游戏。用户在主界面开始游戏前无法选择模式，缺少「AI 观战」入口。

## What Changes

- **BREAKING**: `startGame` 接受 `mode` 参数（`'ai'` 观战模式 / `'participate'` 参与模式），根据模式选择不同玩家阵容
- **BREAKING**: `createInitialGame` 接受 `mode` 参数，观战模式使用 7 个 AI 玩家（无 `isHuman` 标志），参与模式保持 6 AI + 1 人类
- 新增 AI 观战模式：7 个 AI 玩家全自动博弈，描述阶段连续 SSE（无 `user_turn` 中断），投票阶段 AI 全量投票后直接出结果（无用户投票步骤）
- 新增座位 4 的 AI 人设（观战模式专用），参与模式仍使用人类玩家「你」
- 新增前端模式选择器：开始游戏前显示「AI 观战」和「亲自参与」两个选项
- 前端 Phase 状态机复用现有状态，AI 观战模式跳过 `USER_INPUT` 和 `USER_VOTE` 阶段
- `beforeunload` → `abandon` 逻辑仅在参与模式触发
- `GamePublicState` 新增 `mode` 字段，标识当前游戏模式

## Capabilities

### New Capabilities
- `game-mode-selection`: 游戏模式选择机制，用户在开始游戏前选择 AI 观战或亲自参与模式，后端根据模式初始化不同玩家阵容

### Modified Capabilities
- `game-engine`: `startGame` 和 `createInitialGame` 接受 `mode` 参数；观战模式使用纯 AI 玩家阵容
- `user-gameplay`: 用户参与行为变为模式条件触发——仅在 `'participate'` 模式下启用人类座位、信息隔离、用户描述/投票
- `game-ui`: 开始游戏前新增模式选择器 UI；游戏控制流程根据模式条件渲染用户输入和投票区域

## Impact

- **server/game/players.js**: 新增 1 个 AI 人设（座位 4 观战版），导出 `getPlayers(mode)` 函数
- **server/game/engine.js**: `createInitialGame(mode)`、`startGame(gameId, mode)`、`resetGame(gameId, mode)` 接受 mode 参数；`getPublicState` 返回 `mode` 字段
- **server/routes/game.js**: `/start` 和 `/reset` 端点从 body 读取 `mode` 参数
- **src/types/game.ts**: 新增 `GameMode` 类型；`GamePublicState` 新增 `mode` 字段
- **src/services/gameApi.ts**: `startGame(mode)` 和 `resetGame(mode)` 传入 mode
- **src/pages/GamePage.tsx**: 新增 `mode` state 和模式选择器；`handleStart` 传 mode；`handleVote` 检查 mode 跳过用户投票；`beforeunload` 仅参与模式触发
- **src/components/GameControls.tsx**: 开始按钮区域增加模式选择 Radio
