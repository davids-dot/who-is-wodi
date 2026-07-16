import React, { useState } from 'react'
import { Layout, Row, Col, Card, Result, Button, Spin } from 'antd'
import RoundTable from '../components/RoundTable'
import DescriptionPanel from '../components/DescriptionPanel'
import VoteResult from '../components/VoteResult'
import GameControls from '../components/GameControls'
import HistoryPanel from '../components/HistoryPanel'
import HeaderBar from '../components/HeaderBar'
import UserActionCard from '../components/UserActionCard'
import { useGameEngine } from '../hooks/useGameEngine'
import { useStreamReceiver } from '../hooks/useStreamReceiver'
import styles from './GamePage.module.less'

const { Content } = Layout

const GamePage: React.FC = () => {
  const [historyOpen, setHistoryOpen] = useState(false)
  
  // 1. 微观流式接收器
  const stream = useStreamReceiver()
  
  // 2. 宏观引擎
  const engine = useGameEngine(stream.callbacks)
  const { state, hasStarted, humanAlive, actions } = engine

  // 可投票的候选玩家（除自己外存活玩家）
  const voteCandidates = state.gameInfo.players.filter(
    (p) => p.isAlive && !p.isHuman
  )

  return (
    <Layout className={styles.layout}>
      <HeaderBar 
        gameInfo={state.gameInfo} 
        phase={state.phase} 
        hasStarted={hasStarted}
        humanAlive={humanAlive}
        onHistoryOpen={() => setHistoryOpen(true)}
      />

      <Content className={styles.content}>
        {state.loading && (
          <div className={styles.loadingOverlay}>
            <Spin size="large" tip="AI 思考中..." />
          </div>
        )}

        <Row gutter={[20, 20]}>
          <Col xs={24} lg={14}>
            <RoundTable
              players={state.gameInfo.players}
              speakingPlayerId={stream.activePlayer?.type === 'speaking' ? stream.activePlayer.id : null}
              typingPlayerId={stream.activePlayer?.type === 'speaking' ? stream.activePlayer.id : null}
              thinkingPlayerId={stream.activePlayer?.type === 'thinking' ? stream.activePlayer.id : null}
              votes={state.voteResult?.votes || null}
            />

            {state.phase === 'WAITING_USER_DESC' && (
              <UserActionCard 
                type="describe" 
                myWord={state.gameInfo.myWord}
                onSubmitDescribe={actions.handleUserDescribe}
              />
            )}

            {state.phase === 'WAITING_USER_VOTE' && (
              <UserActionCard 
                type="vote"
                voteCandidates={voteCandidates}
                onSubmitVote={actions.handleUserVote}
              />
            )}

            {state.phase === 'GAME_OVER' && state.voteResult && (
              <Card 
                style={{ marginTop: 16 }}
                className={styles.gameOverCard}
              >
                <Result
                  status={state.gameInfo.winner === 'civilian' ? 'success' : 'warning'}
                  title={state.gameInfo.winner === 'civilian' ? '🎉 平民胜利！' : '🕵️ 卧底胜利！'}
                  subTitle={
                    state.gameInfo.wordPair
                      ? `平民词：${state.gameInfo.wordPair.civilian} | 卧底词：${state.gameInfo.wordPair.undercover}`
                      : ''
                  }
                  extra={[
                    <Button key="reset" type="primary" onClick={actions.handleStart} size="large">
                      再来一局
                    </Button>,
                  ]}
                />
              </Card>
            )}

            {state.phase !== 'GAME_OVER' && (
              <GameControls
                phase={state.phase}
                loading={state.loading}
                hasStarted={hasStarted}
                gameMode={state.gameMode}
                onModeChange={actions.setGameMode}
                onStart={actions.handleStart}
                onNextRound={actions.handleDescribe}
                onVote={actions.handleVote}
                onReset={actions.handleReset}
              />
            )}

            {state.voteResult && (
              <Card style={{ marginTop: 16 }}>
                <VoteResult
                  votes={state.voteResult.votes}
                  voteCount={state.voteResult.voteCount}
                  eliminated={state.voteResult.eliminated}
                  isTie={state.voteResult.isTie}
                />
              </Card>
            )}
          </Col>

          <Col xs={24} lg={10}>
            <DescriptionPanel
              players={state.gameInfo.players}
              currentDescriptions={stream.descriptions}
              currentRoundDescriptions={state.gameInfo.currentRoundDescriptions}
              activePlayer={stream.activePlayer}
              history={state.gameInfo.history}
              round={state.gameInfo.round}
              skippedPlayers={state.skippedPlayers}
            />
          </Col>
        </Row>
      </Content>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={state.gameInfo.history}
      />
    </Layout>
  )
}

export default GamePage
