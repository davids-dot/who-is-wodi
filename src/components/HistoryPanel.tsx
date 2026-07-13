import React from 'react'
import { Drawer, Timeline, Tag, Empty } from 'antd'
import type { RoundHistory } from '../types/game'

interface HistoryPanelProps {
  open: boolean
  onClose: () => void
  history: RoundHistory[]
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ open, onClose, history }) => {
  return (
    <Drawer
      title="历史记录"
      placement="right"
      open={open}
      onClose={onClose}
      width={420}
    >
      {history.length === 0 ? (
        <Empty description="暂无历史记录" />
      ) : (
        <Timeline
          items={history.map((round) => ({
            color: round.eliminated ? 'red' : 'blue',
            children: (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  第 {round.round} 轮
                </div>
                <div style={{ marginBottom: 8 }}>
                  {round.descriptions.map((desc) => (
                    <div key={desc.playerId} style={{ fontSize: 13, marginBottom: 4 }}>
                      <strong>{desc.playerName}</strong>: {desc.text}
                    </div>
                  ))}
                </div>
                {round.votes.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>投票：</div>
                    {round.votes.map((vote) => (
                      <Tag key={vote.voterId} style={{ marginBottom: 4 }}>
                        {vote.voterName}→{vote.voteFor}
                      </Tag>
                    ))}
                  </div>
                )}
                {round.eliminated && (
                  <div style={{ fontSize: 13, color: '#cf1322' }}>
                    淘汰：{round.eliminated.name}
                    ({round.eliminated.isUndercover ? '卧底' : '平民'})
                  </div>
                )}
                {round.isTie && (
                  <div style={{ fontSize: 13, color: '#d48806' }}>平票，无人淘汰</div>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  )
}

export default HistoryPanel
