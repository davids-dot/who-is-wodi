import { useState, useCallback } from 'react';
import type { SSECallbacks } from '../services/gameApi';

export interface ActivePlayer {
  id: number;
  type: 'speaking' | 'thinking';
}

export function useStreamReceiver() {
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [activePlayer, setActivePlayer] = useState<ActivePlayer | null>(null);

  const reset = useCallback(() => {
    setDescriptions({});
    setActivePlayer(null);
  }, []);

  const callbacks: SSECallbacks = {
    onDescribeStart: (playerId) => {
      setActivePlayer({ id: playerId, type: 'speaking' });
      setDescriptions((prev) => ({ ...prev, [playerId]: '' }));
    },
    onDescribeChunk: (playerId, text) => {
      setDescriptions((prev) => ({
        ...prev,
        [playerId]: (prev[playerId] || '') + text,
      }));
    },
    onThinking: (playerId) => {
      setActivePlayer({ id: playerId, type: 'thinking' });
    },
    onDescribeEnd: () => {
      setActivePlayer(null);
    },
  };

  return {
    descriptions,
    activePlayer,
    callbacks,
    reset,
    setDescriptions, // Exposing this in case manual updates are needed (e.g., user describe)
  };
}
