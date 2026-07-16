import React from 'react'
import { Button, Space, Tooltip, Radio } from 'antd'
import {
  PlayCircleOutlined,
  ForwardOutlined,
  TeamOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { GameMode } from '../types/game'
import type { EnginePhase } from '../hooks/useGameEngine'
import styles from './GameControls.module.less'

interface GameControlsProps {
  phase: EnginePhase
  loading: boolean
  hasStarted: boolean
  gameMode: GameMode
  onModeChange: (mode: GameMode) => void
  onStart: () => void
  onNextRound: () => void
  onVote: () => void
  onReset: () => void
}

const GameControls: React.FC<GameControlsProps> = ({
  phase,
  loading,
  hasStarted,
  gameMode,
  onModeChange,
  onStart,
  onNextRound,
  onVote,
  onReset,
}) => {
  const isIdle = phase === 'IDLE'

  // 描述完成、待投票状态
  const canDescribe = phase === 'IDLE' && hasStarted;
  const canVote = phase === 'DESCRIBE_DONE';

  return (
    <div className={styles.container}>
      <Space size="middle" wrap>
        {/* 模式选择器：仅在未开始时显示 */}
        {!hasStarted && (
          <Radio.Group
            value={gameMode}
            onChange={(e) => onModeChange(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="participate">🎮 亲自参与</Radio.Button>
            <Radio.Button value="ai">👁️ AI 观战</Radio.Button>
          </Radio.Group>
        )}

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
          {isIdle ? '继续' : '开始描述'}
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
