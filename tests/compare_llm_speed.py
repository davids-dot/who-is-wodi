"""
LLM API 速度对比测试脚本 v2

修复点：
1. 修复流式响应解析（兼容空 choices 的 chunk）
2. DashScope 关闭思考模式 (enable_thinking=false)，公平对比
3. 同样限制 max_tokens，确保输出长度一致
"""

import asyncio
import time
import json
import sys

import httpx

# ===== API 配置 =====

LONGCAT_BASE_URL = "https://api.longcat.chat/openai/v1"
LONGCAT_API_KEY = "ak_2lw2xZ8qz4M21D13yI0dh1lC9gB19"
LONGCAT_MODEL = "LongCat-2.0"

DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_API_KEY = "sk-600c64d620454dae8df1bd86541a099a"
DASHSCOPE_MODEL = "qwen3.6-flash"

# 测试用的 prompt（模拟游戏中的描述场景）
TEST_MESSAGES = [
    {"role": "system", "content": "你是一个游戏玩家，正在玩'谁是卧底'游戏。"},
    {"role": "user", "content": "请用一句话描述'苹果'这个词，不要直接说出这个词，描述要有特点但不要太明显。"},
]

# 测试轮数
ROUNDS = 3
MAX_TOKENS = 150


async def list_models(base_url: str, api_key: str, name: str) -> list[str]:
    """列出 API 可用的模型列表"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("id", "") for m in data.get("data", [])]
                print(f"[{name}] 可用模型 ({len(models)} 个):")
                for m in models[:10]:
                    print(f"  - {m}")
                if len(models) > 10:
                    print(f"  ... 还有 {len(models) - 10} 个")
                return models
            else:
                print(f"[{name}] 获取模型列表失败: {resp.status_code} {resp.text[:200]}")
                return []
    except Exception as e:
        print(f"[{name}] 获取模型列表异常: {e}")
        return []


async def test_streaming(
    base_url: str,
    api_key: str,
    model: str,
    name: str,
    round_num: int,
    extra_params: dict | None = None,
) -> dict | None:
    """测试流式请求，测量 TTFB 和生成速度"""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": TEST_MESSAGES,
        "stream": True,
        "max_tokens": MAX_TOKENS,
    }
    if extra_params:
        payload.update(extra_params)

    ttfb = None
    total_time = None
    content = ""
    token_count = 0

    try:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"{base_url}/chat/completions",
                headers=headers,
                json=payload,
            ) as resp:
                if resp.status_code != 200:
                    error_bytes = await resp.aread()
                    print(f"  [{name}] 第{round_num}轮 HTTP {resp.status_code}: {error_bytes.decode()[:300]}")
                    return None

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

                    # 记录首 token 时间（content 或 reasoning_content 都算）
                    if ttfb is None and (delta.get("content") or delta.get("reasoning_content")):
                        ttfb = time.perf_counter() - start

                    if delta.get("content"):
                        content += delta["content"]
                        token_count += 1

        total_time = time.perf_counter() - start

        if ttfb is None and not content:
            print(f"  [{name}] 第{round_num}轮 未收到流式数据")
            return None

        # 如果没有收到 content 但有 reasoning_content，ttfb 仍可能已设置
        if ttfb is None:
            ttfb = total_time

        result = {
            "name": name,
            "model": model,
            "round": round_num,
            "ttfb": ttfb,
            "total_time": total_time,
            "content_length": len(content),
            "approx_tokens": token_count,
            "tokens_per_sec": token_count / total_time if total_time > 0 else 0,
            "content_preview": content[:100] if content else "(空)",
        }
        print(f"  [{name}] 第{round_num}轮: TTFB={ttfb:.3f}s  总耗时={total_time:.3f}s  约{token_count}tok  {token_count/total_time:.1f}tok/s  内容: {content[:60]}...")
        return result

    except Exception as e:
        print(f"  [{name}] 第{round_num}轮 异常: {e}")
        return None


async def test_non_streaming(
    base_url: str,
    api_key: str,
    model: str,
    name: str,
    round_num: int,
    extra_params: dict | None = None,
) -> dict | None:
    """测试非流式请求"""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": TEST_MESSAGES,
        "max_tokens": MAX_TOKENS,
    }
    if extra_params:
        payload.update(extra_params)

    try:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            total_time = time.perf_counter() - start

            if resp.status_code != 200:
                print(f"  [{name}] 第{round_num}轮 HTTP {resp.status_code}: {resp.text[:300]}")
                return None

            data = resp.json()
            choice = data.get("choices", [{}])[0]
            message = choice.get("message", {})
            content = message.get("content", "")
            reasoning = message.get("reasoning_content", "")

            usage = data.get("usage", {})
            prompt_tokens = usage.get("prompt_tokens", 0)
            completion_tokens = usage.get("completion_tokens", 0)
            # 有些 API 返回 completion_tokens_details
            details = usage.get("completion_tokens_details", {})
            reasoning_tokens = details.get("reasoning_tokens", 0)

            result = {
                "name": name,
                "model": model,
                "round": round_num,
                "total_time": total_time,
                "content_length": len(content),
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "reasoning_tokens": reasoning_tokens,
                "output_tokens": completion_tokens - reasoning_tokens,
                "tokens_per_sec": (completion_tokens - reasoning_tokens) / total_time if total_time > 0 and (completion_tokens - reasoning_tokens) > 0 else 0,
                "content_preview": content[:100],
            }
            extra_info = f" (thinking={reasoning_tokens}tok)" if reasoning_tokens > 0 else ""
            print(f"  [{name}] 第{round_num}轮: 总耗时={total_time:.3f}s  output={completion_tokens - reasoning_tokens}tok{extra_info}  {result['tokens_per_sec']:.1f}tok/s  内容: {content[:60]}...")
            return result

    except Exception as e:
        print(f"  [{name}] 第{round_num}轮 异常: {e}")
        return None


def print_summary(results: list, name: str):
    """打印汇总结果"""
    valid = [r for r in results if r is not None]
    if not valid:
        print(f"\n  [{name}] 无有效结果")
        return

    avg_total = sum(r["total_time"] for r in valid) / len(valid)

    if "ttfb" in valid[0]:
        avg_ttfb = sum(r["ttfb"] for r in valid) / len(valid)
        avg_tps = sum(r.get("tokens_per_sec", 0) for r in valid) / len(valid)
        print(f"\n  [{name}] 汇总 (有效{len(valid)}/{ROUNDS}轮):")
        print(f"    平均 TTFB:     {avg_ttfb:.3f}s")
        print(f"    平均总耗时:    {avg_total:.3f}s")
        print(f"    平均生成速度:  {avg_tps:.1f} tokens/s")
    else:
        avg_tps = sum(r.get("tokens_per_sec", 0) for r in valid) / len(valid)
        avg_output = sum(r.get("output_tokens", r.get("completion_tokens", 0)) for r in valid) / len(valid)
        print(f"\n  [{name}] 汇总 (有效{len(valid)}/{ROUNDS}轮):")
        print(f"    平均总耗时:    {avg_total:.3f}s")
        print(f"    平均输出tokens: {avg_output:.0f}")
        print(f"    平均生成速度:  {avg_tps:.1f} tokens/s")


async def main():
    print("=" * 60)
    print("LLM API 速度对比测试 v2")
    print(f"LongChat:  {LONGCAT_MODEL} @ {LONGCAT_BASE_URL}")
    print(f"DashScope: {DASHSCOPE_MODEL} @ {DASHSCOPE_BASE_URL} (关闭思考模式)")
    print(f"每API测试 {ROUNDS} 轮, max_tokens={MAX_TOKENS}")
    print("=" * 60)

    # DashScope 关闭思考模式参数
    # qwen3 系列默认开启思考模式，需要通过 extra_body / 顶层参数关闭
    dashscope_extra = {"enable_thinking": False}

    # ===== 流式测速 =====
    print(f"\n>>> 流式测速\n")

    longcat_stream_results = []
    dashscope_stream_results = []

    for i in range(1, ROUNDS + 1):
        r = await test_streaming(LONGCAT_BASE_URL, LONGCAT_API_KEY, LONGCAT_MODEL, "LongChat", i)
        longcat_stream_results.append(r)
        r = await test_streaming(DASHSCOPE_BASE_URL, DASHSCOPE_API_KEY, DASHSCOPE_MODEL, "DashScope", i, dashscope_extra)
        dashscope_stream_results.append(r)
        if i < ROUNDS:
            await asyncio.sleep(0.5)

    print_summary(longcat_stream_results, "LongChat-Stream")
    print_summary(dashscope_stream_results, "DashScope-Stream")

    # ===== 非流式测速 =====
    print(f"\n>>> 非流式测速\n")

    longchat_results = []
    dashscope_results = []

    for i in range(1, ROUNDS + 1):
        r = await test_non_streaming(LONGCAT_BASE_URL, LONGCAT_API_KEY, LONGCAT_MODEL, "LongChat", i)
        longchat_results.append(r)
        r = await test_non_streaming(DASHSCOPE_BASE_URL, DASHSCOPE_API_KEY, DASHSCOPE_MODEL, "DashScope", i, dashscope_extra)
        dashscope_results.append(r)
        if i < ROUNDS:
            await asyncio.sleep(0.5)

    print_summary(longchat_results, "LongChat-NoStream")
    print_summary(dashscope_results, "DashScope-NoStream")

    # ===== 最终对比 =====
    print("\n" + "=" * 60)
    print("最终对比结果")
    print("=" * 60)

    print(f"\n{'API':25s}  {'模式':8s}  {'平均TTFB':>10s}  {'平均耗时':>10s}  {'速度(tok/s)':>12s}")
    print("-" * 70)

    for label, results in [
        ("LongChat", longcat_stream_results),
        ("DashScope", dashscope_stream_results),
        ("LongChat", longchat_results),
        ("DashScope", dashscope_results),
    ]:
        valid = [r for r in results if r]
        if not valid:
            continue
        is_stream = "ttfb" in valid[0]
        mode = "流式" if is_stream else "非流式"
        avg_total = sum(r["total_time"] for r in valid) / len(valid)
        avg_tps = sum(r.get("tokens_per_sec", 0) for r in valid) / len(valid)
        if is_stream:
            avg_ttfb = sum(r["ttfb"] for r in valid) / len(valid)
            ttfb_str = f"{avg_ttfb:.3f}s"
        else:
            ttfb_str = "N/A"
        print(f"{label:25s}  {mode:8s}  {ttfb_str:>10s}  {avg_total:.3f}s    {avg_tps:>10.1f}")

    print()


if __name__ == "__main__":
    asyncio.run(main())
