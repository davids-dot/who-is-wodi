## Why

需要一个基于大模型的"谁是卧底"AI对战游戏应用。6个虚拟人物（由LLM驱动）围坐圆桌进行谁是卧底游戏，用户作为旁观者观看全过程。每个AI角色有独特人设，通过描述、推理、投票来进行游戏，追求"一本正经胡说八道"的喜剧反差效果。盒子上的 Qwen3.6-35B-A3B 模型提供了所需的自然语言生成能力。

## What Changes

- **新建前端游戏页面**：圆桌布局展示6个AI玩家，包含头像、名字、描述气泡、投票结果展示，以及可折叠的历史记录面板
- **新建后端游戏引擎**：管理游戏状态机（IDLE→DEALING→DESCRIBING→VOTING→RESULT→GAME_OVER），内存存储游戏状态，无需数据库
- **新建LLM调用逻辑**：基于模板内置 `llm-client.js`，每个玩家独立调用LLM生成描述和投票。卧底和平民的prompt结构完全相同，仅词语不同，确保卧底不知道自己是卧底
- **新建词库系统**：50+组精选相似词对，每对包含平民词和卧底词，词库筛选时确保禁字不太常见
- **新建SSE流式推送**：描述阶段通过Server-Sent Events逐字推送到前端，实现打字机效果
- **游戏规则：禁字机制**：描述中不能包含手中词语的任何一个字（作为游戏规则告知模型，非硬性约束）。投票时模型可根据"谁违反了禁字规则"作为可疑线索来推理
- **6个AI玩家人设**：老王(理性分析师)、小美(时尚达人)、阿强(搞笑担当)、大刘(暴脾气直性子)、Lily(海归留学生)、老张(高冷大叔)
- **用户控制节奏**：用户点击"开始游戏"启动，点击"下一轮"推进游戏，全程旁观

## Capabilities

### New Capabilities
- `game-engine`: 游戏状态管理与流程控制，包括状态机、词库分配、身份标记、轮次推进、胜负判定
- `ai-players`: AI玩家的LLM调用逻辑，包括人设定义、描述生成（含历史上下文和禁字规则）、投票推理
- `game-ui`: 前端游戏界面，包括圆桌布局、描述流展示（SSE打字机效果）、投票结果、历史记录面板、游戏控制

### Modified Capabilities
（无已有能力修改）

## Impact

- **新增前端文件**：`src/pages/GamePage.tsx`、`src/components/` 下6个组件、`src/types/game.ts`、`src/services/gameApi.ts`
- **新增后端文件**：`server/routes/game.js`（SSE路由）、`server/game/engine.js`、`server/game/wordPairs.js`、`server/game/players.js`
- **复用模板内置**：`server/llm-client.js`（chat函数）、`server/index.js`（Express框架）、`vite.config.ts`（Vite+proxy）
- **LLM服务依赖**：盒子 cube-llm 服务（192.168.3.171:11435），使用 Qwen3.6-35B-A3B 模型
- **无需数据库**：游戏状态在Node进程内存中，重启即重置
- **appKey**：`who-is-wodi`，网关路由前缀 `/<appKey>/`
- **技术栈**：React 18 + TypeScript + Vite + Ant Design v6 + Less + CSS Modules
