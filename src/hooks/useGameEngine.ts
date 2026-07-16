import { useReducer, useCallback, useEffect } from 'react';
import { message } from 'antd';
import * as gameApi from '../services/gameApi';
import type { GamePublicState, VoteResult, Vote, GameMode } from '../types/game';
import type { SSECallbacks } from '../services/gameApi';

export type EnginePhase =
  | 'IDLE'
  | 'DEALING'
  | 'DESCRIBING_AI_1'
  | 'WAITING_USER_DESC'
  | 'DESCRIBING_AI_2'
  | 'DESCRIBE_DONE'
  | 'VOTING_AI'
  | 'WAITING_USER_VOTE'
  | 'SHOW_RESULT'
  | 'GAME_OVER';

export interface EngineState {
  phase: EnginePhase;
  loading: boolean;
  gameInfo: GamePublicState;
  aiVotes: Vote[];
  voteResult: VoteResult | null;
  skippedPlayers: Record<number, string>;
  gameMode: GameMode;
}

export type EngineAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PHASE'; payload: EnginePhase }
  | { type: 'SYNC_BACKEND_STATE'; payload: { state: GamePublicState; phase: EnginePhase } }
  | { type: 'START_GAME'; payload: GamePublicState }
  | { type: 'START_AI_DESCRIBE_1' }
  | { type: 'WAIT_USER_DESCRIBE' }
  | { type: 'START_AI_DESCRIBE_2' }
  | { type: 'START_AI_VOTE' }
  | { type: 'SET_AI_VOTES'; payload: Vote[] }
  | { type: 'WAIT_USER_VOTE' }
  | { type: 'SHOW_VOTE_RESULT'; payload: VoteResult }
  | { type: 'SET_SKIPPED_PLAYER'; payload: { playerId: number; msg: string } }
  | { type: 'RESET'; payload: GamePublicState }
  | { type: 'SET_MODE'; payload: GameMode };

const initialGameInfo: GamePublicState = {
  state: 'IDLE',
  round: 0,
  players: [],
  aliveCount: 0,
  currentRoundDescriptions: [],
  history: [],
  winner: null,
  wordPair: null,
};

const initialState: EngineState = {
  phase: 'IDLE',
  loading: false,
  gameInfo: initialGameInfo,
  aiVotes: [],
  voteResult: null,
  skippedPlayers: {},
  gameMode: 'participate',
};

function gameReducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_PHASE':
      return { ...state, phase: action.payload };
    case 'SYNC_BACKEND_STATE':
      return {
        ...state,
        gameInfo: action.payload.state,
        phase: action.payload.phase,
      };
    case 'START_GAME':
      return {
        ...state,
        gameInfo: action.payload,
        phase: 'IDLE',
        voteResult: null,
        skippedPlayers: {},
        aiVotes: [],
        gameMode: action.payload.mode || state.gameMode,
      };
    case 'START_AI_DESCRIBE_1':
      return { ...state, phase: 'DESCRIBING_AI_1', voteResult: null, aiVotes: [] };
    case 'WAIT_USER_DESCRIBE':
      return { ...state, phase: 'WAITING_USER_DESC' };
    case 'START_AI_DESCRIBE_2':
      return { ...state, phase: 'DESCRIBING_AI_2' };
    case 'START_AI_VOTE':
      return { ...state, phase: 'VOTING_AI', voteResult: null };
    case 'SET_AI_VOTES':
      return { ...state, aiVotes: action.payload };
    case 'WAIT_USER_VOTE':
      return { ...state, phase: 'WAITING_USER_VOTE' };
    case 'SHOW_VOTE_RESULT':
      return {
        ...state,
        voteResult: action.payload,
        gameInfo: action.payload.state,
        phase: action.payload.gameOver ? 'GAME_OVER' : 'IDLE',
      };
    case 'SET_SKIPPED_PLAYER':
      return {
        ...state,
        skippedPlayers: { ...state.skippedPlayers, [action.payload.playerId]: action.payload.msg },
      };
    case 'RESET':
      return {
        ...initialState,
        gameInfo: action.payload,
        gameMode: state.gameMode,
      };
    case 'SET_MODE':
      return { ...state, gameMode: action.payload };
    default:
      return state;
  }
}

/** 后端 GameState → 前端 EnginePhase 映射 */
function backendStateToPhase(backendState: string): EnginePhase {
  switch (backendState) {
    case 'VOTING_PENDING': return 'DESCRIBE_DONE';
    case 'GAME_OVER':      return 'GAME_OVER';
    default:               return 'IDLE';
  }
}

