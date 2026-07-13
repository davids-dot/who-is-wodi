/**
 * LLM 客户端模块 — 封装 cube-llm 服务的 LLM 调用
 *
 * 支持四种能力：
 *   - chat:       文本对话（含流式响应、思考模式开关）
 *   - vision:     视觉理解（图片 URL + 文本指令）
 *   - embeddings:  向量嵌入（单文本/批量）
 *   - rerank:     重排序（query + documents → 按相关性排序）
 *
 * 模型服务: cube-llm（OpenAI 兼容 API）
 *   开发环境: http://<BOX_IP>:11435/v1
 *   生产环境: http://cube-llm:11435/v1
 *
 * 环境变量:
 *   LLM_BASE_URL        — LLM 服务地址（含 /v1 后缀）
 *   LLM_MODEL_CHAT      — 文本对话模型（默认 Qwen3.6-35B-A3B）
 *   LLM_MODEL_VISION    — 视觉理解模型（默认 Qwen3.6-35B-A3B）
 *   LLM_MODEL_EMBEDDING — 嵌入模型（默认 bge-m3）
 *   LLM_MODEL_RERANKER  — 重排序模型（默认 bge-reranker-v2-m3）
 *
 * ⚠️ 重要陷阱（修改本文件前必读，详见 docs/MODEL_SKILL.md）:
 *   1. OpenAI SDK v5 Node.js 不支持 extra_body（Python SDK 概念）
 *      → chat_template_kwargs 必须作为顶层参数传递，不能用 extra_body
 *   2. vLLM 思考模式返回字段是 reasoning_content（非 thinking）
 *   3. embeddings/rerank 使用原生 fetch（非 OpenAI SDK），因 /v1/rerank 非 OpenAI 标准
 *   4. rerank 的 relevance_score 可为负数，不是 0-1 范围
 */

const OpenAI = require('openai');

// ========== 客户端初始化 ==========

const baseURL = process.env.LLM_BASE_URL || 'cube-llm:11435/v1';
const fullBaseURL = baseURL.startsWith('http') ? baseURL : `http://${baseURL}`;

if (!process.env.LLM_BASE_URL) {
  console.warn('[llm-client] LLM_BASE_URL not set, using default: cube-llm:11435/v1');
}

const client = new OpenAI({
  baseURL: fullBaseURL,
  apiKey: process.env.LLM_API_KEY || 'not-needed', // 云端 API 需提供 LLM_API_KEY，盒子 cube-llm 无需鉴权
});

// 模型名称从环境变量读取，提供默认值
const MODEL_CHAT = process.env.LLM_MODEL_CHAT || 'Qwen3.6-35B-A3B';
const MODEL_VISION = process.env.LLM_MODEL_VISION || 'Qwen3.6-35B-A3B';
const MODEL_EMBEDDING = process.env.LLM_MODEL_EMBEDDING || 'bge-m3';
const MODEL_RERANKER = process.env.LLM_MODEL_RERANKER || 'bge-reranker-v2-m3';

// ========== chat: 文本对话 ==========

