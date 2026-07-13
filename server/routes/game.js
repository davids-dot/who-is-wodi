/**
 * 谁是卧底 — 游戏 API 路由（多实例版）
 *
 * 路由前缀: /game (挂载在 /<appKey>/game 或根路径 /game)
 * 前端调用: /game/<gameId>/<action>
 *
 * API 列表:
 *   POST /:gameId/start       — 开始新游戏
 *   POST /:gameId/next-round  — 下一轮描述 (SSE 流式)
 *   POST /:gameId/vote        — 触发投票
 *   GET  /:gameId/state       — 获取游戏状态
 *   GET  /:gameId/history     — 获取历史记录
 *   POST /:gameId/reset       — 重置游戏
 */

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const engine = require('../game/engine');

/**
 * POST /:gameId/start — 开始新游戏
 */
router.post('/:gameId/start', (req, res) => {
  const { gameId } = req.params;
  logger.info({ gameId }, '[Route] POST /start — 收到开始游戏请求');
  const state = engine.startGame(gameId);
  logger.info({ gameId, state: state.state, round: state.round }, '[Route] POST /start — 游戏已启动');
  res.json({ data: state });
});

/**
 * POST /:gameId/next-round — 下一轮描述 (SSE 流式)
 *
 * SSE 事件:
 *   describe_start  — { playerId, playerName, avatar }
 *   describe_chunk  — { playerId, text }
 *   describe_end    — { playerId, playerName, fullText }
 *   round_complete  — { round }
 *   error           — { message }
 */
router.post('/:gameId/next-round', async (req, res) => {
  const { gameId } = req.params;
  const isNewRound = req.body && req.body.isNewRound;
  logger.info({ gameId, isNewRound }, '[Route] POST /next-round — 收到描述请求');

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 如果是新一轮，调用 nextRound
  if (isNewRound) {
    engine.nextRound(gameId);
  }

  const alivePlayers = engine.getAlivePlayers(gameId);
  logger.info({ gameId, aliveCount: alivePlayers.length, players: alivePlayers.map(p => p.name) }, '[Route] 开始 SSE 流式描述');

  try {
    for (const player of alivePlayers) {
      logger.info({ gameId, playerId: player.id, playerName: player.name }, '[Route] SSE → describe_start');
      // 通知前端：开始描述
      res.write(`event: describe_start\ndata: ${JSON.stringify({
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
      })}\n\n`);

      // 流式接收 LLM 输出
      let fullText = '';
      const gen = engine.generateDescription(gameId, player);
      for await (const chunk of gen) {
        fullText += chunk;
        res.write(`event: describe_chunk\ndata: ${JSON.stringify({
          playerId: player.id,
          text: chunk,
        })}\n\n`);
      }

      logger.info({ gameId, playerId: player.id, fullText: fullText.trim() }, '[Route] SSE → describe_end');
      // 通知前端：描述结束
      res.write(`event: describe_end\ndata: ${JSON.stringify({
        playerId: player.id,
        playerName: player.name,
        fullText: fullText.trim(),
      })}\n\n`);
    }

    const round = engine.getPublicState(gameId).round;
    logger.info({ gameId, round }, '[Route] SSE → round_complete');
    // 轮次完成
    res.write(`event: round_complete\ndata: ${JSON.stringify({ round })}\n\n`);
  } catch (err) {
    logger.error({ gameId, err: err.message }, '[Route] SSE → error');
    res.write(`event: error\ndata: ${JSON.stringify({
      message: err.message,
    })}\n\n`);
  }

  res.end();
  logger.info({ gameId }, '[Route] POST /next-round — SSE 流结束');
});

/**
 * POST /:gameId/vote — 触发投票
 */
router.post('/:gameId/vote', async (req, res) => {
  const { gameId } = req.params;
  logger.info({ gameId }, '[Route] POST /vote — 收到投票请求');
  try {
    const votes = await engine.executeVotes(gameId);
    logger.info({ gameId, voteCount: votes.length }, '[Route] 投票生成完成');

    const { eliminated, isTie, voteCount } = engine.eliminatePlayer(gameId);
    logger.info({ gameId, eliminated: eliminated ? eliminated.name : null, isTie }, '[Route] 淘汰处理完成');

    const gameOverInfo = engine.checkGameOver(gameId);
    if (gameOverInfo.gameOver) {
      logger.info({ gameId, winner: gameOverInfo.winner }, '[Route] 游戏结束');
    }

    res.json({
      data: {
        votes,
        eliminated,
        isTie,
        voteCount,
        gameOver: gameOverInfo.gameOver,
        winner: gameOverInfo.winner || null,
        undercover: gameOverInfo.undercover || null,
        state: engine.getPublicState(gameId),
      },
    });
  } catch (err) {
    logger.error({ gameId, err: err.message }, '[Route] POST /vote — 投票失败');
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:gameId/state — 获取游戏状态
 */
router.get('/:gameId/state', (req, res) => {
  const { gameId } = req.params;
  res.json({ data: engine.getPublicState(gameId) });
});

/**
 * GET /:gameId/history — 获取历史记录
 */
router.get('/:gameId/history', (req, res) => {
  const { gameId } = req.params;
  res.json({ data: engine.getHistory(gameId) });
});

/**
 * POST /:gameId/reset — 重置游戏
 */
router.post('/:gameId/reset', (req, res) => {
  const { gameId } = req.params;
  logger.info({ gameId }, '[Route] POST /reset — 重置游戏');
  const state = engine.resetGame(gameId);
  res.json({ data: state });
});

module.exports = router;
