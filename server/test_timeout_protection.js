/**
 * 测试脚本：验证 LLM 流式调用超时保护机制
 *
 * 测试项：
 *   7.1 模拟 DashScope 流式调用超时（mock 永不返回的流），验证 AbortController 在超时后正确触发
 *   7.2 验证重试逻辑：第一次超时、第二次正常返回时能成功获取描述
 *   7.3 验证 SSE 容错：模拟第 4 个玩家超时，验证后续玩家仍能正常描述
 *
 * 运行: cd server && node test_timeout_protection.js
 */

// ========== 测试框架 ==========
const assert = require('assert');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      passedTests++;
      console.log(`  ✅ ${name}`);
    } catch (err) {
      failedTests++;
      console.error(`  ❌ ${name}: ${err.message}`);
    }
  };
}

// ========== Mock LLM client ==========
// 模拟 llm-client.js 的 chat() 流式调用，但不真正请求 DashScope

/**
 * 创建一个 mock chat 函数
 * @param {Array<'normal'|'timeout'|'delayed'>} sequence - 每次调用的行为序列
 *   'normal'   - 正常返回流式 chunk
 *   'timeout'  - 永不返回（模拟 DashScope 挂起）
 *   'delayed'  - 延迟 100ms 后返回
 * @param {number} timeoutMs - 超时阈值（覆盖环境变量）
 */
function createMockChat(sequence, timeoutMs = 500) {
  let callIndex = 0;

  return function chat({ stream }) {
    if (!stream) {
      // 非流式调用直接返回
      return Promise.resolve({ content: '{"voteFor":"测试","reason":"测试"}', thinking: '', toolCalls: null, finishReason: 'stop' });
    }

    const behavior = sequence[callIndex % sequence.length];
    callIndex++;

    // 模拟 llm-client.js 的流式超时机制
    return (async function* () {
      const controller = new AbortController();
      const { signal } = controller;

      let totalTimer = null;
      let idleTimer = null;
      let aborted = false;

      function clearTimeouts() {
        if (totalTimer) { clearTimeout(totalTimer); totalTimer = null; }
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      }

      function abortWithTimeout() {
        if (aborted) return;
        aborted = true;
        clearTimeouts();
        controller.abort();
      }

      totalTimer = setTimeout(abortWithTimeout, timeoutMs);
      idleTimer = setTimeout(abortWithTimeout, timeoutMs);

      try {
        if (behavior === 'timeout') {
          // 永不返回任何 chunk，等待超时
          await new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          });
        } else if (behavior === 'delayed') {
          // 延迟后返回
          await new Promise(resolve => setTimeout(resolve, 100));
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(abortWithTimeout, timeoutMs);
          yield { content: '延迟的描述' };
        } else {
          // 正常立即返回
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(abortWithTimeout, timeoutMs);
          yield { content: '正常描述' };
        }
        clearTimeouts();
      } catch (err) {
        clearTimeouts();
        if (aborted || err.name === 'AbortError') {
          const timeoutErr = new Error(`LLM stream timeout (total=${timeoutMs}ms)`);
          timeoutErr.code = 'LLM_TIMEOUT';
          throw timeoutErr;
        }
        throw err;
      }
    })();
  };
}

// ========== 模拟 engine.js 的 generateDescription 重试逻辑 ==========