/**
 * 文本对话 — 调用 Qwen3.6-35B-A3B 模型
 *
 * 支持 Function Calling / Tool Calling：
 *   - 传入 tools 参数后，模型可返回 tool_calls 而非文本
 *   - 响应中新增 toolCalls 和 finishReason 字段
 *   - 流式模式下自动累积 delta.tool_calls 增量片段
 *
 * @param {Object} params
 * @param {Array<{role: string, content: string}>} params.messages - 对话消息列表（必需）
 * @param {string} [params.systemPrompt] - 系统提示词（可选）
 * @param {boolean} [params.enableThinking=false] - 是否开启思考模式
 * @param {boolean} [params.stream=false] - 是否流式返回
 * @param {string} [params.model] - 自定义模型名称
 * @param {number} [params.temperature] - 温度参数 0-2（默认 1，越高越随机）
 * @param {number} [params.maxTokens] - 最大生成 token 数
 * @param {Array} [params.tools=[]] - 工具定义列表（OpenAI function format）
 * @param {string} [params.toolChoice='auto'] - 工具选择策略（'auto' | 'none' | 指定函数）
 *
 * --- 以下为 OpenAI Chat Completions 标准参数（llama-swap 实测支持，按需传入）---
 *
 * @param {number} [params.topP] - 核采样概率 0-1（默认 1，只从概率前 topP 的 token 中采样）
 *   常用调参：temperature=0.7 + topP=0.9 → 平衡创造性和质量
 * @param {number} [params.frequencyPenalty] - 频率惩罚 -2.0~2.0（默认 0，正值减少重复用词）
 * @param {number} [params.presencePenalty] - 存在惩罚 -2.0~2.0（默认 0，正值鼓励引入新话题）
 * @param {string|Array<string>} [params.stop] - 停止序列（最多 4 个，模型生成到这些字符串时停止）
 * @param {number} [params.seed] - 随机种子（相同 seed + 参数 → 可复现输出，适合测试调试）
 * @param {Object} [params.responseFormat] - 响应格式强制，如 { type: 'json_object' } 强制 JSON 输出
 *   注意：使用 json_object 时 messages 中需包含 "json" 关键词
 * @param {number} [params.n] - 生成候选回复数量（默认 1，>1 时返回多条 choices）
 * @param {number} [params.maxCompletionTokens] - 新版 max_tokens（OpenAI 新模型用，llama-swap 也支持）
 * @param {boolean} [params.logprobs] - 是否返回 token 对数概率（默认 false）
 * @param {number} [params.topLogprobs] - 返回每个位置最可能的 N 个 token（0-20，需同时传 logprobs=true）
 * @param {Object} [params.streamOptions] - 流式选项，如 { include_usage: true } 在流末尾返回 token 用量
 * @param {boolean} [params.parallelToolCalls] - 是否允许并行工具调用（默认 true）
 * @param {string} [params.user] - 终端用户标识符（用于监控和滥用检测）
 *
 * --- 以下为 llama.cpp 扩展参数（llama-swap 实测支持，非 OpenAI 标准）---
 *
 * @param {number} [params.topK] - Top-K 采样（llama.cpp 扩展，只从概率最高的 K 个 token 中采样）
 * @param {number} [params.minP] - Min-P 采样（llama.cpp 扩展，动态最小概率阈值）
 * @param {number} [params.repeatPenalty] - 重复惩罚（llama.cpp 扩展，默认 1.1，>1 减少重复）
 *
 * @returns {Promise<Object>|AsyncGenerator} 非流式返回 { content, thinking, toolCalls, finishReason }, 流式返回 async iterator
 */
