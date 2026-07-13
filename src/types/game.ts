/** 游戏状态枚举 */
export type GameStateType =
  | 'IDLE'
  | 'DEALING'
  | 'DESCRIBING'
  | 'VOTING'
  | 'RESULT'
  | 'GAME_OVER'

/** 玩家信息 */
export interface Player {
  id: number
  name: string
  avatar: string
  isAlive: boolean
  isUndercover?: boolean
  word?: string
}

/** 描述记录 */
export interface Description {
  playerId: number
  playerName: string
  round: number
  text: string
  timestamp: string
}

/** 投票记录 */
export interface Vote {
  voterId: number
  voterName: string
  voteFor: string
  reason: string
  isFallback: boolean
}

/** 被淘汰玩家信息 */
export interface EliminatedPlayer {
  id: number
  name: string
  avatar: string
  isUndercover: boolean
  word: string
}

/** 历史轮次记录 */
export interface RoundHistory {
  round: number
  descriptions: Description[]
  votes: Vote[]
  eliminated: EliminatedPlayer | null
  isTie: boolean
}

/** 词对 */
export interface WordPair {
  civilian: string
  undercover: string
}

/** 游戏公共状态 */
export interface GamePublicState {
  state: GameStateType
  round: number
  players: Player[]
  aliveCount: number
  currentRoundDescriptions: Description[]
  history: RoundHistory[]
  winner: string | null
  wordPair: WordPair | null
}

/** 投票结果 */
export interface VoteResult {
  votes: Vote[]
  eliminated: EliminatedPlayer | null
  isTie: boolean
  voteCount: Record<string, number>
  gameOver: boolean
  winner: string | null
  undercover: EliminatedPlayer | null
  state: GamePublicState
}

/** SSE 事件类型 */
export interface SSEEvent {
  event: string
  data: {
    playerId?: number
    playerName?: string
    avatar?: string
    text?: string
    fullText?: string
    round?: number
    message?: string
  }
}
