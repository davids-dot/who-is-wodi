import React, { useState, useCallback } from 'react'
import { Layout, Row, Col, Card, Button, Result, Spin, message } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import RoundTable from '../components/RoundTable'
import DescriptionPanel from '../components/DescriptionPanel'
import VoteResult from '../components/VoteResult'
import GameControls from '../components/GameControls'
import HistoryPanel from '../components/HistoryPanel'
import * as gameApi from '../services/gameApi'
import type { GamePublicState, VoteResult as VoteResultType } from '../types/game'
import styles from './GamePage.module.less'

const { Header, Content } = Layout

const initialState: GamePublicState = {
  state: 'IDLE',
  round: 0,
  players: [],
  aliveCount: 0,
  currentRoundDescriptions: [],
  history: [],
  winner: null,
  wordPair: null,
}

const GamePage: React.FC = () => {
  const [gameState, setGameState] = useState<GamePublicState>(initialState)
  const [loading, setLoading] = useState(false)
  const [descriptions, setDescriptions] = useState<Record<number, string>>({})
  const [speakingPlayerId, setSpeakingPlayerId] = useState<number | null>(null)
  const [typingPlayerId, setTypingPlayerId] = useState<number | null>(null)
  const [voteResult, setVoteResult] = useState<VoteResultType | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)

  // 是否有当前轮次的描述内容
  const hasDescriptions = Object.keys(descriptions).length > 0
  // 是否可以发起描述：IDLE 状态、RESULT 状态（进入下一轮）、或 DESCRIBING 但尚无描述（首轮刚开始）
  const canDescribe =
    gameState.state === 'IDLE' ||
    gameState.state === 'RESULT' ||
    (gameState.state === 'DESCRIBING' && !hasDescriptions)

  /** 开始游戏 */
  const handleStart = useCallback(async () => {
    setLoading(true)
    setVoteResult(null)
    setDescriptions({})
    try {
      const state = await gameApi.startGame()
      setGameState(state)
      setHasStarted(true)
      message.success('游戏开始！6位AI玩家已就座')
    } catch (err) {
      message.error('游戏启动失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 下一轮描述（SSE 流式） */
  const handleNextRound = useCallback(async () => {
    setLoading(true)
    setVoteResult(null)
    setDescriptions({})

    const isNewRound = gameState.round > 0 && gameState.state !== 'DESCRIBING'

    try {
      await gameApi.nextRound(isNewRound, {
        onDescribeStart: (playerId, _playerName) => {
          setSpeakingPlayerId(playerId)
          setTypingPlayerId(playerId)
          setDescriptions((prev) => ({ ...prev, [playerId]: '' }))
        },
        onDescribeChunk: (playerId, text) => {
          setDescriptions((prev) => ({
            ...prev,
            [playerId]: (prev[playerId] || '') + text,
          }))
        },
        onDescribeEnd: (_playerId) => {
          setTypingPlayerId(null)
        },
        onRoundComplete: () => {
          setSpeakingPlayerId(null)
          setTypingPlayerId(null)
          gameApi.getGameState().then(setGameState).catch(() => {})
        },
        onError: (msg) => {
          message.error('描述生成错误: ' + msg)
        },
      })
    } catch (err) {
      message.error('描述生成失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
      gameApi.getGameState().then(setGameState).catch(() => {})
    }
  }, [gameState.round, gameState.state])

  /** 触发投票 */
  const handleVote = useCallback(async () => {
    setLoading(true)
    try {
      const result = await gameApi.vote()
      setVoteResult(result)
      if (result.state) {
        setGameState(result.state)
      }
      if (result.gameOver) {
        const winnerText = result.winner === 'civilian' ? '平民胜利！' : '卧底胜利！'
        message.success(winnerText)
      }
    } catch (err) {
      message.error('投票失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 重置游戏 */
  const handleReset = useCallback(async () => {
    setLoading(true)
    try {
      const state = await gameApi.resetGame()
      setGameState(state)
      setDescriptions({})
      setVoteResult(null)
      setSpeakingPlayerId(null)
      setTypingPlayerId(null)
      setHasStarted(false)
      message.success('游戏已重置')
    } catch (err) {
      message.error('重置失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const phaseText = (() => {
    switch (gameState.state) {
      case 'IDLE': return '等待开始'
      case 'DEALING': return '发牌中'
      case 'DESCRIBING': return '描述中'
      case 'VOTING': return '投票中'
      case 'RESULT': return '结果展示'
      case 'GAME_OVER': return '游戏结束'
      default: return ''
    }
  })()

  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>🎭 谁是卧底</span>
          {gameState.wordPair && (
            <span className={styles.wordPair}>
              <span className={styles.civilianWord}>平民词：{gameState.wordPair.civilian}</span>
              <span className={styles.undercoverWord}>卧底词：{gameState.wordPair.undercover}</span>
            </span>
          )}
        </div>
        <div className={styles.headerCenter}>
          {hasStarted && (
            <>
              <span>第 {gameState.round} 轮</span>
              <span className={styles.divider}>|</span>
              <span>剩余 {gameState.aliveCount} 人</span>
              <span className={styles.divider}>|</span>
              <span className={styles.phase}>{phaseText}</span>
            </>
          )}
        </div>
        <div className={styles.headerRight}>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => setHistoryOpen(true)}
            disabled={gameState.history.length === 0}
          >
            历史记录
          </Button>
        </div>
      </Header>

      <Content className={styles.content}>
        {loading && (
          <div className={styles.loadingOverlay}>
            <Spin size="large" tip="AI 思考中..." />
          </div>
        )}

        {gameState.state === 'GAME_OVER' && voteResult ? (
          <Result
            status={gameState.winner === 'civilian' ? 'success' : 'warning'}
            title={gameState.winner === 'civilian' ? '🎉 平民胜利！' : '🕵️ 卧底胜利！'}
            subTitle={
              gameState.wordPair
                ? `平民词：${gameState.wordPair.civilian} | 卧底词：${gameState.wordPair.undercover}`
                : ''
            }
            extra={[
              <Button key="reset" type="primary" onClick={handleStart} size="large">
                再来一局
              </Button>,
            ]}
          />
        ) : (
          <Row gutter={[20, 20]}>
            {/* 左侧：圆桌 + 控制 + 投票结果 */}
            <Col xs={24} lg={14}>
              <RoundTable
                players={gameState.players}
                speakingPlayerId={speakingPlayerId}
                typingPlayerId={typingPlayerId}
                votes={voteResult?.votes || null}
              />
              <GameControls
                gameState={gameState.state}
                loading={loading}
                canDescribe={canDescribe}
                hasDescriptions={hasDescriptions}
                onStart={handleStart}
                onNextRound={handleNextRound}
                onVote={handleVote}
                onReset={handleReset}
              />
              {voteResult && (
                <Card style={{ marginTop: 16 }}>
                  <VoteResult
                    votes={voteResult.votes}
                    voteCount={voteResult.voteCount}
                    eliminated={voteResult.eliminated}
                    isTie={voteResult.isTie}
                  />
                </Card>
              )}
            </Col>
            {/* 右侧：描述记录面板 */}
            <Col xs={24} lg={10}>
              <DescriptionPanel
                players={gameState.players}
                currentDescriptions={descriptions}
                typingPlayerId={typingPlayerId}
                history={gameState.history}
                round={gameState.round}
              />
            </Col>
          </Row>
        )}
      </Content>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={gameState.history}
      />
    </Layout>
  )
}

export default GamePage
