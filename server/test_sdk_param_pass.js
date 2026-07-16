/**
 * 测试脚本：拦截 fetch 请求，验证 OpenAI SDK v5 是否真的发送了 enable_thinking 参数
 * 
 * 运行: cd server && node test_sdk_param_pass.js
 */

const OpenAI = require('openai');

// 拦截全局 fetch，打印实际发送的请求体
const originalFetch = globalThis.fetch;
globalThis.fetch = async function(url, options) {
  if (options && options.body) {
    try {
      const body = JSON.parse(options.body);
      console.log('=== 实际 HTTP 请求体 ===');
      console.log('URL:', url);
      console.log('enable_thinking in body:', 'enable_thinking' in body);
      console.log('enable_thinking value:', body.enable_thinking);
      console.log('Full body keys:', Object.keys(body));
      console.log('========================');
    } catch (e) {
      // 非 JSON body，跳过
    }
  }
  return originalFetch.call(this, url, options);
};

const client = new OpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'sk-600c64d620454dae8df1bd86541a099a',
});

async function test() {
  console.log('\n--- 测试: SDK 是否传递 enable_thinking: false ---\n');
  
  const requestOptions = {
    model: 'qwen3.6-flash',
    messages: [
      { role: 'user', content: '说"你好"' },
    ],
    stream: true,
    max_tokens: 10,
    enable_thinking: false,
  };

  try {
    const stream = await client.chat.completions.create(requestOptions);
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
    console.log('\n\n[完成]');
  } catch (err) {
    console.error('\n[错误]:', err.message);
  }
}

test();
