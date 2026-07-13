/**
 * 谁是卧底 — 游戏引擎（多实例版）
 *
 * 状态机: IDLE → DEALING → DESCRIBING → VOTING → RESULT → (GAME_OVER | DESCRIBING)
 *
 * 核心机制：
 *   - 卧底和平民的 prompt 结构完全相同，仅词语不同
 *   - 禁字规则作为"软规则"告知模型，不做硬性过滤
 *   - 描述依次进行（后者能看到前者），投票分批并行执行（concurrency=2）
 *
 * 多实例支持：
 *   - games = Map<gameId, gameInstance>
 *   - getGame(gameId) 延迟创建
 *   - 游戏结束后 5min 自动删除，30min 无活动自动清理
 */

const llm = require('../llm-client');
const logger = require('../logger');
const { getRandomWordPair } = require('./wordPairs');
const { PLAYERS } = require('./players');

// 游戏状态枚举
const GameState = {
  IDLE: 'IDLE',
  DEALING: 'DEALING',
  DESCRIBING: 'DESCRIBING',
  VOTING: 'VOTING',
  RESULT: 'RESULT',
  GAME_OVER: 'GAME_OVER',
};

// 多实例游戏存储
const games = new Map();

// LLM 并发控制（DashScope 免费档约 2 并发，避免 429）
const LLM_CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY || '2', 10);

// 清理配置
const STALE_THRESHOLD = 30 * 60 * 1000;  // 30 分钟无活动
const CLEANUP_INTERVAL = 10 * 60 * 1000;  // 每 10 分钟扫描一次
const GAME_OVER_CLEANUP_DELAY = 5 * 60 * 1000;  // 游戏结束后 5 分钟清理

// 清理定时器引用
const cleanupTimers = new Map();

function createInitialGame() {
  return {
    state: GameState.IDLE,
    round: 0,
    wordPair: null,
    undercoverId: null,
    players: PLAYERS.map((p) => ({
      ...p,
      word: null,
      isAlive: true,
      isUndercover: false,
    })),
    history: [],
    currentDescriptions: [],
    currentVotes: [],
    winner: null,
    lastActivity: Date.now(),
  };
}

/**
 * 获取游戏实例（延迟创建：不存在时自动创建）
 */
function getGame(gameId) {
  if (!games.has(gameId)) {
    games.set(gameId, createInitialGame());
    logger.info({ gameId }, '[Engine] 创建新游戏实例');
  }
  const game = games.get(gameId);
  game.lastActivity = Date.now();
  return game;
}

/**
 * 删除游戏实例
 */
function deleteGame(gameId) {
  games.delete(gameId);
  if (cleanupTimers.has(gameId)) {
    clearTimeout(cleanupTimers.get(gameId));
    cleanupTimers.delete(gameId);
  }
  logger.info({ gameId }, '[Engine] 游戏实例已删除');
}

/**
 * 定时清理无活动游戏
 */
function cleanupStaleGames() {
  const now = Date.now();
  for (const [gameId, game] of games) {
    if (now - game.lastActivity > STALE_THRESHOLD) {
      logger.info({ gameId, lastActivity: game.lastActivity }, '[Engine] 清理过期游戏');
      deleteGame(gameId);
    }
  }
}

// 启动定时清理（不阻止进程退出）
const cleanupTimer = setInterval(cleanupStaleGames, CLEANUP_INTERVAL);
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * 游戏结束后定时清理
 */
function scheduleCleanup(gameId) {
  if (cleanupTimers.has(gameId)) {
    clearTimeout(cleanupTimers.get(gameId));
  }
  const timer = setTimeout(() => {
    deleteGame(gameId);
  }, GAME_OVER_CLEANUP_DELAY);
  if (timer.unref) timer.unref();
  cleanupTimers.set(gameId, timer);
  logger.info({ gameId }, `[Engine] 游戏结束，${GAME_OVER_CLEANUP_DELAY / 60000}分钟后自动清理`);
}

// ========== 纯函数（不依赖 game 实例，参数传入） ==========

function getWordChars(word) {
  return word.split('');
}

