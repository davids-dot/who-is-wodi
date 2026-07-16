/**
 * 谁是卧底 — 游戏 API 路由（多实例版 + 用户参与模式）
 *
 * 路由前缀: /game (挂载在 /<appKey>/game 或根路径 /game)
 * 前端调用: /game/<gameId>/<action>
 *
 * API 列表:
 *   POST /:gameId/start           — 开始新游戏
 *   POST /:gameId/describe-batch   — SSE: AI 玩家分批描述
 *   POST /:gameId/user-describe    — 用户提交描述文本
 *   POST /:gameId/ai-vote          — AI 投票
 *   POST /:gameId/user-vote        — 用户提交投票
 *   POST /:gameId/vote-result      — 统计淘汰 + 检查游戏结束
 *   POST /:gameId/abandon          — 用户离开，游戏结束
 *   GET  /:gameId/state            — 获取游戏状态
 *   GET  /:gameId/history          — 获取历史记录
 *   POST /:gameId/reset            — 重置游戏
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
  const mode = (req.body && req.body.mode) || 'participate';
  logger.info({ gameId, mode }, '[Route] POST /start — 收到开始游戏请求');
  const state = engine.startGame(gameId, mode);
  logger.info({ gameId, state: state.state, round: state.round, mode }, '[Route] POST /start — 游戏已启动');
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
      // 单玩家容错：描述生成失败时发 player_error 事件，跳过该玩家继续下一个
      try {
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
      } catch (playerErr) {
        logger.error({ gameId, playerId: player.id, playerName: player.name, err: playerErr.message }, '[Route] SSE → player_error');
        res.write(`event: player_error\ndata: ${JSON.stringify({
          playerId: player.id,
          playerName: player.name,
          message: `${player.name}描述超时，已跳过`,
        })}\n\n`);
        // 继续下一个玩家，不中断 SSE 流
      }
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
 * POST /:gameId/describe-batch — SSE: AI 玩家分批描述
 *
 * SSE 事件:
 *   describe_start  — { playerId, playerName, avatar }
 *   describe_chunk  — { playerId, text }
 *   describe_end    — { playerId, playerName, fullText }
 *   thinking        — { playerId, playerName } (下一个玩家思考中)
 *   user_turn      — {} (轮到用户输入，SSE结束)
 *   round_complete  — { round }
 *   error           — { message }
 */
