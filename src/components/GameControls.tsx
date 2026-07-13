import React from 'react'
import { Button, Space, Tooltip } from 'antd'
import {
  PlayCircleOutlined,
  ForwardOutlined,
  TeamOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { GameStateType } from '../types/game'
import styles from './GameControls.module.less'

interface GameControlsProps {
  gameState: GameStateType
  loading: boolean
  /** 是否可以发起描述（IDLE / RESULT / DESCRIBING 但尚无描述） */
  canDescribe: boolean
  /** 是否已有描述可以投票 */
  hasDescriptions: boolean
  onStart: () => void
  onNextRound: () => void
  onVote: () => void
  onReset: () => void
}

const GameControls: React.FC<GameControlsProps> = ({
  gameState,
  loading,
  canDescribe,
  hasDescriptions,
  onStart,
  onNextRound,
  onVote,
  onReset,
}) => {
  const isIdle = gameState === 'IDLE'
  const canVote = hasDescriptions && !loading

  return (
    <div className={styles.container}>
      <Space size="middle">
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={onStart}
          disabled={!isIdle || loading}
          loading={loading}
          size="large"
        >
          开始游戏
        </Button>

        <Button
          type="primary"
          icon={<ForwardOutlined />}
          onClick={onNextRound}
          disabled={!canDescribe || loading}
          loading={loading}
          size="large"
          ghost
        >
          {isIdle ? '直接开始' : '开始描述'}
        </Button>

        <Button
          icon={<TeamOutlined />}
          onClick={onVote}
          disabled={!canVote}
          loading={loading}
          size="large"
        >
          投票
        </Button>

        <Tooltip title="重置游戏">
          <Button
            icon={<ReloadOutlined />}
            onClick={onReset}
            disabled={loading}
            danger
            size="large"
          />
        </Tooltip>
      </Space>
    </div>
  )
}

export default GameControls
