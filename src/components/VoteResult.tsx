import React from 'react'
import { Card, Tag, Empty } from 'antd'
import type { Vote, EliminatedPlayer } from '../types/game'
import styles from './VoteResult.module.less'

interface VoteResultProps {
  votes: Vote[]
  voteCount: Record<string, number>
  eliminated: EliminatedPlayer | null
  isTie: boolean
}

const VoteResult: React.FC<VoteResultProps> = ({
  votes,
  voteCount,
  eliminated,
  isTie,
}) => {
  if (votes.length === 0) {
    return <Empty description="暂无投票结果" />
  }

  return (
    <Card title="投票结果" size="small" className={styles.card}>
      <div className={styles.voteList}>
        {votes.map((vote) => (
          <div key={vote.voterId} className={styles.voteItem}>
            <span className={styles.voter}>{vote.voterName}</span>
            <span className={styles.arrow}>→</span>
            <Tag color="blue">{vote.voteFor}</Tag>
            <span className={styles.reason}>{vote.reason}</span>
            {vote.isFallback && <Tag color="orange">直觉</Tag>}
          </div>
        ))}
      </div>

      <div className={styles.tally}>
        <span className={styles.tallyTitle}>票数统计：</span>
        {Object.entries(voteCount).map(([name, count]) => (
          <Tag key={name} color={count === Math.max(...Object.values(voteCount)) ? 'red' : 'default'}>
            {name}: {count}票
          </Tag>
        ))}
      </div>

      {isTie && (
        <div className={styles.tieNotice}>平票！无人淘汰，继续下一轮</div>
      )}

      {eliminated && (
        <div className={styles.eliminatedNotice}>
          <span className={styles.eliminatedAvatar}>{eliminated.avatar}</span>
          <span className={styles.eliminatedName}>{eliminated.name}</span>
          被淘汰！身份：
          <Tag color={eliminated.isUndercover ? 'red' : 'green'}>
            {eliminated.isUndercover ? '卧底' : '平民'}
          </Tag>
          <span className={styles.eliminatedWord}>词语：{eliminated.word}</span>
        </div>
      )}
    </Card>
  )
}

export default VoteResult
