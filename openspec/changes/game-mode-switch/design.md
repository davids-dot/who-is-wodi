## Context

当前游戏引擎（`server/game/engine.js`）硬编码使用 7 人阵容：6 AI + 1 人类玩家（座位 4，`isHuman: true`）。所有路由（`/describe-batch`、`/ai-vote`、`/vote-result`）通过 `isHuman` 标志自然分支——没有人类玩家时，`describeBatch()` 返回全量 AI 列表，SSE 发 `round_complete` 而非 `user_turn`，`aiVote()` 投票全量 AI，`voteResult()` 不合并用户票。

这意味着后端路由层已经具备模式无关性，只需让引擎能够初始化一个无人类玩家的游戏实例即可复用全部现有路由。

## Goals / Non-Goals

**Goals:**
- 用户可在开始游戏前选择「AI 观战」或「亲自参与」模式
- AI 观战模式：7 个 AI 全自动博弈，无用户输入/投票步骤
- 参与模式：保持现有行为不变
- 后端路由零新增——复用现有 `/describe-batch`、`/ai-vote`、`/vote-result`
- 前端 Phase 状态机零新增——通过条件跳过 `USER_INPUT` 和 `USER_VOTE`

**Non-Goals:**
- 不支持游戏进行中切换模式（需重置游戏）
- 不改变 AI 人设数量和性格定义（仅新增 1 个观战用 AI 人设）
- 不改变 LLM 调用逻辑和并发控制
- 不改变 SSE 事件协议

## Decisions

### Decision 1: 复用现有路由，不新增端点

**选择**: 不新增任何 API 端点，通过 `startGame(gameId, mode)` 选择玩家阵容即可。

**理由**: 引擎的 `describeBatch()`、`aiVote()`、`voteResult()` 已经通过 `game.players.find(p => p.isHuman)` 自然分支。没有人类玩家时，所有函数自动走「全量 AI」路径。新增端点会引入重复逻辑和维护负担。

**替代方案**: 为观战模式新增 `/next-round`（连续 SSE）和 `/vote`（全量投票+淘汰）——但这两个旧路由仍在代码中，缺少 `thinking` 事件且逻辑与新模式不一致，不如复用新路由。

### Decision 2: 模式存储在游戏实例中

**选择**: `createInitialGame(mode)` 将 `mode` 存入游戏实例，`getPublicState()` 返回 `mode` 字段。

**理由**: 前端需要知道当前模式以决定是否渲染用户输入/投票 UI。将 mode 存入实例确保状态一致性，避免前端猜测。

### Decision 3: 新增 1 个 AI 人设而非复用人类座位

**选择**: 在 `players.js` 中新增第 7 个 AI 人设（如「小陈」），通过 `getPlayers(mode)` 返回不同阵容。

**理由**: 观战模式下 7 个座位都是 AI，每个都需要独立的人设和风格以保证对话多样性。复用人类座位（name="你"）会导致 AI 生成描述时人格不自然。

**替代方案**: 将座位 4 设为通用 AI（无个性）——但会降低观战体验的趣味性。

### Decision 4: 前端 Phase 状态机复用

**选择**: 不新增 Phase 状态。AI 观战模式通过条件判断跳过 `USER_INPUT` 和 `USER_VOTE`。

```
AI 模式:     IDLE → AI_DESCRIBING → (round_complete) → IDLE → AI_VOTING → IDLE/GAME_OVER
参与模式:    IDLE → AI_DESCRIBING → USER_INPUT → AI_DESCRIBING → IDLE → AI_VOTING → USER_VOTE → IDLE/GAME_OVER
```

**理由**: AI 模式的 SSE 流不发 `user_turn` 事件，前端自然从 `AI_DESCRIBING` 回到 `IDLE`。投票阶段检查 `mode === 'ai'` 后直接调 `voteResult(aiVotes, null)` 跳过 `USER_VOTE`。无需新增状态。

### Decision 5: beforeunload 仅参与模式触发

**选择**: `beforeunload` 事件处理器检查 `mode === 'participate'` 才调用 `abandon()`。

**理由**: 观战模式没有人类玩家参与，用户关闭页面不应触发游戏结束。游戏实例会在 30 分钟无活动后被定时清理。

## Risks / Trade-offs

- **[风险] 旧路由 `/next-round` 和 `/vote` 冗余** → 保留不删除，不影响功能；后续可在独立变更中清理
- **[风险] 观战模式下 `abandonGame()` 被误调用** → `abandonGame()` 在无人类玩家时不会崩溃（仅设置 GAME_OVER），但前端不会在观战模式调用它
- **[权衡] 模式不可中途切换** → 用户需重置游戏才能切换模式，这是合理限制——不同模式玩家阵容不同
- **[权衡] 观战模式信息全部可见** → `getPublicState()` 在无人类玩家时 `showAll = true`，所有身份和词语对用户可见，符合观战预期
