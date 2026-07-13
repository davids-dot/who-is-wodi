import React, { useEffect, useRef } from 'react'
import { Card, Empty, Tag } from 'antd'
import type { Player, RoundHistory } from '../types/game'
import styles from './DescriptionPanel.module.less'

interface DescriptionPanelProps {
  players: Player[]
  /** 当前轮次的流式描述: { playerId: text } */
  currentDescriptions: Record<number, string>
  /** 正在打字的玩家 ID */
  typingPlayerId: number | null
  /** 历史轮次记录 */
  history: RoundHistory[]
  /** 当前轮次 */
  round: number
}

const DescriptionPanel: React.FC<DescriptionPanelProps> = ({
  players,
  currentDescriptions,
  typingPlayerId,
  history,
  round,
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

            {/* 当前轮次流式描述 */}
            {Object.entries(currentDescriptions).map(([pid, text]) => {
              const playerId = Number(pid)
              const p = getPlayer(playerId)
              if (!p) return null
              return renderDescriptionItem(
                playerId,
                p.name,
                p.avatar,
                text,
                p.isUndercover || false,
                typingPlayerId === playerId,
                `c-${playerId}`
              )
            })}
          </>
        )}
      </div>
    </Card>
  )
}

export default DescriptionPanel
