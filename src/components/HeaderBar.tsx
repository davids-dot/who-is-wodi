import React from 'react';
import { Layout } from 'antd';
import type { GamePublicState } from '../types/game';
import type { EnginePhase } from '../hooks/useGameEngine';
import styles from '../pages/GamePage.module.less';

const { Header } = Layout;

interface HeaderBarProps {
  gameInfo: GamePublicState;
  phase: EnginePhase;
  hasStarted: boolean;
  humanAlive: boolean;
  onHistoryOpen: () => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({ gameInfo, phase, hasStarted, humanAlive, onHistoryOpen }) => {
  const myWord = gameInfo.myWord || null;
  const humanPlayer = gameInfo.players.find((p) => p.isHuman);

  const phaseText = (() => {
    switch (phase) {
      case 'IDLE': return '等待开始';
      case 'DEALING': return '发牌中';
      case 'DESCRIBING_AI_1':
      case 'DESCRIBING_AI_2':
      case 'WAITING_USER_DESC': return '描述中';
      case 'VOTING_AI':
      case 'WAITING_USER_VOTE': return '投票中';
      case 'SHOW_RESULT': return '结果展示';
      case 'GAME_OVER': return '游戏结束';
      default: return '';
    }
  })();

  return (
    <Header className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.title}>🎭 谁是卧底</span>
        {myWord && (
          <span className={styles.wordPair}>
            <span className={styles.civilianWord}>你的词语：{myWord}</span>
          </span>
        )}
        {!myWord && gameInfo.wordPair && (
          <span className={styles.wordPair}>
            <span className={styles.civilianWord}>平民词：{gameInfo.wordPair.civilian}</span>
            <span className={styles.undercoverWord}>卧底词：{gameInfo.wordPair.undercover}</span>
          </span>
        )}
      </div>
      <div className={styles.headerCenter}>
        {hasStarted && (
          <>
            <span>第 {gameInfo.round} 轮</span>
            <span className={styles.divider}>|</span>
            <span>剩余 {gameInfo.aliveCount} 人</span>
            <span className={styles.divider}>|</span>
            <span className={styles.phase}>{phaseText}</span>
            {humanPlayer && !humanAlive && gameInfo.state !== 'GAME_OVER' && (
              <>
                <span className={styles.divider}>|</span>
                <span className={styles.phase}>观战中</span>
              </>
            )}
          </>
        )}
      </div>
      <div className={styles.headerRight}>
        <button
          className="ant-btn"
          onClick={onHistoryOpen}
          disabled={gameInfo.history.length === 0}
        >
          历史记录
        </button>
      </div>
    </Header>
  );
};

export default HeaderBar;