async function* generateDescriptionWithRetry(mockChat, player) {
  const MAX_ATTEMPTS = 2;
  let fullText = '';
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const stream = await mockChat({
        messages: [],
        systemPrompt: 'test',
        stream: true,
        temperature: 0.9,
        maxTokens: 100,
      });

      fullText = '';
      for await (const chunk of stream) {
        if (chunk.content) {
          fullText += chunk.content;
          yield chunk.content;
        }
      }

      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (err.code === 'LLM_TIMEOUT' && attempt < MAX_ATTEMPTS) {
        console.log(`    [retry] 第 ${attempt} 次超时，重试中...`);
      } else {
        throw err;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return fullText;
}

// ========== 测试用例 ==========

async function test7_1_TimeoutTriggersAbort() {
  console.log('\n=== 7.1 验证超时后 AbortController 正确触发 ===');

  await test('超时后抛出 LLM_TIMEOUT 错误', async () => {
    const mockChat = createMockChat(['timeout'], 300);
    const stream = await mockChat({ stream: true });

    let thrownError = null;
    try {
      for await (const chunk of stream) {
        // 不应收到任何 chunk
      }
    } catch (err) {
      thrownError = err;
    }

    assert(thrownError, '应该抛出错误');
    assert(thrownError.code === 'LLM_TIMEOUT', `错误码应为 LLM_TIMEOUT，实际为 ${thrownError.code}`);
  })();

  await test('正常调用不触发超时', async () => {
    const mockChat = createMockChat(['normal'], 5000);
    const stream = await mockChat({ stream: true });

    let fullText = '';
    for await (const chunk of stream) {
      if (chunk.content) fullText += chunk.content;
    }

    assert(fullText === '正常描述', `应收到"正常描述"，实际收到"${fullText}"`);
  })();
}

async function test7_2_RetryOnTimeout() {
  console.log('\n=== 7.2 验证重试逻辑：第一次超时、第二次正常 ===');

  await test('第一次超时重试后成功', async () => {
    // 第一次 timeout，第二次 normal
    const mockChat = createMockChat(['timeout', 'normal'], 300);

    let fullText = '';
    let errorThrown = false;

    try {
      const gen = generateDescriptionWithRetry(mockChat, { name: '测试玩家' });
      for await (const chunk of gen) {
        if (chunk) fullText += chunk;
      }
    } catch (err) {
      errorThrown = true;
    }

    assert(!errorThrown, '重试后应成功，不应抛出错误');
    assert(fullText === '正常描述', `重试后应收到"正常描述"，实际收到"${fullText}"`);
  })();

  await test('两次都超时则抛出错误', async () => {
    const mockChat = createMockChat(['timeout', 'timeout'], 300);

    let errorThrown = false;
    let errorCode = null;

    try {
      const gen = generateDescriptionWithRetry(mockChat, { name: '测试玩家' });
      for await (const chunk of gen) {
        // 不应收到 chunk
      }
    } catch (err) {
      errorThrown = true;
      errorCode = err.code;
    }

    assert(errorThrown, '两次超时后应抛出错误');
    assert(errorCode === 'LLM_TIMEOUT', `错误码应为 LLM_TIMEOUT，实际为 ${errorCode}`);
  })();
}

async function test7_3_SSEFaultTolerance() {
  console.log('\n=== 7.3 验证 SSE 容错：模拟第 4 个玩家超时 ===');

  await test('第 4 个玩家超时后第 5 个玩家仍能正常描述', async () => {
    // 7 个玩家：前 3 个正常，第 4 个两次都超时（重试也失败），第 5-7 个正常
    const behaviors = ['normal', 'normal', 'normal', 'timeout', 'timeout', 'normal', 'normal', 'normal', 'normal'];
    const mockChat = createMockChat(behaviors, 300);

    const players = [
      { id: 1, name: '老王' },
      { id: 2, name: '小美' },
      { id: 3, name: '阿强' },
      { id: 4, name: '小陈' },
      { id: 5, name: '大刘' },
      { id: 6, name: 'Lily' },
      { id: 7, name: '老张' },
    ];

    const results = []; // { playerId, success, text }
    const errors = [];  // { playerId, message }

    for (const player of players) {
      try {
        let fullText = '';
        const gen = generateDescriptionWithRetry(mockChat, player);
        for await (const chunk of gen) {
          if (chunk) fullText += chunk;
        }
        results.push({ playerId: player.id, success: true, text: fullText });
      } catch (err) {
        errors.push({ playerId: player.id, message: err.message });
        results.push({ playerId: player.id, success: false, text: '' });
      }
    }

    // 前 3 个玩家正常
    assert(results[0].success, '老王应成功');
    assert(results[1].success, '小美应成功');
    assert(results[2].success, '阿强应成功');

    // 第 4 个玩家超时失败
    assert(!results[3].success, '小陈应超时失败');
    assert(errors.length > 0, '应有错误记录');

    // 第 5-7 个玩家正常
    assert(results[4].success, '大刘应成功');
    assert(results[5].success, 'Lily应成功');
    assert(results[6].success, '老张应成功');

    console.log(`    结果: 成功 ${results.filter(r => r.success).length}/7, 失败 ${results.filter(r => !r.success).length}/7`);
  })();
}

// ========== 主函数 ==========

async function main() {
  console.log('=========================================');
  console.log('LLM 超时保护测试');
  console.log('=========================================');

  await test7_1_TimeoutTriggersAbort();
  await test7_2_RetryOnTimeout();
  await test7_3_SSEFaultTolerance();

  console.log('\n=========================================');
  console.log(`测试结果: ✅ ${passedTests} 通过, ❌ ${failedTests} 失败`);
  console.log('=========================================');

  process.exit(failedTests > 0 ? 1 : 0);
}

main();
