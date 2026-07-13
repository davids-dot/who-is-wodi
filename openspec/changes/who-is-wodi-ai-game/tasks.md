## 1. 脚手架与环境配置

- [x] 1.1 从 template/ 复制项目脚手架到工作目录
- [x] 1.2 修改 package.json 的 name 字段为 who-is-wodi，填写 fde 字段块（appKey、appName、appDescription）
- [x] 1.3 生成 .env（BOX_IP=192.168.3.171）和 .env.prod 配置文件
- [x] 1.4 使用 port-registry.js 分配 HOST_PORT (33809)
- [x] 1.5 清理不需要的模板文件（ChatPage.tsx、OcrAsrDemo.tsx、agent-config.ts、modelCards.ts 及对应路由）
- [x] 1.6 更新 App.tsx 路由，只保留 GamePage 路由
- [x] 1.7 前端 npm install（阿里云镜像），后端 npm install（阿里云镜像）

## 2. 后端 - 游戏引擎与词库

- [x] 2.1 创建 server/game/wordPairs.js：定义 50+ 组精选相似词对，确保禁字不太常见
- [x] 2.2 创建 server/game/players.js：定义 6 个 AI 玩家人设（名字、emoji头像、性格描述、描述风格）
- [x] 2.3 创建 server/game/engine.js：实现游戏状态机（IDLE→DEALING→DESCRIBING→VOTING→RESULT→GAME_OVER）
- [x] 2.4 在 engine.js 中实现 startGame()：随机选词对、随机标记卧底、分配词语
- [x] 2.5 在 engine.js 中实现 nextRound()：轮次递增、保持同一词对和卧底身份
- [x] 2.6 在 engine.js 中实现 eliminatePlayer()：淘汰得票最多者、平票无人淘汰逻辑
- [x] 2.7 在 engine.js 中实现 checkGameOver()：卧底被淘汰→平民胜、剩2人卧底存活→卧底胜
- [x] 2.8 在 engine.js 中实现 resetGame()：清空所有状态回到 IDLE

## 3. 后端 - LLM 调用逻辑

- [x] 3.1 在 server/game/engine.js 中实现 generateDescription()：构建描述 prompt（含人设、词语、禁字规则、历史描述），调用 llm-client.chat() 流式生成
- [x] 3.2 描述 prompt 中注入本轮之前玩家的描述和所有历史轮次的描述，要求不重复
- [x] 3.3 描述 prompt 中加入禁字规则（软规则，告知模型不能使用词语中的字，但不做硬性过滤）
- [x] 3.4 在 engine.js 中实现 generateVote()：构建投票 prompt（含全部描述历史、禁字违规分析提示），调用 llm-client.chat() 返回 JSON
- [x] 3.5 投票结果 JSON 解析 fallback：解析失败时随机投票并标注"直觉投票"
- [x] 3.6 投票并行执行：使用 Promise.all() 并发调用 6 个玩家的投票

## 4. 后端 - API 路由

- [x] 4.1 创建 server/routes/game.js，注册到 server/index.js
- [x] 4.2 实现 POST /start：调用 engine.startGame()，返回游戏初始状态
- [x] 4.3 实现 POST /next-round（SSE）：依次调用 generateDescription()，通过 SSE 推送 describe_start/chunk/end/round_complete 事件
- [x] 4.4 实现 POST /vote：调用 generateVote() 并行获取所有投票，调用 eliminatePlayer()，返回投票结果和淘汰信息
- [x] 4.5 实现 GET /state：返回当前游戏状态（轮次、玩家列表、活跃状态、当前阶段）
- [x] 4.6 实现 GET /history：返回所有历史轮次的描述和投票记录
- [x] 4.7 实现 POST /reset：调用 engine.resetGame()

## 5. 前端 - 类型定义与 API 封装

- [ ] 5.1 创建 src/types/game.ts：定义 Player、GameState、Description、Vote、RoundHistory 等类型
- [ ] 5.2 创建 src/services/gameApi.ts：封装 start/next-round/vote/state/history/reset API 调用
- [ ] 5.3 在 gameApi.ts 中实现 SSE 流式接收逻辑（fetch + ReadableStream 解析 SSE 事件）

## 6. 前端 - 圆桌布局组件

- [x] 6.1 创建 src/components/RoundTable.tsx + .module.less：6 个座位的环形 CSS 定位布局
- [x] 6.2 创建 src/components/PlayerSeat.tsx + .module.less：单个座位（emoji头像、名字、状态指示、描述气泡位置）
- [x] 6.3 PlayerSeat 支持状态：active（正常）、speaking（高亮当前发言者）、eliminated（灰显+身份标识）

## 7. 前端 - 描述流与投票组件

- [x] 7.1 创建 src/components/DescriptionBubble.tsx + .module.less：描述气泡，支持打字机效果（逐字显示）
- [x] 7.2 创建 src/components/VoteResult.tsx + .module.less：投票结果展示（每人投了谁、理由、票数统计、淘汰者身份揭示）
- [x] 7.3 创建 src/components/GameControls.tsx + .module.less：控制按钮组（开始/下一轮/投票/重置），按游戏状态启用/禁用
- [x] 7.4 创建 src/components/HistoryPanel.tsx + .module.less：可折叠历史记录面板，按轮次展示描述和投票

## 8. 前端 - 主页面组装

- [x] 8.1 创建 src/pages/GamePage.tsx：组装 RoundTable + DescriptionBubble + VoteResult + GameControls + HistoryPanel
- [x] 8.2 实现 SSE 流处理：接收 next-round 的 SSE 事件，更新对应玩家的描述气泡
- [x] 8.3 实现游戏状态管理：useState 管理游戏状态、玩家列表、描述历史、投票结果
- [x] 8.4 实现游戏结束展示：弹出结果面板（平民胜利/卧底胜利、揭示卧底身份和词语）
- [x] 8.5 实现状态头部：显示当前轮次、剩余人数、当前阶段

## 9. 构建验证

- [x] 9.1 npm run build 通过，无 TypeScript 错误
- [x] 9.2 启动前端 dev server + 后端 server，浏览器访问页面无白屏
- [x] 9.3 curl 验证 GET /api/who-is-wodi/game/state 返回正常 JSON
- [x] 9.4 curl 验证 POST /api/who-is-wodi/game/start 返回游戏初始状态
- [x] 9.5 浏览器验证完整游戏流程：开始→描述（SSE打字机）→投票→结果→下一轮→游戏结束

## 10. 代码审查

- [x] 10.1 检查无硬编码 IP（.env 中 192.168.3.171 除外）
- [x] 10.2 检查 CSS Modules 使用规范（无全局 className 混用）
- [x] 10.3 检查单文件不超过 1500 行，单函数不超过 150 行
- [x] 10.4 检查所有图标来自 @ant-design/icons
- [x] 10.5 检查无绝对路径引用文件
