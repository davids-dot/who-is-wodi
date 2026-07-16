import React, { useEffect, useRef } from 'react'
import { Card, Empty, Tag } from 'antd'
import type { Player, RoundHistory, Description } from '../types/game'
import styles from './DescriptionPanel.module.less'

interface DescriptionPanelProps {
  players: Player[]
  /** 当前轮次的流式描述: { playerId: text } */
  currentDescriptions: Record<number, string>
  /** 后端存储的当前轮次完整描述列表（含人类描述） */
  currentRoundDescriptions?: Description[]
  /** 正在活动(说话/思考)的玩家 */
  activePlayer?: { id: number; type: 'speaking' | 'thinking' } | null
  /** 历史轮次记录 */
  history: RoundHistory[]
  /** 当前轮次 */
  round: number
  /** 被超时跳过的玩家: { playerId: message } */
  skippedPlayers?: Record<number, string>
}

const DescriptionPanel: React.FC<DescriptionPanelProps> = ({
  players,
  currentDescriptions,
  currentRoundDescriptions = [],
  activePlayer,
  history,
  round,
  skippedPlayers,
}) => {
  const listRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [currentDescriptions, history])

  /** 根据 playerId 获取玩家信息 */
  function getPlayer(id: number): Player | undefined {
    return players.find((p) => p.id === id)
  }

  /** 渲染单条描述 */
  function renderDescriptionItem(
    _playerId: number,
    playerName: string,
    avatar: string,
    text: string,
    isUndercover: boolean,
    isTyping: boolean,
    key: string
  ) {
    return (
      <div key={key} className={`${styles.msgItem} ${isUndercover ? styles.undercoverMsg : ''}`}>
        <span className={styles.msgAvatar}>{avatar}</span>
        <div className={styles.msgBody}>
          <span className={styles.msgName}>
            {playerName}
            {isUndercover && <Tag color="red" className={styles.msgTag}>卧底</Tag>}
          </span>
          <span className={styles.msgText}>
            {text}
            {isTyping && <span className={styles.cursor}>|</span>}
          </span>
        </div>
      </div>
    )
  }

  return (
    <Card
      title={`描述记录 (第 ${round} 轮)`}
      size="small"
      className={styles.panel}
      styles={{ body: { padding: 0 } }}
    >
      <div ref={listRef} className={styles.msgList}>
        {history.length === 0 && Object.keys(currentDescriptions).length === 0 ? (
          <div className={styles.empty}>
            <Empty description="点击「开始游戏」→「下一轮」" />
          </div>
        ) : (
          <>
            {/* 历史轮次描述 */}
            {history.map((rh) =>
              rh.descriptions.map((desc) => {
                const p = getPlayer(desc.playerId)
                return renderDescriptionItem(
                  desc.playerId,
                  desc.playerName,
                  p?.avatar || '👤',
                  desc.text,
                  p?.isUndercover || false,
                  false,
                  `h-${rh.round}-${desc.playerId}`
                )
              })
            )}

            {/* 当前轮次描述：只在有流式数据且历史未包含当前轮时显示 */}
            {currentRoundDescriptions.length > 0 && round > history.length ? (
              currentRoundDescriptions.map((desc) => {
                const p = getPlayer(desc.playerId)
                return renderDescriptionItem(
                  desc.playerId,
                  desc.playerName,
                  p?.avatar || '👤',
                  desc.text,
                  p?.isUndercover || false,
                  false,
                  `cr-${desc.playerId}`
                )
              })
            ) : (
              // 流式描述：只在当前轮次不在历史中时显示
              round > history.length && Object.entries(currentDescriptions).map(([pid, text]) => {
                const playerId = Number(pid)
                const p = getPlayer(playerId)
                if (!p) return null
                const isSkipped = skippedPlayers && skippedPlayers[playerId]
                return renderDescriptionItem(
                  playerId,
                  p.name,
                  p.avatar,
                  isSkipped ? '⏱️ 超时未描述' : text,
                  p.isUndercover || false,
                  activePlayer?.id === playerId && activePlayer.type === 'speaking',
                  `c-${playerId}`
                )
              })
            )}

            {/* 被跳过但未在 currentDescriptions 中的玩家 */}
            {skippedPlayers && Object.entries(skippedPlayers).map(([pid, msg]) => {
              const playerId = Number(pid)
              // 如果已经在 currentDescriptions 中显示则跳过
              if (currentDescriptions[playerId] !== undefined) return null
              const p = getPlayer(playerId)
              if (!p) return null
              return renderDescriptionItem(
                playerId,
                p.name,
                p.avatar,
                `⏱️ ${msg}`,
                p.isUndercover || false,
                false,
                `s-${playerId}`
              )
            })}
          </>
        )}
      </div>
    </Card>
  )
}

export default DescriptionPanel