async function chat(params) {
  const {
    messages,
    systemPrompt,
    enableThinking = false,
    stream = false,
    model,
    temperature,
    maxTokens,
    tools = [],
    toolChoice = 'auto',
    // --- OpenAI Chat Completions 标准参数（llama-swap 实测支持，默认 undefined 表示不传）---
    topP,                  // 核采样概率 0-1
    frequencyPenalty,       // 频率惩罚 -2.0~2.0
    presencePenalty,        // 存在惩罚 -2.0~2.0
    stop,                   // 停止序列（string | string[]）
    seed,                   // 随机种子（可复现输出）
    responseFormat,         // 响应格式 { type: 'json_object' | 'text' }
    n,                      // 生成候选数量
    maxCompletionTokens,    // 新版 max_tokens
    logprobs,               // 是否返回对数概率
    topLogprobs,            // 每位置返回 top-N token（0-20，需 logprobs=true）
    streamOptions,          // 流式选项 { include_usage: true }
    parallelToolCalls,      // 允许并行工具调用
    user,                   // 终端用户标识
    // --- llama.cpp 扩展参数（llama-swap 实测支持，非 OpenAI 标准）---
    topK,                   // Top-K 采样
    minP,                   // Min-P 采样
    repeatPenalty,          // 重复惩罚
  } = params;

  // 构建消息列表
  const fullMessages = [];
  if (systemPrompt) {
    fullMessages.push({ role: 'system', content: systemPrompt });
  }
  fullMessages.push(...messages);

  // 构建请求参数
  const requestOptions = {
    model: model || MODEL_CHAT,
    messages: fullMessages,
    stream,
  };

  // 思考模式控制（不同 provider 参数格式不同）
  // - vLLM: 通过 chat_template_kwargs 传递（盒子本地模型）
  // - DashScope: 通过顶层 enable_thinking 参数传递（qwen3 系列默认开启思考，需显式关闭）
  // - DeepSeek: 不支持思考模式参数，不传
  if (process.env.LLM_PROVIDER === 'vllm') {
    requestOptions.chat_template_kwargs = { enable_thinking: enableThinking };
  } else if (process.env.LLM_PROVIDER === 'dashscope') {
    requestOptions.enable_thinking = enableThinking;
  }

  if (temperature !== undefined) requestOptions.temperature = temperature;
  if (maxTokens !== undefined) requestOptions.max_tokens = maxTokens;

  // --- OpenAI 标准参数透传（仅在值不为 undefined 时设置，不改变默认行为）---
  if (topP !== undefined) requestOptions.top_p = topP;
  if (frequencyPenalty !== undefined) requestOptions.frequency_penalty = frequencyPenalty;
  if (presencePenalty !== undefined) requestOptions.presence_penalty = presencePenalty;
  if (stop !== undefined) requestOptions.stop = stop;
  if (seed !== undefined) requestOptions.seed = seed;
  if (responseFormat !== undefined) requestOptions.response_format = responseFormat;
  if (n !== undefined) requestOptions.n = n;
  if (maxCompletionTokens !== undefined) requestOptions.max_completion_tokens = maxCompletionTokens;
  if (logprobs !== undefined) requestOptions.logprobs = logprobs;
  if (topLogprobs !== undefined) requestOptions.top_logprobs = topLogprobs;
  if (streamOptions !== undefined) requestOptions.stream_options = streamOptions;
  if (parallelToolCalls !== undefined) requestOptions.parallel_tool_calls = parallelToolCalls;
  if (user !== undefined) requestOptions.user = user;
  // --- llama.cpp 扩展参数透传 ---
  if (topK !== undefined) requestOptions.top_k = topK;
  if (minP !== undefined) requestOptions.min_p = minP;
  if (repeatPenalty !== undefined) requestOptions.repeat_penalty = repeatPenalty;

  // Function Calling: 总是透传 tools 和 tool_choice（空数组等同于不传）
  requestOptions.tools = tools;
  requestOptions.tool_choice = toolChoice;

  if (stream) {
    // 流式模式：返回 async generator
    return (async function* () {
      const streamResponse = await client.chat.completions.create(requestOptions);
      // 流式 tool_calls 累积器：按 index 分组，首 chunk 记录 id/type/name，后续追加 arguments
      const toolCallAccumulator = {};
      let lastFinishReason = null;

      for await (const chunk of streamResponse) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          yield { content: delta.content };
        }
        if (delta?.reasoning_content) {
          yield { thinking: delta.reasoning_content };
        }

        // 累积流式 tool_calls
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallAccumulator[idx]) {
              toolCallAccumulator[idx] = {
                id: tc.id || '',
                type: tc.type || 'function',
                function: { name: '', arguments: '' },
              };
            }
            if (tc.id) toolCallAccumulator[idx].id = tc.id;
            if (tc.function?.name) toolCallAccumulator[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallAccumulator[idx].function.arguments += tc.function.arguments;
          }
        }

        if (choice?.finish_reason) {
          lastFinishReason = choice.finish_reason;
        }
      }

      // 流结束后，如果有累积的 tool_calls，yield 完整结果
      const accumulatedToolCalls = Object.keys(toolCallAccumulator)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => toolCallAccumulator[k]);

      if (accumulatedToolCalls.length > 0) {
        yield { toolCalls: accumulatedToolCalls };
      }
      if (lastFinishReason) {
        yield { finishReason: lastFinishReason };
      }
    })();
  }

  // 非流式模式
  const response = await client.chat.completions.create(requestOptions);
  const choice = response.choices?.[0];
  const message = choice?.message || {};

  return {
    content: message.content || '',
    thinking: message.reasoning_content || '',
    toolCalls: message.tool_calls || null,
    finishReason: choice?.finish_reason || 'stop',
  };
}

// ========== vision: 视觉理解 ==========

