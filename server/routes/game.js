/**
 * 谁是卧底 — 游戏 API 路由
 *
 * 路由前缀: /game (挂载在 /<appKey>/game)
 * 前端调用: /api/<appKey>/game/...
 *
 * API 列表:
 *   POST /start       — 开始新游戏
 *   POST /next-round  — 下一轮描述 (SSE 流式)
 *   POST /vote        — 触发投票
 *   GET  /state       — 获取游戏状态
 *   GET  /history     — 获取历史记录
 *   POST /reset       — 重置游戏
 */

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const engine = require('../game/engine');

/**
 * POST /start — 开始新游戏
 */
router.post('/start', (req, res) => {
  logger.info('[Route] POST /start — 收到开始游戏请求');
  const state = engine.startGame();
  logger.info({ state: state.state, round: state.round }, '[Route] POST /start — 游戏已启动');
  res.json({ data: state });
});

/**
 * POST /next-round — 下一轮描述 (SSE 流式)
 *
 * SSE 事件:
 *   describe_start  — { playerId, playerName, avatar }
 *   describe_chunk  — { playerId, text }
 *   describe_end    — { playerId, playerName, fullText }
 *   round_complete  — { round }
 *   error           — { message }
 */
router.post('/next-round', async (req, res) => {
  const isNewRound = req.body && req.body.isNewRound;
  logger.info({ isNewRound }, '[Route] POST /next-round — 收到描述请求');

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 如果是新一轮，调用 nextRound
  if (isNewRound) {
    engine.nextRound();
  }

  const alivePlayers = engine.getAlivePlayers();
  logger.info({ aliveCount: alivePlayers.length, players: alivePlayers.map(p => p.name) }, '[Route] 开始 SSE 流式描述');

  try {
    for (const player of alivePlayers) {
      logger.info({ playerId: player.id, playerName: player.name }, '[Route] SSE → describe_start');
      // 通知前端：开始描述
      res.write(`event: describe_start\ndata: ${JSON.stringify({
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
      })}\n\n`);

      // 流式接收 LLM 输出
      let fullText = '';
      const gen = engine.generateDescription(player);
      for await (const chunk of gen) {
        fullText += chunk;
        res.write(`event: describe_chunk\ndata: ${JSON.stringify({
          playerId: player.id,
          text: chunk,
        })}\n\n`);
      }

      logger.info({ playerId: player.id, fullText: fullText.trim() }, '[Route] SSE → describe_end');
      // 通知前端：描述结束
      res.write(`event: describe_end\ndata: ${JSON.stringify({
        playerId: player.id,
        playerName: player.name,
        fullText: fullText.trim(),
      })}\n\n`);
    }

    const round = engine.getPublicState().round;
    logger.info({ round }, '[Route] SSE → round_complete');
    // 轮次完成
    res.write(`event: round_complete\ndata: ${JSON.stringify({ round })}\n\n`);
  } catch (err) {
    logger.error({ err: err.message }, '[Route] SSE → error');
    res.write(`event: error\ndata: ${JSON.stringify({
      message: err.message,
    })}\n\n`);
  }

  res.end();
  logger.info('[Route] POST /next-round — SSE 流结束');
});

/**
 * POST /vote — 触发投票
 */
router.post('/vote', async (req, res) => {
  logger.info('[Route] POST /vote — 收到投票请求');
  try {
    const votes = await engine.executeVotes();
    logger.info({ voteCount: votes.length }, '[Route] 投票生成完成');

    const { eliminated, isTie, voteCount } = engine.eliminatePlayer();
    logger.info({ eliminated: eliminated ? eliminated.name : null, isTie }, '[Route] 淘汰处理完成');

    const gameOverInfo = engine.checkGameOver();
    if (gameOverInfo.gameOver) {
      logger.info({ winner: gameOverInfo.winner }, '[Route] 游戏结束');
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
        state: engine.getPublicState(),
      },
    });
  } catch (err) {
    logger.error({ err: err.message }, '[Route] POST /vote — 投票失败');
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /state — 获取游戏状态
 */
router.get('/state', (req, res) => {
  res.json({ data: engine.getPublicState() });
});

/**
 * GET /history — 获取历史记录
 */
router.get('/history', (req, res) => {
  res.json({ data: engine.getHistory() });
});

/**
 * POST /reset — 重置游戏
 */
router.post('/reset', (req, res) => {
  logger.info('[Route] POST /reset — 重置游戏');
  const state = engine.resetGame();
  res.json({ data: state });
});

module.exports = router;