function buildHistoryText(history) {
  if (!history || history.length === 0) return '';
  let text = '';
  for (const round of history) {
    text += `\n第${round.round}轮描述：\n`;
    for (const desc of round.descriptions) {
      text += `${desc.playerName}: "${desc.text}"\n`;
    }
  }
  return text;
}

function buildCurrentRoundText(descriptions) {
  if (!descriptions || descriptions.length === 0) return '';
  let text = '';
  for (const desc of descriptions) {
    text += `${desc.playerName}: "${desc.text}"\n`;
  }
  return text;
}

function buildDescriptionSystemPrompt(player) {
  const wordChars = getWordChars(player.word);

  return `你正在参与一个"谁是卧底"的游戏。

游戏规则：
- 6个人中有5个人拿到相同词语，1个人拿到相似但不同的词语（卧底）
- 每个人轮流用一句话描述自己的词语
- 不能直接说出词语本身
- 游戏规则：描述中不能包含你词语中的任何一个字（"${wordChars.join('、')}"），但如果你偶尔违反了这个规则也没关系，这只是游戏规则不是硬性限制
- 不能重复之前任何人说过的描述
- 描述要自然口语化，像真人说话

你的人设：${player.personality}
你的名字：${player.name}`;
}

function buildDescriptionUserMessage(player, round, history, currentDescriptions) {
  const historyText = buildHistoryText(history);
  const currentText = buildCurrentRoundText(currentDescriptions);
  const wordChars = getWordChars(player.word);

  let msg = `这是第${round}轮。\n你的词语是：${player.word}\n`;
  msg += `根据游戏规则，你的描述中不应该包含以下任何一个字：${wordChars.join('、')}\n\n`;

  if (historyText) {
    msg += `之前轮次的描述记录：\n${historyText}\n`;
  }
  if (currentText) {
    msg += `本轮在你之前的玩家描述：\n${currentText}\n`;
  }

  msg += `\n请用一句话描述你的词语。要求：
1. 绝对不能和上面的任何描述雷同或相似
2. 从新的角度描述
3. 控制在20-50字以内
4. 体现你的人设风格：${player.style}
5. 自然口语化

只输出描述内容，不要加引号或其他标记。`;

  return msg;
}

function buildVoteSystemPrompt(player) {
  const wordChars = getWordChars(player.word);

  return `你正在参与"谁是卧底"游戏。
你的人设：${player.personality}
你的名字：${player.name}
你的词语是：${player.word}
你的词语中的字是：${wordChars.join('、')}（你不应该在描述中使用这些字）

游戏规则提醒：
- 描述中不应该包含自己词语中的字
- 如果某个玩家在描述中使用了你的词语中的字，说明他的词语和你的不同，他可能就是卧底
- 但也要注意，有些字可能在多个词中都出现，需要综合判断

请根据所有人的描述，分析谁是卧底。`;
}

function buildVoteUserMessage(player, history, alivePlayers) {
  const historyText = buildHistoryText(history);
  const aliveNames = alivePlayers
    .filter((p) => p.id !== player.id)
    .map((p) => p.name)
    .join('、');

  return `以下是所有轮次的描述记录：
${historyText}

请投票选出你认为是卧底的玩家。
可投票的玩家：${aliveNames}

分析每个人的描述，看看谁的描述最"格格不入"，谁可能违反了禁字规则。

请以JSON格式回复（只输出JSON，不要其他内容）：
{"voteFor": "玩家名", "reason": "30字以内说明理由"}`;
}

// ========== 并发控制工具函数 ==========

/**
 * 分批并行执行，每批 concurrency 个
 * @param {Array} items - 待执行项数组
 * @param {number} concurrency - 每批并发数
 * @param {Function} fn - 处理函数，接收单个 item，返回 Promise
 * @returns {Promise<Array>} 所有结果（保持原顺序）
 */