router.post('/:gameId/describe-batch', async (req, res) => {
  const { gameId } = req.params;
  const isFirstBatch = !(req.body && req.body.isSecondBatch);
  const isNewRound = req.body && req.body.isNewRound;
  logger.info({ gameId, isFirstBatch, isNewRound }, '[Route] POST /describe-batch');

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 如果是新一轮，调用 nextRound
  if (isNewRound && isFirstBatch) {
    engine.nextRound(gameId);
  }

  const aiPlayers = engine.describeBatch(gameId, isFirstBatch);
  logger.info({ gameId, isFirstBatch, aiCount: aiPlayers.length, players: aiPlayers.map(p => p.name) }, '[Route] describe-batch AI 列表');

  try {
    for (let i = 0; i < aiPlayers.length; i++) {
      const player = aiPlayers[i];

      // 发送 thinking 事件（第一个玩家前不发，后续玩家前发）
      if (i > 0) {
        logger.info({ gameId, playerId: player.id, playerName: player.name }, '[Route] SSE → thinking');
        res.write(`event: thinking\ndata: ${JSON.stringify({
          playerId: player.id,
          playerName: player.name,
        })}\n\n`);
        // 等待 2 秒
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 单玩家容错：描述生成失败时发 player_error 事件，跳过该玩家继续下一个
      try {
        logger.info({ gameId, playerId: player.id, playerName: player.name }, '[Route] SSE → describe_start');
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
        res.write(`event: describe_end\ndata: ${JSON.stringify({
          playerId: player.id,
          playerName: player.name,
          fullText: fullText.trim(),
        })}\n\n`);
      } catch (playerErr) {
        logger.error({ gameId, playerId: player.id, playerName: player.name, err: playerErr.message }, '[Route] SSE → player_error');
        res.write(`event: player_error\ndata: ${JSON.stringify({
          playerId: player.id,
          playerName: player.name,
          message: `${player.name}描述超时，已跳过`,
        })}\n\n`);
        // 继续下一个玩家，不中断 SSE 流
      }
    }

    // 判断是否需要 user_turn
    const publicState = engine.getPublicState(gameId);
    const humanAlive = publicState.myWord !== null;

    if (isFirstBatch && humanAlive) {
      // 用户存活且是第一批，发 user_turn
      logger.info({ gameId }, '[Route] SSE → user_turn');
      res.write(`event: user_turn\ndata: ${JSON.stringify({ isMyTurn: true })}\n\n`);
    } else {
      // 第二批或用户被淘汰/AI模式 — 本轮描述全部完成
      engine.setDescriptionComplete(gameId);
      const round = engine.getPublicState(gameId).round;
      logger.info({ gameId, round }, '[Route] SSE → round_complete');
      res.write(`event: round_complete\ndata: ${JSON.stringify({ round })}\n\n`);
    }
  } catch (err) {
    logger.error({ gameId, err: err.message }, '[Route] SSE → error');
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
  }

  res.end();
  logger.info({ gameId }, '[Route] POST /describe-batch — SSE 流结束');
});

/**
 * POST /:gameId/user-describe — 用户提交描述文本
 */
router.post('/:gameId/user-describe', (req, res) => {
  const { gameId } = req.params;
  const { text } = req.body || {};
  logger.info({ gameId, text: (text || '').slice(0, 50) }, '[Route] POST /user-describe');
  try {
    const desc = engine.userDescribe(gameId, text);
    res.json({ data: desc });
  } catch (err) {
    logger.error({ gameId, err: err.message }, '[Route] POST /user-describe — 失败');
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:gameId/ai-vote — AI 投票
 */
router.post('/:gameId/ai-vote', async (req, res) => {
  const { gameId } = req.params;
  logger.info({ gameId }, '[Route] POST /ai-vote');
  try {
    const aiVotes = await engine.aiVote(gameId);
    logger.info({ gameId, voteCount: aiVotes.length }, '[Route] AI 投票完成');
    res.json({ data: { aiVotes } });
  } catch (err) {
    logger.error({ gameId, err: err.message }, '[Route] POST /ai-vote — 失败');
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:gameId/user-vote — 用户提交投票
 */
router.post('/:gameId/user-vote', (req, res) => {
  const { gameId } = req.params;
  const { voteFor, reason } = req.body || {};
  logger.info({ gameId, voteFor, reason }, '[Route] POST /user-vote');
  try {
    const vote = engine.userVote(gameId, voteFor, reason);
    res.json({ data: vote });
  } catch (err) {
    logger.error({ gameId, err: err.message }, '[Route] POST /user-vote — 失败');
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:gameId/vote-result — 统计淘汰 + 检查游戏结束
 */
router.post('/:gameId/vote-result', async (req, res) => {
  const { gameId } = req.params;
  const { aiVotes, userVote: userVoteResult } = req.body || {};
  logger.info({ gameId }, '[Route] POST /vote-result');
  try {
    const result = await engine.voteResult(gameId, aiVotes || [], userVoteResult || null);
    logger.info({ gameId, eliminated: result.eliminated ? result.eliminated.name : null, isTie: result.isTie }, '[Route] 投票结果');
    res.json({ data: result });
  } catch (err) {
    logger.error({ gameId, err: err.message }, '[Route] POST /vote-result — 失败');
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:gameId/abandon — 用户离开，游戏结束
 */
router.post('/:gameId/abandon', (req, res) => {
  const { gameId } = req.params;
  logger.info({ gameId }, '[Route] POST /abandon — 用户离开');
  engine.abandonGame(gameId);
  res.json({ ok: true });
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
  const mode = (req.body && req.body.mode) || 'participate';
  logger.info({ gameId, mode }, '[Route] POST /reset — 重置游戏');
  const state = engine.resetGame(gameId, mode);
  res.json({ data: state });
});

module.exports = router;
