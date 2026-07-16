## Context

当前游戏引擎支持多用户 gameId 隔离（Map 存储），但所有 6 个玩家都是 AI。用户希望加入成为第 7 个玩家，与 6 个 AI 组成 7 人局。用户是纯旁观者，`getPublicState()` 暴露所有人的卧底身份和词语。SSE 描述流是单次连续流，投票是单次 `POST /vote`。Lily 人设描述模糊导致 LLM 可能说整句英文。AI 描述之间无间隔，节奏太快。

## Goals / Non-Goals

**Goals:**
- 用户作为第 4 座位参与 7 人局（6 AI + 1 用户），有独立词语，可输入描述和投票
- 信息隔离：用户存活时只看到自己的词，不知道谁是卧底
- 用户被淘汰后切换观战模式，解锁全部信息
- 用户离开页面 → 游戏结束
- AI 描述间 2 秒思考间隔（SSE thinking 事件）
- Lily 人设明确"中文为主偶尔夹英文词"

**Non-Goals:**
- 不实现多人类玩家（同一游戏只有一个人类座位）
- 不实现用户超时自动操作（无限等待）
- 不实现发言顺序随机化（固定 1→2→3→4→5→6→7）
- 不实现 WebSocket（使用拆分 SSE 方案）

## Decisions

### 1. 座位 4 给用户 — 固定位置，不随机

**理由**: 固定座位简化 SSE 拆分逻辑——batch1 永远是座位 1-3（AI），user_turn，batch2 永远是座位 5-7（AI）。用户被淘汰后，两个 batch 合并为连续流。7 人局中卧底概率为 1/7，游戏可能持续 5 轮（7→6→5→4→3→2），比 6 人制多一轮。

### 2. SSE 拆分方案 — 避免 Render 100s 超时

**选择**: 描述阶段拆为 `POST /describe-batch`（SSE）+ `POST /user-describe` + `POST /describe-batch`（SSE）。

**替代方案**: SSE 保持连接等待用户输入 — Render 100s 超时会杀连接。WebSocket — 引入依赖和复杂度。

**理由**: 拆分 SSE 让用户有无限时间打字，不占用 SSE 连接。前端在 user_turn 事件后显示输入框，用户完成后 POST，再请求第二段 SSE。

### 3. 信息隔离 — `getPublicState()` 基于 `isAlive` 条件返回

```js
function getPublicState(gameId) {
  const game = getGame(gameId);
  const humanPlayer = game.players.find(p => p.isHuman);
  const humanAlive = humanPlayer && humanPlayer.isAlive;

  return {
    // 用户存活时不返回敏感信息
    players: game.players.map(p => ({
      ...p,
      isUndercover: humanAlive ? undefined : p.isUndercover,
      word: (!humanAlive || game.state === GameState.GAME_OVER) ? p.word : (p.isHuman ? p.word : undefined),
    })),
    wordPair: humanAlive ? null : game.wordPair,
    // 新增：用户视角
    myWord: humanAlive ? humanPlayer.word : null,
    myPlayerId: HUMAN_SEAT_ID,
    isMyTurn: /* SSE batch 之间判断 */,
  };
}
```

### 4. 用户离开检测 — `beforeunload` + `sendBeacon`

**选择**: 前端 `beforeunload` 事件 → `navigator.sendBeacon('/abandon')` → 后端 `abandonGame()` 设置 `GAME_OVER`。

**理由**: `sendBeacon` 在页面卸载时仍可靠发送（`fetch` 会被取消）。游戏结束时 winner 取决于用户角色：用户是卧底→平民赢，用户是平民→卧底赢。

### 5. 投票拆分 — 三步流程

```
POST /ai-vote     → AI 投票（concurrency=2），返回 AI 投票结果
POST /user-vote   → 用户提交投票
POST /vote-result → 合并所有票数，淘汰，检查游戏结束
```

用户被淘汰后：`/ai-vote` 直接返回 AI 投票 + 调用 `/vote-result`（无需 user-vote）。

### 6. thinking SSE 事件 — 2 秒间隔

在 `describe-batch` SSE 路由中，每个 AI 玩家描述结束后发送 `thinking` 事件，然后 `setTimeout(2000)` 等待再开始下一个：

```
describe_start(AI1) → chunks → describe_end(AI1)
→ thinking(AI2) → 等待2s
→ describe_start(AI2) → chunks → describe_end(AI2)
→ thinking(AI3) → 等待2s
→ ...
```

前端收到 `thinking` 事件显示"XXX 正在思考..."动画。

### 7. Lily 人设修改

```
当前:
  personality: '海归留学生，说话中英混搭，偶尔蹦出英文单词，见多识广'
  style: '偶尔蹦英文'

改为:
  personality: '海归留学生，说话以中文为主，偶尔在中文句子里蹦出一两个英文单词（如vibe、amazing），从不说整句英文，见多识广'
  style: '中文为主，偶尔夹英文词'
```

## Risks / Trade-offs

- **[SSE 拆分复杂度]** → 前端需要管理两段 SSE 调用 + 中间用户输入状态。用状态机管理：`AI_DESCRIBING → USER_INPUT → AI_DESCRIBING → ROUND_COMPLETE`。
- **[sendBeacon 兼容性]** → `sendBeacon` 在所有现代浏览器中支持。iOS Safari 14+ 支持。兼容性可接受。
- **[用户被淘汰后切模式]** → 前端通过 `getPublicState()` 的 `isAlive` 判断，用户被淘汰后后续轮次用连续 SSE + 直接 ai-vote + vote-result 两步。
- **[信息泄露风险]** → 如果用户手动调用 API（如 `GET /state`），`getPublicState` 已经做了过滤。但如果用户查看网络请求，投票阶段 `ai-vote` 返回的 AI 投票理由中可能暗示卧底身份。这是游戏机制固有的，可接受。
- **[engine.js 行数增长]** → 新增约 150 行，总约 600 行，仍在 1500 行限制内。
