import React, { useState } from 'react'
import type { Player } from '../types/game'
import styles from './PlayerSeat.module.less'

export type PlayerStatus = 'active' | 'speaking' | 'eliminated' | 'thinking'

interface PlayerSeatProps {
  player: Player
  status: PlayerStatus
  isTyping?: boolean
  position: number
}

/** 获取圆桌座位位置样式 */
function getPositionStyle(position: number): React.CSSProperties {
  const angle = (position * (360 / 7) - 90) * (Math.PI / 180)
  const radius = 200
  const x = Math.cos(angle) * radius
  const y = Math.sin(angle) * radius
  return {
    transform: `translate(${x}px, ${y}px)`,
  }
}

const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player,
  status,
  isTyping,
  position,
}) => {
  const posStyle = getPositionStyle(position)
  const [showTooltip, setShowTooltip] = useState(false)

  // 获取要显示的特质文本
  const getTooltipText = () => {
    if (player.isUndercover && status !== 'eliminated') {
      return `卧底：${player.personality || '暂无特质'}`
    }
    if (status === 'eliminated') {
      const identity = player.isUndercover ? '卧底' : '平民'
      return `${identity}：${player.personality || '暂无特质'}`
    }
    return player.personality || '暂无特质'
  }

  return (
    <div
      className={`${styles.seat} ${styles[status]}`}
      style={posStyle}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)}
    >
      <div className={styles.avatarWrap}>
        <span className={styles.avatar}>{player.avatar}</span>
        {isTyping && <span className={styles.typingDot} />}
      </div>
      <div className={styles.name}>{player.name}</div>
      {/* 卧底标签：旁观者可见，LLM 不知道 */}
      {player.isUndercover && status !== 'eliminated' && (
        <div className={styles.undercoverTag}>卧底</div>
      )}
      {/* 淘汰后显示身份 */}
      {status === 'eliminated' && (
        <div className={`${styles.identityTag} ${player.isUndercover ? styles.undercover : styles.civilian}`}>
          {player.isUndercover ? '卧底' : '平民'}
        </div>
      )}
      {showTooltip && (
        <div className={styles.personalityTooltip}>{getTooltipText()}</div>
      )}
    </div>
  )
}

export default PlayerSeat
