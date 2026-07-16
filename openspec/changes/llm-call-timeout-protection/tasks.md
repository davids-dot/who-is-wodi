## 1. 环境变量与配置

- [ ] 1.1 在 `.env` 文件中添加 `LLM_TIMEOUT_MS=30000` 和 `LLM_IDLE_TIMEOUT_MS=15000`
- [x] 1.2 在 `server/llm-client.js` 顶部读取并解析超时配置，导出为模块常量（含默认值降级）

## 2. LLM 流式超时机制（llm-client.js）

- [x] 2.1 在 `chat()` 函数的流式分支中，创建 `AbortController` 并将 `signal` 传入 `client.chat.completions.create(requestOptions)`
- [x] 2.2 实现总超时计时器：从调用开始计时，超过 `LLM_TIMEOUT_MS` 后调用 `controller.abort()` 并抛出 `LLM_TIMEOUT` 错误
- [x] 2.3 实现空闲超时计时器：初始启动，每收到一个 chunk 重置；超过 `LLM_IDLE_TIMEOUT_MS` 后调用 `controller.abort()` 并抛出 `LLM_TIMEOUT` 错误
- [x] 2.4 在流正常结束（`for await` 循环退出）后，清除两个计时器
- [x] 2.5 在 `catch` 块中清除计时器，并将 `AbortError` 转换为带 `code: 'LLM_TIMEOUT'` 的自定义错误抛出

## 3. 描述生成重试机制（engine.js）

- [x] 3.1 在 `generateDescription()` 函数中，将 `llm.chat()` 流式调用包裹在 try-catch 中
- [x] 3.2 catch 中检查 `err.code === 'LLM_TIMEOUT'`，若是则重试 1 次（记录 warn 日志）
- [x] 3.3 重试仍失败则抛出错误（不吞掉），确保 `game.currentDescriptions` 不被推入空描述
- [x] 3.4 非超时错误直接抛出，不重试

## 4. 投票生成重试机制（engine.js）

- [x] 4.1 在 `generateVote()` 函数中，将 `llm.chat()` 非流式调用包裹在 try-catch 中（现有 catch 已有 fallback 逻辑）
- [x] 4.2 在现有 catch 之前增加超时判断：若 `err.code === 'LLM_TIMEOUT'`，重试 1 次
- [x] 4.3 重试仍失败则走现有 fallback 随机投票逻辑

## 5. SSE 单玩家容错（routes/game.js）

- [x] 5.1 在 `describe-batch` 路由的 `for` 循环中，将单个玩家的描述生成 + SSE 写入包裹在 try-catch 中
- [x] 5.2 catch 中发送 `player_error` SSE 事件：`{ playerId, playerName, message }`，记录 error 日志
- [x] 5.3 catch 后继续 `for` 循环的下一个玩家，不中断 SSE 流
- [x] 5.4 在 `next-round` 路由中做相同的容错改造

## 6. 前端处理 player_error 事件

- [x] 6.1 在 `gameApi.ts` 的 SSE 事件监听中，添加 `player_error` 事件处理
- [x] 6.2 在 `GamePage.tsx` 中，收到 `player_error` 时展示 Ant Design `message.warning` 提示（如"小陈描述超时，已跳过"）
- [x] 6.3 在 `DescriptionPanel.tsx` 中，为被跳过的玩家展示"⏱️ 超时未描述"占位文本

## 7. 测试验证

- [x] 7.1 编写测试脚本模拟 DashScope 流式调用超时场景（mock 一个永不返回的流），验证 AbortController 在超时后正确触发
- [x] 7.2 编写测试脚本验证重试逻辑：第一次超时、第二次正常返回时能成功获取描述
- [x] 7.3 编写测试脚本验证 SSE 容错：模拟第 4 个玩家超时，验证第 5-7 个玩家仍能正常描述
- [x] 7.4 手动验证：启动游戏，观察 AI 观战模式下 7 个玩家是否能全部完成描述（无卡死）
