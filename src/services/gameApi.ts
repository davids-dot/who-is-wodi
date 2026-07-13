/**
 * 游戏 API 封装（多实例版）
 *
 * 盒子模式：所有请求通过 /api/<appKey>/game/<gameId>/<action> 前缀访问后端（网关去掉 /api）
 * 公网模式：直接请求 /game/<gameId>/<action> （同源，无网关）
 * SSE 流式请求使用原生 fetch + ReadableStream
 *
 * gameId 通过 crypto.randomUUID() 生成，存储在 sessionStorage（每 tab 独立）
 */

import type { GamePublicState, VoteResult, RoundHistory, SSEEvent } from '../types/game'

// 盒子模式 __APP_KEY__ 非空：API_BASE = /api/<appKey>
// 公网模式 __APP_KEY__ 为空：API_BASE = ''（直接请求 /game/...）
const API_BASE = __APP_KEY__ ? `/api/${__APP_KEY__}` : ''

const GAME_ID_KEY = 'wodi-game-id'

/**
 * 获取当前 tab 的 gameId（sessionStorage 隔离，每 tab 独立）
 * 不存在时自动生成并存储
 */
export function getGameId(): string {
  let gameId = sessionStorage.getItem(GAME_ID_KEY)
  if (!gameId) {
    gameId = crypto.randomUUID()
    sessionStorage.setItem(GAME_ID_KEY, gameId)
  }
  return gameId
}

/**
 * 重新生成 gameId（用于重置游戏时创建新实例）
 */
function regenerateGameId(): string {
  const gameId = crypto.randomUUID()
  sessionStorage.setItem(GAME_ID_KEY, gameId)
  return gameId
}

/**
 * 开始新游戏
 */
export async function startGame(): Promise<GamePublicState> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json()
  return json.data
}

/**
 * 下一轮描述 (SSE 流式)
 * @param isNewRound 是否是新的一轮（第一次描述为 false，后续为 true）
 * @param callbacks SSE 事件回调
 */
export async function nextRound(
  isNewRound: boolean,
  callbacks: {
    onDescribeStart?: (playerId: number, playerName: string, avatar: string) => void
    onDescribeChunk?: (playerId: number, text: string) => void
    onDescribeEnd?: (playerId: number, playerName: string, fullText: string) => void
    onRoundComplete?: (round: number) => void
    onError?: (message: string) => void
  }
): Promise<void> {
  const response = await fetch(`${API_BASE}/game/${getGameId()}/next-round`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ isNewRound }),
  })

  if (!response.body) throw new Error('No response body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    let currentEvent = ''
    let currentData = ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6)
      } else if (line === '' && currentEvent) {
        // 空行表示一个 SSE 事件结束
        try {
          const parsed = JSON.parse(currentData) as SSEEvent['data']
          handleSSEEvent(currentEvent, parsed, callbacks)
        } catch {
          // 忽略解析错误
        }
        currentEvent = ''
        currentData = ''
      }
    }
  }
}

/** 处理单个 SSE 事件 */
function handleSSEEvent(
  event: string,
  data: SSEEvent['data'],
  callbacks: {
    onDescribeStart?: (playerId: number, playerName: string, avatar: string) => void
    onDescribeChunk?: (playerId: number, text: string) => void
    onDescribeEnd?: (playerId: number, playerName: string, fullText: string) => void
    onRoundComplete?: (round: number) => void
    onError?: (message: string) => void
  }
): void {
  switch (event) {
    case 'describe_start':
      callbacks.onDescribeStart?.(data.playerId!, data.playerName!, data.avatar!)
      break
    case 'describe_chunk':
      callbacks.onDescribeChunk?.(data.playerId!, data.text!)
      break
    case 'describe_end':
      callbacks.onDescribeEnd?.(data.playerId!, data.playerName!, data.fullText!)
      break
    case 'round_complete':
      callbacks.onRoundComplete?.(data.round!)
      break
    case 'error':
      callbacks.onError?.(data.message || '未知错误')
      break
  }
}

/**
 * 触发投票
 */
export async function vote(): Promise<VoteResult> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json()
  return json.data
}

/**
 * 获取游戏状态
 */
export async function getGameState(): Promise<GamePublicState> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/state`)
  const json = await res.json()
  return json.data
}

/**
 * 获取历史记录
 */
export async function getHistory(): Promise<RoundHistory[]> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/history`)
  const json = await res.json()
  return json.data
}

/**
 * 重置游戏（重新生成 gameId，新游戏新实例）
 */
export async function resetGame(): Promise<GamePublicState> {
  const newGameId = regenerateGameId()
  const res = await fetch(`${API_BASE}/game/${newGameId}/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json()
  return json.data
}
