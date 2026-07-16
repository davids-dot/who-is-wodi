/**
 * 游戏 API 封装（多实例版 + 用户参与模式）
 *
 * 盒子模式：所有请求通过 /api/<appKey>/game/<gameId>/<action> 前缀访问后端（网关去掉 /api）
 * 公网模式：直接请求 /game/<gameId>/<action> （同源，无网关）
 * SSE 流式请求使用原生 fetch + ReadableStream
 *
 * gameId 通过 crypto.randomUUID() 生成，存储在 sessionStorage（每 tab 独立）
 */

import type { GamePublicState, VoteResult, RoundHistory, SSEEvent, Vote, GameMode } from '../types/game'

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

/** SSE 事件回调类型 */
export interface SSECallbacks {
  onDescribeStart?: (playerId: number, playerName: string, avatar: string) => void
  onDescribeChunk?: (playerId: number, text: string) => void
  onDescribeEnd?: (playerId: number, playerName: string, fullText: string) => void
  onThinking?: (playerId: number, playerName: string) => void
  onUserTurn?: () => void
  onRoundComplete?: (round: number) => void
  onError?: (message: string) => void
  onPlayerError?: (playerId: number, playerName: string, message: string) => void
}

/**
 * 开始新游戏
 */
export async function startGame(mode: GameMode = 'participate'): Promise<GamePublicState> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  const json = await res.json()
  return json.data
}

/**
 * SSE: AI 玩家分批描述
 * @param isFirstBatch true: 座位1-3的AI描述（可能末尾发user_turn）; false: 座位5-7的AI描述
 * @param isNewRound 是否是新的一轮（仅 isFirstBatch=true 时有效）
 * @param callbacks SSE 事件回调
 */
export async function describeBatch(
  isFirstBatch: boolean,
  isNewRound: boolean,
  callbacks: SSECallbacks
): Promise<void> {
  const response = await fetch(`${API_BASE}/game/${getGameId()}/describe-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ isFirstBatch, isNewRound, isSecondBatch: !isFirstBatch }),
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
  callbacks: SSECallbacks
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
    case 'thinking':
      callbacks.onThinking?.(data.playerId!, data.playerName!)
      break
    case 'user_turn':
      callbacks.onUserTurn?.()
      break
    case 'round_complete':
      callbacks.onRoundComplete?.(data.round!)
      break
    case 'error':
      callbacks.onError?.(data.message || '未知错误')
      break
    case 'player_error':
      callbacks.onPlayerError?.(data.playerId!, data.playerName!, data.message || '玩家超时')
      break
  }
}

/**
 * 用户提交描述文本
 */
export async function userDescribe(text: string): Promise<void> {
  await fetch(`${API_BASE}/game/${getGameId()}/user-describe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

/**
 * AI 投票
 */
export async function aiVote(): Promise<{ aiVotes: Vote[] }> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/ai-vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json()
  return json.data
}

/**
 * 用户提交投票
 */
export async function userVote(voteFor: string, reason: string): Promise<Vote> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/user-vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voteFor, reason }),
  })
  const json = await res.json()
  return json.data
}

/**
 * 投票结果（淘汰 + 游戏结束检查）
 */
export async function voteResult(aiVotes: Vote[], userVoteResult: Vote | null): Promise<VoteResult> {
  const res = await fetch(`${API_BASE}/game/${getGameId()}/vote-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aiVotes, userVote: userVoteResult }),
  })
  const json = await res.json()
  return json.data
}

/**
 * 用户离开页面，游戏结束（sendBeacon 确保页面卸载时仍发送）
 */
export function abandon(): void {
  const gameId = getGameId()
  const url = `${API_BASE}/game/${gameId}/abandon`
  try {
    navigator.sendBeacon(url)
  } catch {
    // sendBeacon 不可用时忽略
  }
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
export async function resetGame(mode: GameMode = 'participate'): Promise<GamePublicState> {
  const newGameId = regenerateGameId()
  const res = await fetch(`${API_BASE}/game/${newGameId}/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  const json = await res.json()
  return json.data
}
