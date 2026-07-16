## Context

当前 `engine.js` 中的 prompt 构建函数：
- `buildDescriptionSystemPrompt`: 构建描述系统提示
- `buildDescriptionUserMessage`: 构建描述用户消息，包含历史记录
- `buildVoteSystemPrompt`: 构建投票系统提示
- `buildVoteUserMessage`: 构建投票用户消息

AI 策略目前较为简单，需要增强博弈性。

## Goals / Non-Goals

**Goals:**
- 第一轮描述增加模糊约束，防止过早暴露
- 卧底具备猜词能力，能根据他人描述反推平民词
- 卧底投票时能主动"搅浑水"带节奏
- 所有改动对前端透明

**Non-Goals:**
- 不修改词库
- 不修改游戏核心规则（人数、胜负条件等）
- 不引入新的游戏状态

## Decisions

### 1. 第一轮模糊描述实现

**选择**：在 `buildDescriptionUserMessage` 中根据轮次和描述顺序动态调整 prompt

**规则**：
```
if (round === 1 && descriptionOrder <= 3) {
  // 前3个描述的人使用模糊 prompt
  prompt += "这是第一轮，你是前几个描述的人。\n";
  prompt += "千万不要说得太具体！不要说功能、用途。\n";
  prompt += "应该说：是一种日常用品/大家都见过/描述颜色形状感觉\n";
}
```

**理由**：
- 改动最小，只需修改 prompt
- 效果明显，能防止过早暴露

### 2. 卧底搅浑水策略实现

**选择**：在 `buildVoteUserMessage` 中为卧底添加特殊策略提示

**策略选择逻辑**：
```
if (player.isUndercover) {
  prompt += "你是卧底，要隐藏身份并搅浑水。\n";
  prompt += "投票策略选择：\n";
  prompt += "1. 【嫁祸】质疑最可疑的平民，让其他人也怀疑他\n";
  prompt += "2. 【抱团】支持另一个被怀疑的人，转移注意力\n";
  prompt += "3. 【装傻】说自己不确定，降低存在感\n";
  prompt += "根据局势选择最合适的策略，在理由中'带节奏'。\n";
}
```

**理由**：
- 不需要复杂的局势判断算法，让 LLM 自己选策略
- 通过 prompt 引导 LLM 生成更有策略性的投票理由

### 3. 卧底猜词机制实现

**选择**：新增函数 `generateUndercoverDescription`，卧底描述前先猜词

**流程**：
```
async function generateUndercoverDescription(gameId, player) {
  // 1. 让 LLM 根据历史描述推测平民词
  const inferredWord = await inferCivilianWord(history, player.word);
  
  // 2. 根据推测的词生成擦边球描述
  const description = await generateAmbiguousDescription(
    inferredWord, 
    player.word
  );
  
  return description;
}
```

**擦边球描述要求**：
- 对平民词和卧底词都适用
- 不说具体功能，说共同特征
- 例如：键盘 vs 钢琴 → "有黑白颜色的"

**理由**：
- 最复杂的改动，需要新增 LLM 调用
- 但效果最显著，让卧底真正具备"借力打力"能力

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 第一轮太模糊导致游戏无法进行 | 只约束前3个人，后面可以正常描述 |
| 卧底猜词错误导致描述更暴露 | 猜词失败时回退到保守描述 |
| 搅浑水策略过于激进被识破 | 让 LLM 自己判断局势，不强制策略 |
| 增加 LLM 调用次数导致延迟 | 猜词和描述可以合并为一个请求 |

## Open Questions

1. 卧底猜词时，是否需要告诉 LLM 两个词的相似性提示？
   - 建议：不给额外提示，让 LLM 纯从描述推断

2. 第一轮模糊描述的强度如何把握？
   - 建议：先实现基础版本，根据测试调整

3. 是否需要为不同人设设计不同的策略倾向？
   - 建议：第一阶段不做，后续可以考虑
