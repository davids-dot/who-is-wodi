/**
 * 测试脚本：验证 OpenAI SDK v5 是否正确传递 enable_thinking 参数给 DashScope
 * 
 * 运行: cd server && node test_dashscope_thinking.js
 */

const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'sk-600c64d620454dae8df1bd86541a099a',
});

async function testWithEnableThinking() {
  console.log('=== 测试1: 通过 SDK 传递 enable_thinking: false ===');
  
  const requestOptions = {
    model: 'qwen3.6-flash',
    messages: [
      { role: 'system', content: '你是谁' },
      { role: 'user', content: '用一句话描述钢琴，20字以内' },
    ],
    stream: true,
    temperature: 0.9,
    max_tokens: 100,
    enable_thinking: false,  // 关键参数
  };

  console.log('requestOptions:', JSON.stringify(requestOptions, null, 2));
  
  const startTime = Date.now();
  let fullContent = '';
  let fullThinking = '';
  let chunkCount = 0;
  
  try {
    // 设置 15 秒超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT: 15秒未收到响应')), 15000);
    });

    const streamPromise = (async () => {
      const stream = await client.chat.completions.create(requestOptions);
      for await (const chunk of stream) {
        chunkCount++;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          process.stdout.write(delta.content);
        }
        if (delta?.reasoning_content) {
          fullThinking += delta.reasoning_content;
        }
        if (choice?.finish_reason) {
          console.log('\n[finish_reason]:', choice.finish_reason);
        }
      }
    })();

    await Promise.race([streamPromise, timeoutPromise]);
    
    const elapsed = Date.now() - startTime;
    console.log('\n--- 结果 ---');
    console.log('耗时:', elapsed, 'ms');
    console.log('chunk 数:', chunkCount);
    console.log('content 长度:', fullContent.length);
    console.log('thinking 长度:', fullThinking.length);
    if (fullThinking) {
      console.log('thinking 前100字:', fullThinking.slice(0, 100));
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error('\n[ERROR] 耗时', elapsed, 'ms:', err.message);
  }
}

async function testWithoutEnableThinking() {
  console.log('\n=== 测试2: 不传 enable_thinking (默认思考模式) ===');
  
  const requestOptions = {
    model: 'qwen3.6-flash',
    messages: [
      { role: 'system', content: '你是谁' },
      { role: 'user', content: '用一句话描述钢琴，20字以内' },
    ],
    stream: true,
    temperature: 0.9,
    max_tokens: 100,
    // 不传 enable_thinking
  };

  const startTime = Date.now();
  let fullContent = '';
  let fullThinking = '';
  let chunkCount = 0;
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT: 15秒未收到响应')), 15000);
    });

    const streamPromise = (async () => {
      const stream = await client.chat.completions.create(requestOptions);
      for await (const chunk of stream) {
        chunkCount++;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          process.stdout.write(delta.content);
        }
        if (delta?.reasoning_content) {
          fullThinking += delta.reasoning_content;
        }
        if (choice?.finish_reason) {
          console.log('\n[finish_reason]:', choice.finish_reason);
        }
      }
    })();

    await Promise.race([streamPromise, timeoutPromise]);
    
    const elapsed = Date.now() - startTime;
    console.log('\n--- 结果 ---');
    console.log('耗时:', elapsed, 'ms');
    console.log('chunk 数:', chunkCount);
    console.log('content 长度:', fullContent.length);
    console.log('thinking 长度:', fullThinking.length);
    if (fullThinking) {
      console.log('thinking 前100字:', fullThinking.slice(0, 100));
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error('\n[ERROR] 耗时', elapsed, 'ms:', err.message);
  }
}

async function main() {
  await testWithEnableThinking();
  await testWithoutEnableThinking();
}

main();
