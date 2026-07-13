import React from 'react'
import type { Player, Vote } from '../types/game'
import PlayerSeat from './PlayerSeat'
import type { PlayerStatus } from './PlayerSeat'
import styles from './RoundTable.module.less'

interface RoundTableProps {
  players: Player[]
  speakingPlayerId: number | null
  typingPlayerId: number | null
  votes: Vote[] | null
}

/** 圆桌尺寸常量，需与 PlayerSeat 的定位逻辑一致 */
const TABLE_SIZE = 480
const SEAT_RADIUS = 200
const TABLE_CENTER = TABLE_SIZE / 2

/** 根据座位索引计算在 SVG 坐标系中的位置 */
function getSeatPos(index: number): { x: number; y: number } {
  const angle = (index * 60 - 90) * (Math.PI / 180)
  return {
    x: TABLE_CENTER + Math.cos(angle) * SEAT_RADIUS,
    y: TABLE_CENTER + Math.sin(angle) * SEAT_RADIUS,
  }
}

const RoundTable: React.FC<RoundTableProps> = ({
  players,
  speakingPlayerId,
  typingPlayerId,
  votes,
}) => {
  /** 根据 voteFor 名字查找玩家索引 */
  function nameToIndex(name: string): number {
    return players.findIndex((p) => p.name === name)
  }

  /** 根据 voterId 查找玩家索引 */
  function idToIndex(id: number): number {
    return players.findIndex((p) => p.id === id)
  }

  return (
    <div className={styles.tableContainer}>
      <div className={styles.table}>
        {/* SVG 投票连线层 */}
        {votes && votes.length > 0 && (
          <svg
            className={styles.voteSvg}
            width={TABLE_SIZE}
            height={TABLE_SIZE}
            viewBox={`0 0 ${TABLE_SIZE} ${TABLE_SIZE}`}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#ff4d4f" />
              </marker>
            </defs>
            {votes.map((vote, i) => {
              const fromIdx = idToIndex(vote.voterId)
              const toIdx = nameToIndex(vote.voteFor)
              if (fromIdx < 0 || toIdx < 0) return null

              const from = getSeatPos(fromIdx)
              const to = getSeatPos(toIdx)

              // 线条不要从圆心到圆心，缩短两端留出间距
              const dx = to.x - from.x
              const dy = to.y - from.y
              const dist = Math.sqrt(dx * dx + dy * dy)
              const shorten = 38
              const ratio = shorten / dist
              const x1 = from.x + dx * ratio
              const y1 = from.y + dy * ratio
              const x2 = to.x - dx * ratio
              const y2 = to.y - dy * ratio

              return (
                <line
                  key={`vote-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={styles.voteLine}
                  markerEnd="url(#arrowhead)"
                />
              )
            })}
          </svg>
        )}

        <div className={styles.tableCenter}>
          <div className={styles.tableLabel}>🎭 谁是卧底</div>
        </div>
        {players.map((player, index) => {
          let status: PlayerStatus = 'active'
          if (!player.isAlive) {
            status = 'eliminated'
          } else if (speakingPlayerId === player.id) {
            status = 'speaking'
          }

          return (
            <PlayerSeat
              key={player.id}
              player={player}
              status={status}
              isTyping={typingPlayerId === player.id}
              position={index}
            />
          )
        })}
      </div>
    </div>
  )
}

export default RoundTable