export function useGameEngine(streamCallbacks: SSECallbacks) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const hasStarted = state.gameInfo.state !== 'IDLE' && state.gameInfo.players.length > 0;

  const humanPlayer = state.gameInfo.players.find((p) => p.isHuman);
  const humanAlive = humanPlayer ? humanPlayer.isAlive : false;

  // Cleanup on unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.gameMode === 'participate' && hasStarted && state.gameInfo.state !== 'GAME_OVER') {
        gameApi.abandon();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasStarted, state.gameInfo.state, state.gameMode]);

  const setGameMode = useCallback((mode: GameMode) => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, []);

  const handleStart = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const newState = await gameApi.startGame(state.gameMode);
      dispatch({ type: 'START_GAME', payload: newState });
      const msg = state.gameMode === 'ai'
        ? '游戏开始！6位AI玩家已就座'
        : '游戏开始！7位玩家已就座，你是4号位';
      message.success(msg);
    } catch (err) {
      message.error('游戏启动失败: ' + (err as Error).message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.gameMode]);

  const handleDescribe = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'START_AI_DESCRIBE_1' });

    const isNewRound = state.gameInfo.round > 0 && state.gameInfo.state !== 'DESCRIBING';

    try {
      await gameApi.describeBatch(true, isNewRound, {
        ...streamCallbacks,
        onUserTurn: () => {
          streamCallbacks.onUserTurn?.();
          dispatch({ type: 'WAIT_USER_DESCRIBE' });
          dispatch({ type: 'SET_LOADING', payload: false });
        },
        onRoundComplete: (round) => {
          streamCallbacks.onRoundComplete?.(round);
          // round_complete = 本轮描述全部完成，直接进入待投票（不等 fetch）
          dispatch({ type: 'SET_PHASE', payload: 'DESCRIBE_DONE' });
          // 异步获取最新 gameInfo（描述列表等）
          gameApi.getGameState().then(s => dispatch({ type: 'SYNC_BACKEND_STATE', payload: { state: s, phase: backendStateToPhase(s.state) } })).catch(() => {});
        },
        onPlayerError: (playerId, playerName, msg) => {
          streamCallbacks.onPlayerError?.(playerId, playerName, msg);
          dispatch({ type: 'SET_SKIPPED_PLAYER', payload: { playerId, msg } });
        },
      });
    } catch (err) {
      message.error('描述生成失败: ' + (err as Error).message);
    } finally {
      // 确保所有分支都清除 loading：
      // - AI 模式 / 人类被淘汰时走 onRoundComplete，不会触发 onUserTurn
      // - 参与模式 onUserTurn 已提前清除，finally 再设一次 false 无副作用
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.gameInfo.round, state.gameInfo.state, streamCallbacks]);

  const handleUserDescribe = useCallback(async (text: string) => {
    if (!text.trim()) {
      message.warning('请输入描述内容');
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'START_AI_DESCRIBE_2' });

    try {
      await gameApi.userDescribe(text.trim());

      await gameApi.describeBatch(false, false, {
        ...streamCallbacks,
        onRoundComplete: (round) => {
          streamCallbacks.onRoundComplete?.(round);
          // round_complete = 本轮描述全部完成，直接进入待投票（不等 fetch）
          dispatch({ type: 'SET_PHASE', payload: 'DESCRIBE_DONE' });
          // 异步获取最新 gameInfo（描述列表等）
          gameApi.getGameState().then(s => dispatch({ type: 'SYNC_BACKEND_STATE', payload: { state: s, phase: backendStateToPhase(s.state) } })).catch(() => {});
        },
        onPlayerError: (playerId, playerName, msg) => {
          streamCallbacks.onPlayerError?.(playerId, playerName, msg);
          dispatch({ type: 'SET_SKIPPED_PLAYER', payload: { playerId, msg } });
        },
      });
    } catch (err) {
      message.error('描述生成失败: ' + (err as Error).message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [streamCallbacks]);

  const handleVote = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'START_AI_VOTE' });

    try {
      const { aiVotes: votes } = await gameApi.aiVote();
      dispatch({ type: 'SET_AI_VOTES', payload: votes });

      if (humanAlive) {
        dispatch({ type: 'WAIT_USER_VOTE' });
      } else {
        const result = await gameApi.voteResult(votes, null);
        dispatch({ type: 'SHOW_VOTE_RESULT', payload: result });
        if (result.gameOver) {
          const winnerText = result.winner === 'civilian' ? '平民胜利！' : '卧底胜利！';
          message.success(winnerText);
        }
      }
    } catch (err) {
      message.error('投票失败: ' + (err as Error).message);
    } finally {
      // 确保所有分支都清除 loading，避免游戏结束后仍显示"AI 思考中..."
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [humanAlive]);

  const handleUserVote = useCallback(async (target: string, reason: string) => {
    if (!target) {
      message.warning('请选择投票对象');
      return;
    }
    if (!reason) {
      message.warning('请填写投票理由');
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const userVoteResult = await gameApi.userVote(target, reason);
      const result = await gameApi.voteResult(state.aiVotes, userVoteResult);
      dispatch({ type: 'SHOW_VOTE_RESULT', payload: result });
      if (result.gameOver) {
        const winnerText = result.winner === 'civilian' ? '平民胜利！' : '卧底胜利！';
        message.success(winnerText);
      }
    } catch (err) {
      message.error('投票失败: ' + (err as Error).message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.aiVotes]);

  const handleReset = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const newState = await gameApi.resetGame(state.gameMode);
      dispatch({ type: 'RESET', payload: newState });
      message.success('游戏已重置');
    } catch (err) {
      message.error('重置失败: ' + (err as Error).message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.gameMode]);

  return {
    state,
    hasStarted,
    humanAlive,
    actions: {
      setGameMode,
      handleStart,
      handleDescribe,
      handleUserDescribe,
      handleVote,
      handleUserVote,
      handleReset,
    },
  };
}
