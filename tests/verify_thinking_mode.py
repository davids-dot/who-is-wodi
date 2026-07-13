"""
验证 DashScope qwen3.6-flash 关闭思考模式后的行为

测试场景：
1. 不传 enable_thinking（默认行为，应该有 thinking tokens）
2. 传 enable_thinking=false（关闭思考，应该没有 thinking tokens）
3. 通过模拟 llm-client.js 的逻辑验证
"""

import asyncio
import time
import json
import httpx

DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_API_KEY = "sk-600c64d620454dae8df1bd86541a099a"
MODEL = "qwen3.6-flash"

TEST_MESSAGES = [
    {"role": "system", "content": "你是一个游戏玩家，正在玩'谁是卧底'游戏。"},
    {"role": "user", "content": "请用一句话描述'苹果'这个词，不要直接说出这个词。"},
]


async def test_with_params(label: str, extra_params: dict | None = None):
    """测试不同的参数组合"""
    payload = {
        "model": MODEL,
        "messages": TEST_MESSAGES,
        "max_tokens": 150,
    }
    if extra_params:
        payload.update(extra_params)

    print(f"\n--- {label} ---")
    print(f"  额外参数: {extra_params or '无'}")

    try:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{DASHSCOPE_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            elapsed = time.perf_counter() - start

            if resp.status_code != 200:
                print(f"  HTTP {resp.status_code}: {resp.text[:300]}")
                return

            data = resp.json()
            choice = data["choices"][0]
            message = choice.get("message", {})
            content = message.get("content", "")
            reasoning = message.get("reasoning_content", "")

            usage = data.get("usage", {})
            completion_tokens = usage.get("completion_tokens", 0)
            details = usage.get("completion_tokens_details", {})
            reasoning_tokens = details.get("reasoning_tokens", 0)
            output_tokens = completion_tokens - reasoning_tokens

            has_thinking = "是" if (reasoning or reasoning_tokens > 0) else "否"
            print(f"  耗时:          {elapsed:.3f}s")
            print(f"  有思考内容:    {has_thinking}")
            print(f"  thinking_tokens: {reasoning_tokens}")
            print(f"  output_tokens:    {output_tokens}")
            print(f"  总completion_tokens: {completion_tokens}")
            print(f"  生成内容:      {content[:100]}")
            if reasoning:
                print(f"  思考内容预览:  {reasoning[:100]}...")

    except Exception as e:
        print(f"  异常: {e}")


async def test_streaming(label: str, extra_params: dict | None = None):
    """测试流式模式下的思考模式"""
    payload = {
        "model": MODEL,
        "messages": TEST_MESSAGES,
        "max_tokens": 150,
        "stream": True,
    }
    if extra_params:
        payload.update(extra_params)

    print(f"\n--- {label} (流式) ---")
    print(f"  额外参数: {extra_params or '无'}")

    content = ""
    reasoning = ""
    ttfb = None
    start = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"{DASHSCOPE_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as resp:
                if resp.status_code != 200:
                    error = await resp.aread()
                    print(f"  HTTP {resp.status_code}: {error.decode()[:300]}")
                    return

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    if ttfb is None and (delta.get("content") or delta.get("reasoning_content")):
                        ttfb = time.perf_counter() - start
                    if delta.get("content"):
                        content += delta["content"]
                    if delta.get("reasoning_content"):
                        reasoning += delta["reasoning_content"]

        elapsed = time.perf_counter() - start
        has_thinking = "是" if reasoning else "否"
        print(f"  TTFB:          {ttfb:.3f}s" if ttfb else "  TTFB:          N/A")
        print(f"  总耗时:        {elapsed:.3f}s")
        print(f"  有思考内容:    {has_thinking}")
        print(f"  thinking长度:  {len(reasoning)} 字符")
        print(f"  content长度:   {len(content)} 字符")
        print(f"  生成内容:      {content[:100]}")
        if reasoning:
            print(f"  思考内容预览:  {reasoning[:100]}...")

    except Exception as e:
        print(f"  异常: {e}")


async def main():
    print("=" * 60)
    print("DashScope qwen3.6-flash 思考模式验证")
    print("=" * 60)

    # 非流式测试
    # 1. 不传参数（默认开启思考）
    await test_with_params("默认（不传 enable_thinking）")

    # 2. 传 enable_thinking=false（关闭思考）— 模拟 llm-client.js 修改后的行为
    await test_with_params("关闭思考（enable_thinking=false）", {"enable_thinking": False})

    # 3. 传 enable_thinking=true（显式开启思考）
    await test_with_params("开启思考（enable_thinking=true）", {"enable_thinking": True})

    # 流式测试
    # 4. 流式默认（不传参数）
    await test_streaming("默认（不传 enable_thinking）")

    # 5. 流式关闭思考
    await test_streaming("关闭思考（enable_thinking=false）", {"enable_thinking": False})

    print("\n" + "=" * 60)
    print("验证结论:")
    print("  如果 '关闭思考' 场景的 reasoning_content 为空且耗时显著降低，")
    print("  则说明 llm-client.js 的修改生效。")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