/**
 * 视觉理解 — 调用 Qwen3.6-35B-A3B 模型分析图片
 *
 * @param {Object} params
 * @param {string} params.imageUrl - 图片 URL（通常通过 luya 上传获得）
 * @param {string} params.prompt - 文本指令（如"描述这张图片"）
 * @param {string} [params.systemPrompt] - 系统提示词（可选）
 * @param {boolean} [params.enableThinking=false] - 是否开启思考模式
 * @param {string} [params.model] - 自定义模型名称
 * @param {number} [params.temperature] - 温度参数 0-2
 * @param {number} [params.maxTokens] - 最大生成 token 数
 * @param {number} [params.topP] - 核采样概率 0-1
 * @param {number} [params.frequencyPenalty] - 频率惩罚 -2.0~2.0
 * @param {number} [params.presencePenalty] - 存在惩罚 -2.0~2.0
 * @param {string|Array<string>} [params.stop] - 停止序列
 * @param {number} [params.seed] - 随机种子
 * @returns {Promise<{content: string, thinking: string}>}
 */
async function vision(params) {
  const {
    imageUrl,
    prompt,
    systemPrompt,
    enableThinking = false,
    model,
    // --- 与 chat() 相同的可选参数（视觉场景常用子集）---
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
    stop,
    seed,
  } = params;

  // 构建 OpenAI vision 格式的 messages
  const fullMessages = [];
  if (systemPrompt) {
    fullMessages.push({ role: 'system', content: systemPrompt });
  }
  fullMessages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageUrl } },
    ],
  });

  const requestOptions = {
    model: model || MODEL_VISION,
    messages: fullMessages,
    stream: false,
  };

  // 思考模式控制（与 chat() 一致）
  if (process.env.LLM_PROVIDER === 'vllm') {
    requestOptions.chat_template_kwargs = { enable_thinking: enableThinking };
  } else if (process.env.LLM_PROVIDER === 'dashscope') {
    requestOptions.enable_thinking = enableThinking;
  }

  // 可选参数透传（与 chat() 一致，仅在值不为 undefined 时设置）
  if (temperature !== undefined) requestOptions.temperature = temperature;
  if (maxTokens !== undefined) requestOptions.max_tokens = maxTokens;
  if (topP !== undefined) requestOptions.top_p = topP;
  if (frequencyPenalty !== undefined) requestOptions.frequency_penalty = frequencyPenalty;
  if (presencePenalty !== undefined) requestOptions.presence_penalty = presencePenalty;
  if (stop !== undefined) requestOptions.stop = stop;
  if (seed !== undefined) requestOptions.seed = seed;

  const response = await client.chat.completions.create(requestOptions);
  const choice = response.choices?.[0];
  const message = choice?.message || {};

  return {
    content: message.content || '',
    thinking: message.reasoning_content || '',
  };
}

// ========== embeddings: 向量嵌入 ==========

/**
 * 向量嵌入 — 调用 bge-m3 模型生成文本向量
 *
 * @param {Object} params
 * @param {string|string[]} params.input - 单文本或文本数组
 * @param {string} [params.model] - 自定义模型名称
 * @param {string} [params.encodingFormat] - 编码格式 'float'（默认）或 'base64'（减少传输体积）
 * @returns {Promise<number[]|number[][]>} 单文本返回 number[]，批量返回 number[][]
 */
