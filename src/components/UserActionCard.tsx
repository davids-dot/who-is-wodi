import React, { useState } from 'react';
import { Card, Button, Input, Radio, Space } from 'antd';
import type { Player } from '../types/game';

const { TextArea } = Input;

interface UserActionCardProps {
  type: 'describe' | 'vote';
  myWord?: string;
  voteCandidates?: Player[];
  onSubmitDescribe?: (text: string) => void;
  onSubmitVote?: (target: string, reason: string) => void;
}

const UserActionCard: React.FC<UserActionCardProps> = ({
  type,
  myWord,
  voteCandidates = [],
  onSubmitDescribe,
  onSubmitVote,
}) => {
  const [userTextInput, setUserTextInput] = useState('');
  const [userVoteTarget, setUserVoteTarget] = useState<string>('');
  const [userVoteReason, setUserVoteReason] = useState<string>('');

  if (type === 'describe') {
    return (
      <Card title="轮到你了！请描述你的词语" style={{ marginTop: 16 }}>
        {myWord && (
          <p style={{ marginBottom: 8, color: '#1890ff' }}>你的词语：{myWord}</p>
        )}
        <TextArea
          value={userTextInput}
          onChange={(e) => setUserTextInput(e.target.value)}
          placeholder="用一句话描述你的词语（20-50字）"
          autoSize={{ minRows: 2, maxRows: 4 }}
          maxLength={100}
          onPressEnter={() => {
            if (userTextInput.trim() && onSubmitDescribe) {
              onSubmitDescribe(userTextInput);
              setUserTextInput('');
            }
          }}
        />
        <Button
          type="primary"
          onClick={() => {
            if (userTextInput.trim() && onSubmitDescribe) {
              onSubmitDescribe(userTextInput);
              setUserTextInput('');
            }
          }}
          style={{ marginTop: 8 }}
          disabled={!userTextInput.trim()}
        >
          提交描述
        </Button>
      </Card>
    );
  }

  if (type === 'vote') {
    return (
      <Card title="投票淘汰谁？" style={{ marginTop: 16 }}>
        <p style={{ marginBottom: 8, color: '#666' }}>
          AI 投票已生成，请选择你认为是卧底的玩家：
        </p>
        <Radio.Group
          value={userVoteTarget}
          onChange={(e) => setUserVoteTarget(e.target.value)}
        >
          <Space direction="vertical">
            {voteCandidates.map((p) => (
              <Radio key={p.name} value={p.name}>{p.name}</Radio>
            ))}
          </Space>
        </Radio.Group>
        <div style={{ marginTop: 16 }}>
          <p style={{ marginBottom: 8, color: '#666' }}>投票理由（必填）：</p>
          <TextArea
            value={userVoteReason}
            onChange={(e) => setUserVoteReason(e.target.value)}
            placeholder="说说你为什么投TA..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={200}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Button
            type="primary"
            onClick={() => {
              if (userVoteTarget && userVoteReason.trim() && onSubmitVote) {
                onSubmitVote(userVoteTarget, userVoteReason.trim());
                setUserVoteTarget('');
                setUserVoteReason('');
              }
            }}
            disabled={!userVoteTarget || !userVoteReason.trim()}
          >
            确认投票
          </Button>
        </div>
      </Card>
    );
  }

  return null;
};

export default UserActionCard;