async function runWithConcurrency(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ========== 游戏逻辑（带 gameId 参数） ==========

/**
 * 开始游戏 — 随机选词、分配身份
 */
function startGame(gameId) {
  const game = getGame(gameId);
  // 重置为初始状态再开始
  const fresh = createInitialGame();
  games.set(gameId, fresh);

  const g = games.get(gameId);
  g.state = GameState.DEALING;

  const pair = getRandomWordPair();
  g.wordPair = pair;

  const undercoverIdx = Math.floor(Math.random() * g.players.length);
  g.undercoverId = g.players[undercoverIdx].id;

  for (const p of g.players) {
    if (p.id === g.undercoverId) {
      p.word = pair.undercover;
      p.isUndercover = true;
    } else {
      p.word = pair.civilian;
      p.isUndercover = false;
    }
  }

  g.state = GameState.DESCRIBING;
  g.round = 1;
  g.currentDescriptions = [];

  logger.info({
    gameId,
    wordPair: pair,
    undercover: g.players[undercoverIdx].name,
    round: g.round,
  }, '[Engine] 游戏开始');

  return getPublicState(gameId);
}

/**
 * 下一轮 — 轮次递增，保持同一词对和卧底
 */
function nextRound(gameId) {
  const game = getGame(gameId);
  game.round += 1;
  game.currentDescriptions = [];
  game.currentVotes = [];
  game.state = GameState.DESCRIBING;
  logger.info({ gameId, round: game.round }, '[Engine] 进入新一轮');
  return getPublicState(gameId);
}

/**
 * 生成单个玩家的描述（流式）
 */
async function* generateDescription(gameId, player) {
  const game = getGame(gameId);
  const systemPrompt = buildDescriptionSystemPrompt(player);
  const userMessage = buildDescriptionUserMessage(
    player,
    game.round,
    game.history,
    game.currentDescriptions
  );

  logger.info({
    gameId,
    playerId: player.id,
    playerName: player.name,
    round: game.round,
    word: player.word,
  }, '[Engine] 开始生成描述');

  const stream = await llm.chat({
    messages: [{ role: 'user', content: userMessage }],
    systemPrompt,
    stream: true,
    temperature: 0.9,
    maxTokens: 100,
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.content) {
      fullText += chunk.content;
      yield chunk.content;
    }
  }

  const desc = {
    playerId: player.id,
    playerName: player.name,
    round: game.round,
    text: fullText.trim(),
    timestamp: new Date().toISOString(),
  };
  game.currentDescriptions.push(desc);

  logger.info({
    gameId,
    playerId: player.id,
    playerName: player.name,
    text: fullText.trim(),
  }, '[Engine] 描述完成');
}

/**
 * 生成单个玩家的投票
 */
async function generateVote(gameId, player) {
  const game = getGame(gameId);
  const alivePlayers = game.players.filter((p) => p.isAlive);
  const systemPrompt = buildVoteSystemPrompt(player);
  const userMessage = buildVoteUserMessage(player, game.history, alivePlayers);

  logger.info({
    gameId,
    voterId: player.id,
    voterName: player.name,
  }, '[Engine] 开始生成投票');

  try {
    const result = await llm.chat({
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
      stream: false,
      temperature: 0.7,
      maxTokens: 200,
      responseFormat: { type: 'json_object' },
    });

    const parsed = JSON.parse(result.content);
    logger.info({
      gameId,
      voterName: player.name,
      voteFor: parsed.voteFor,
      reason: parsed.reason,
    }, '[Engine] 投票完成');
    return {
      voterId: player.id,
      voterName: player.name,
      voteFor: parsed.voteFor || '',
      reason: parsed.reason || '',
      isFallback: false,
    };
  } catch (err) {
    const otherAlive = alivePlayers.filter((p) => p.id !== player.id);
    const randomTarget = otherAlive[Math.floor(Math.random() * otherAlive.length)];
    logger.warn({
      gameId,
      voterName: player.name,
      err: err.message,
      fallbackTarget: randomTarget.name,
    }, '[Engine] 投票JSON解析失败，使用随机投票');
    return {
      voterId: player.id,
      voterName: player.name,
      voteFor: randomTarget.name,
      reason: '直觉投票',
      isFallback: true,
    };
  }
}

/**
 * 分批并行执行所有活跃玩家的投票（concurrency 控制）
 */
async function executeVotes(gameId) {
  const game = getGame(gameId);
  game.state = GameState.VOTING;
  const alivePlayers = game.players.filter((p) => p.isAlive);

  logger.info({
    gameId,
    aliveCount: alivePlayers.length,
    concurrency: LLM_CONCURRENCY,
  }, '[Engine] 开始分批投票');

  const votes = await runWithConcurrency(
    alivePlayers,
    LLM_CONCURRENCY,
    (player) => generateVote(gameId, player)
  );

  game.currentVotes = votes;
  return votes;
}

/**
 * 淘汰得票最多者，平票无人淘汰
 */
function eliminatePlayer(gameId) {
  const game = getGame(gameId);
  const voteCount = {};
  logger.info({ gameId, votes: game.currentVotes }, '[Engine] 开始统计票数');

  for (const vote of game.currentVotes) {
    voteCount[vote.voteFor] = (voteCount[vote.voteFor] || 0) + 1;
  }

  let maxVotes = 0;
  let eliminated = null;
  let isTie = false;

  for (const [name, count] of Object.entries(voteCount)) {
    if (count > maxVotes) {
      maxVotes = count;
      eliminated = name;
      isTie = false;
    } else if (count === maxVotes) {
      isTie = true;
    }
  }

  let eliminatedPlayer = null;

  if (!isTie && eliminated) {
    const player = game.players.find((p) => p.name === eliminated);
    if (player) {
      player.isAlive = false;
      eliminatedPlayer = {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        isUndercover: player.isUndercover,
        word: player.word,
      };
    }
  }

  game.history.push({
    round: game.round,
    descriptions: [...game.currentDescriptions],
    votes: [...game.currentVotes],
    eliminated: eliminatedPlayer,
    isTie,
  });

  game.state = GameState.RESULT;
  logger.info({
    gameId,
    eliminated: eliminatedPlayer ? eliminatedPlayer.name : null,
    isTie,
    voteCount,
  }, '[Engine] 淘汰结果');
  return { eliminated: eliminatedPlayer, isTie, voteCount };
}

/**
 * 检查游戏是否结束
 */
function checkGameOver(gameId) {
  const game = getGame(gameId);
  const alivePlayers = game.players.filter((p) => p.isAlive);
  const undercover = game.players.find((p) => p.id === game.undercoverId);

  if (undercover && !undercover.isAlive) {
    game.state = GameState.GAME_OVER;
    game.winner = 'civilian';
    scheduleCleanup(gameId);
    return { gameOver: true, winner: 'civilian', undercover };
  }

  if (alivePlayers.length <= 2 && undercover && undercover.isAlive) {
    game.state = GameState.GAME_OVER;
    game.winner = 'undercover';
    scheduleCleanup(gameId);
    return { gameOver: true, winner: 'undercover', undercover };
  }

  return { gameOver: false };
}

/**
 * 重置游戏
 */
function resetGame(gameId) {
  games.set(gameId, createInitialGame());
  logger.info({ gameId }, '[Engine] 游戏已重置');
  return getPublicState(gameId);
}

/**
 * 获取当前游戏状态（旁观者视角）
 */
function getPublicState(gameId) {
  const game = getGame(gameId);
  return {
    state: game.state,
    round: game.round,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isAlive: p.isAlive,
      isUndercover: p.isUndercover,
      word: game.state === GameState.GAME_OVER ? p.word : undefined,
    })),
    aliveCount: game.players.filter((p) => p.isAlive).length,
    currentRoundDescriptions: game.currentDescriptions,
    history: game.history,
    winner: game.winner,
    wordPair: game.wordPair,
  };
}

/**
 * 获取历史记录
 */
function getHistory(gameId) {
  const game = getGame(gameId);
  return game.history;
}

/**
 * 获取活跃玩家列表
 */
function getAlivePlayers(gameId) {
  const game = getGame(gameId);
  return game.players.filter((p) => p.isAlive);
}

module.exports = {
  GameState,
  getGame,
  deleteGame,
  cleanupStaleGames,
  startGame,
  nextRound,
  generateDescription,
  executeVotes,
  eliminatePlayer,
  checkGameOver,
  resetGame,
  getPublicState,
  getHistory,
  getAlivePlayers,
};