async function embeddings(params) {
  const { input, model, encodingFormat } = params;

  const body = {
    model: model || MODEL_EMBEDDING,
    input,
  };
  if (encodingFormat !== undefined) body.encoding_format = encodingFormat;

  const response = await fetch(`${fullBaseURL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embeddings API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const embeddingsList = (data.data || []).map((item) => item.embedding);

  // 单文本输入返回单个数组，批量输入返回数组的数组
  return Array.isArray(input) ? embeddingsList : embeddingsList[0] || [];
}

// ========== rerank: 重排序 ==========

/**
 * 重排序 — 调用 bge-reranker-v2-m3 模型对文档列表按相关性排序
 *
 * @param {Object} params
 * @param {string} params.query - 查询文本
 * @param {string[]} params.documents - 待排序的文档列表
 * @param {number} [params.topN] - 返回前 N 个结果（不指定则返回全部）
 * @param {string} [params.model] - 自定义模型名称
 * @returns {Promise<Array<{index: number, document: {text: string}, relevance_score: number}>>}
 */
async function rerank(params) {
  const { query, documents, topN, model } = params;

  const body = {
    model: model || MODEL_RERANKER,
    query,
    documents,
  };
  if (topN !== undefined) body.top_n = topN;

  const response = await fetch(`${fullBaseURL}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Rerank API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.results || [];
}

// ========== chatWithTools: 带 Tool 执行循环的对话 ==========

/**
 * 带 Tool 执行循环的文本对话
 *
 * 自动循环：LLM → tool_calls → 执行 handler → 结果回传 → LLM → ... 直到模型返回最终回答
 *
 * @param {Object} params
 * @param {Array} params.messages - 对话消息列表
 * @param {Array} params.tools - 工具定义列表（OpenAI function format）
 * @param {Object<string, Function>} params.toolHandlers - 工具名称→处理函数映射，handler 接收解析后的参数对象，返回结果字符串
 * @param {string} [params.systemPrompt] - 系统提示词
 * @param {number} [params.maxRounds=5] - 最大循环次数
 * @param {string} [params.model] - 自定义模型名称
 * @param {number} [params.temperature] - 温度参数 0-2
 * @param {number} [params.maxTokens] - 最大生成 token 数
 * @param {boolean} [params.enableThinking=false] - 是否开启思考模式
 * @param {number} [params.topP] - 核采样概率 0-1
 * @param {number} [params.frequencyPenalty] - 频率惩罚 -2.0~2.0
 * @param {number} [params.presencePenalty] - 存在惩罚 -2.0~2.0
 * @param {string|Array<string>} [params.stop] - 停止序列
 * @param {number} [params.seed] - 随机种子
 * @returns {Promise<{content: string, thinking: string, toolCallHistory: Array}>}
 */
async function chatWithTools(params) {
  const {
    messages,
    tools,
    toolHandlers,
    systemPrompt,
    maxRounds = 5,
    model,
    temperature,
    maxTokens,
    enableThinking = false,
    // 透传给 chat() 的可选采样参数
    topP,
    frequencyPenalty,
    presencePenalty,
    stop,
    seed,
  } = params;

  if (!tools || tools.length === 0) {
    throw new Error('tools is required and must be a non-empty array');
  }
  if (!toolHandlers || typeof toolHandlers !== 'object') {
    throw new Error('toolHandlers is required and must be an object');
  }

  // 构建可变消息列表（循环中会追加 assistant tool_calls 和 tool results）
  const conversationMessages = [...messages];
  const toolCallHistory = [];

  for (let round = 0; round < maxRounds; round++) {
    // 调用 LLM
    const result = await chat({
      messages: conversationMessages,
      systemPrompt,
      enableThinking,
      stream: false,
      model,
      temperature,
      maxTokens,
      tools,
      toolChoice: 'auto',
      // 透传可选采样参数
      topP,
      frequencyPenalty,
      presencePenalty,
      stop,
      seed,
    });

    // 模型返回最终回答，结束循环
    if (result.finishReason !== 'tool_calls' || !result.toolCalls) {
      return {
        content: result.content,
        thinking: result.thinking,
        toolCallHistory,
      };
    }

    // 模型请求调用工具：将 assistant 的 tool_calls 消息加入对话
    conversationMessages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });

    // 逐个执行 tool handler
    for (const toolCall of result.toolCalls) {
      const handler = toolHandlers[toolCall.function.name];
      let toolResult;

      if (!handler) {
        toolResult = `Error: tool "${toolCall.function.name}" not found in toolHandlers`;
      } else {
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          toolResult = await handler(args);
          if (typeof toolResult !== 'string') {
            toolResult = JSON.stringify(toolResult);
          }
        } catch (err) {
          toolResult = `Error executing tool "${toolCall.function.name}": ${err.message}`;
        }
      }

      // 记录到历史
      toolCallHistory.push({
        round: round + 1,
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        arguments: toolCall.function.arguments,
        result: toolResult,
      });

      // 将 tool 结果回传给模型
      conversationMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  // 超过最大循环次数
  const err = new Error(`chatWithTools exceeded maxRounds (${maxRounds})`);
  err.toolCallHistory = toolCallHistory;
  throw err;
}

// ========== 导出 ==========

module.exports = {
  client,
  chat,
  chatWithTools,
  vision,
  embeddings,
  rerank,
  // 导出模型名称常量，供路由层使用
  models: {
    chat: MODEL_CHAT,
    vision: MODEL_VISION,
    embedding: MODEL_EMBEDDING,
    reranker: MODEL_RERANKER,
  },
};
