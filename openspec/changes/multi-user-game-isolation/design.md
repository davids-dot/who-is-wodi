## Context

当前游戏引擎 `server/game/engine.js` 使用模块级单例 `let game = createInitialGame()` 存储游戏状态。所有用户共享同一个实例，导致多用户访问时"串台"。引擎导出的所有函数（`startGame`、`nextRound`、`generateDescription`、`executeVotes` 等）都直接操作这个全局单例，无 gameId 概念。

路由层 `server/routes/game.js` 的 6 个端点（`/start`、`/next-round`、`/vote`、`/state`、`/history`、`/reset`）也不携带任何会话标识。

投票阶段虽已使用 `Promise.all` 并行 6 个 LLM 调用，但 DashScope 免费 API 有 QPS 限制（约 2 并发），6 个同时请求可能触发 429。

## Goals / Non-Goals

**Goals:**
- 多用户同时访问时各自拥有独立游戏实例，互不干扰
- gameId 使用 URL 路径传递（`/game/:gameId/start`），RESTful 且可分享
- 投票 LLM 调用加入并发控制（concurrency=2），避免 DashScope 429
- 游戏实例自动清理，防止内存泄漏
- 盒子模式向后兼容（盒子单用户场景不受影响）

**Non-Goals:**
- 不实现用户认证/登录系统
- 不实现游戏房间/匹配系统
- 不实现 SSE 超时处理（Render 100s 限制暂不处理）
- 不持久化游戏状态（重启即丢失，内存存储）

## Decisions

### 1. gameId 生成 — 前端 `crypto.randomUUID()` + `sessionStorage`

**选择**: 前端在 `gameApi.ts` 模块初始化时调用 `crypto.randomUUID()` 生成 gameId，存入 `sessionStorage`。

**替代方案**:
- 后端创建 gameId 再返回 — 多一次 API 往返，且需要额外的"创建"端点
- `localStorage` — 同一浏览器多 tab 共享 gameId，导致串台（`sessionStorage` 每 tab 独立）

**理由**: `crypto.randomUUID()` 是浏览器内置 API，零依赖，碰撞概率约 $10^{-37}$。`sessionStorage` 确保每个浏览器 tab 拥有独立 gameId，天然隔离。用户刷新页面时 `sessionStorage` 保持（同一 tab 内），不会丢失游戏。

### 2. gameId 传递 — URL 路径参数

**选择**: 路由从 `/game/start` 改为 `/game/:gameId/start`，前端 URL 拼接 gameId。

**替代方案**:
- HTTP Header `X-Game-Id` — 更隐蔽但不可分享、不可收藏
- Query Parameter `?gameId=xxx` — 可行但不够 RESTful

**理由**: URL 路径参数是 RESTful 惯例，未来支持分享游戏链接（`https://xxx/game/abc123`）也更自然。Express 路由 `/:gameId/start` 解析方便。

### 3. 后端存储 — `Map<gameId, gameInstance>`

**选择**: 用 `const games = new Map()` 替代 `let game` 单例。引擎内部新增 `getGame(gameId)` 方法，首次访问时延迟创建。

```
games = Map {
  "abc-123" → { state: DESCRIBING, round: 2, ... },
  "def-456" → { state: IDLE, round: 0, ... },
}
```

**替代方案**:
- 对象字面量 `const games = {}` — Map 有 `.size`、迭代顺序保证、`.get()`/.set() 语义更清晰
- Redis — 引入外部依赖，公网免费实例不适合

**理由**: `Map` 是 Node.js 内置数据结构，零依赖，查找 O(1)。单游戏内存 < 10KB，512MB 实例可支撑 100+ 并发游戏。

### 4. 投票并发控制 — 分批执行（concurrency=2）

**选择**: 在 `executeVotes()` 中将 6 个投票请求分成 3 批，每批 2 个并行执行，批次间串行等待。

```
批1: [玩家1, 玩家2] → Promise.all → 等待
批2: [玩家3, 玩家4] → Promise.all → 等待
批3: [玩家5, 玩家6] → Promise.all → 等待
总计：3 × 3s = 9s（原来 1 × 3s 但可能 429）
```

**替代方案**:
- 保持 `Promise.all` 全并行 — DashScope 免费档可能 429
- 串行执行 — 6 × 3s = 18s 太慢
- 使用 `p-limit` 库 — 引入外部依赖

**理由**: 自实现分批逻辑约 10 行代码，无需依赖。concurrency=2 是 DashScope 免费档的安全值，可通过环境变量 `LLM_CONCURRENCY` 调整。

### 5. 内存清理 — TTL + 定时扫描

**选择**: 双重清理机制：
1. 游戏结束（`GAME_OVER`）时 `setTimeout(5min)` 后删除
2. 每 10 分钟扫描一次 `games` Map，删除超过 30 分钟无活动的游戏

**替代方案**:
- 仅靠游戏结束时清理 — 用户中途关闭页面，游戏永远不结束，内存泄漏
- LRU 淘汰 — 实现复杂，当前规模不需要

**理由**: 定时扫描是最简单的兜底方案。`setInterval` 10 分钟一次，每次遍历 Map 检查 `lastActivity` 时间戳，开销极小。

## Risks / Trade-offs

- **[内存泄漏]** → 定时清理 + 游戏结束自动删除双重保障。100 个游戏 × 10KB = 1MB，远低于 512MB 上限。
- **[gameId 猜测]** → UUID v4 有 122 位随机性，猜测概率约 $10^{-37}$，无需担心。
- **[投票变慢]** → concurrency=2 使投票从 ~3s 变为 ~9s，但避免了 429 限流导致的重试和失败，整体更稳定。可通过 `LLM_CONCURRENCY` 环境变量调整。
- **[盒子兼容性]** → 盒子单用户场景下，前端也会生成 gameId 并传给后端，行为与公网一致，无需特殊处理。
- **[容器重启丢失]** → 内存存储，Render 重新部署后所有游戏丢失。当前阶段可接受（展示型应用）。
