/**
 * 谁是卧底 — 游戏引擎
 *
 * 状态机: IDLE → DEALING → DESCRIBING → VOTING → RESULT → (GAME_OVER | DESCRIBING)
 *
 * 核心机制：
 *   - 卧底和平民的 prompt 结构完全相同，仅词语不同
 *   - 禁字规则作为"软规则"告知模型，不做硬性过滤
 *   - 描述依次进行（后者能看到前者），投票并行执行
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

// 单例游戏状态（内存存储）
let game = createInitialGame();

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
    history: [],     // [{ round, descriptions: [...], votes: [...], eliminatedId }]
    currentDescriptions: [], // 当前轮次的描述
    currentVotes: [],
    winner: null,
  };
}

/**
 * 获取词语的组成字（用于禁字规则提示）
 */
function getWordChars(word) {
  return word.split('');
}

/**
 * 构建描述历史文本（所有轮次）
 */
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

/**
 * 构建当前轮次已完成的描述文本
 */
function buildCurrentRoundText(descriptions) {
  if (!descriptions || descriptions.length === 0) return '';
  let text = '';
  for (const desc of descriptions) {
    text += `${desc.playerName}: "${desc.text}"\n`;
  }
  return text;
}

/**
 * 构建描述阶段的 systemPrompt
 * 卧底和平民使用完全相同的结构，仅 word 不同
 */
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

/**
 * 构建描述阶段的 user message
 */
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

/**
 * 构建投票阶段的 systemPrompt
 */
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

/**
 * 构建投票阶段的 user message
 */
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

/**
 * Task 2.4: 开始游戏 — 随机选词、分配身份
 */
function startGame() {
  game = createInitialGame();
  game.state = GameState.DEALING;

  const pair = getRandomWordPair();
  game.wordPair = pair;

  // 随机选一个玩家做卧底
  const undercoverIdx = Math.floor(Math.random() * game.players.length);
  game.undercoverId = game.players[undercoverIdx].id;

  // 分配词语
  for (const p of game.players) {
    if (p.id === game.undercoverId) {
      p.word = pair.undercover;
      p.isUndercover = true;
    } else {
      p.word = pair.civilian;
      p.isUndercover = false;
    }
  }

  game.state = GameState.DESCRIBING;
  game.round = 1;
  game.currentDescriptions = [];

  logger.info({
    wordPair: pair,
    undercover: game.players[undercoverIdx].name,
    round: game.round,
  }, '[Engine] 游戏开始');

  return getPublicState();
}

/**
 * Task 2.5: 下一轮 — 轮次递增，保持同一词对和卧底
 */
function nextRound() {
  game.round += 1;
  game.currentDescriptions = [];
  game.currentVotes = [];
  game.state = GameState.DESCRIBING;
  logger.info({ round: game.round }, '[Engine] 进入新一轮');
  return getPublicState();
}

/**
 * Task 3.1-3.3: 生成单个玩家的描述（流式）
 * @param {object} player - 玩家对象
 * @returns {AsyncGenerator} LLM 流式响应
 */
async function* generateDescription(player) {
  const systemPrompt = buildDescriptionSystemPrompt(player);
  const userMessage = buildDescriptionUserMessage(
    player,
    game.round,
    game.history,
    game.currentDescriptions
  );

  logger.info({
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

  // 存储描述
  const desc = {
    playerId: player.id,
    playerName: player.name,
    round: game.round,
    text: fullText.trim(),
    timestamp: new Date().toISOString(),
  };
  game.currentDescriptions.push(desc);

  logger.info({
    playerId: player.id,
    playerName: player.name,
    text: fullText.trim(),
  }, '[Engine] 描述完成');
}

/**
 * Task 3.4-3.5: 生成单个玩家的投票
 */
async function generateVote(player) {
  const alivePlayers = game.players.filter((p) => p.isAlive);
  const systemPrompt = buildVoteSystemPrompt(player);
  const userMessage = buildVoteUserMessage(player, game.history, alivePlayers);

  logger.info({
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
    // Fallback: 随机投票
    const otherAlive = alivePlayers.filter((p) => p.id !== player.id);
    const randomTarget = otherAlive[Math.floor(Math.random() * otherAlive.length)];
    logger.warn({
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
 * Task 3.6: 并行执行所有活跃玩家的投票
 */
async function executeVotes() {
  game.state = GameState.VOTING;
  const alivePlayers = game.players.filter((p) => p.isAlive);

  const votePromises = alivePlayers.map((p) => generateVote(p));
  const votes = await Promise.all(votePromises);

  game.currentVotes = votes;
  return votes;
}

/**
 * Task 2.6: 淘汰得票最多者，平票无人淘汰
 */
function eliminatePlayer() {
  // 统计票数
  const voteCount = {};
  logger.info({ votes: game.currentVotes }, '[Engine] 开始统计票数');

  for (const vote of game.currentVotes) {
    voteCount[vote.voteFor] = (voteCount[vote.voteFor] || 0) + 1;
  }

  // 找出最高票
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

  // 保存历史记录
  game.history.push({
    round: game.round,
    descriptions: [...game.currentDescriptions],
    votes: [...game.currentVotes],
    eliminated: eliminatedPlayer,
    isTie,
  });

  game.state = GameState.RESULT;
  logger.info({
    eliminated: eliminatedPlayer ? eliminatedPlayer.name : null,
    isTie,
    voteCount,
  }, '[Engine] 淘汰结果');
  return { eliminated: eliminatedPlayer, isTie, voteCount };
}

/**
 * Task 2.7: 检查游戏是否结束
 */
function checkGameOver() {
  const alivePlayers = game.players.filter((p) => p.isAlive);
  const undercover = game.players.find((p) => p.id === game.undercoverId);

  // 卧底被淘汰
  if (undercover && !undercover.isAlive) {
    game.state = GameState.GAME_OVER;
    game.winner = 'civilian';
    return { gameOver: true, winner: 'civilian', undercover };
  }

  // 仅剩2人且卧底存活
  if (alivePlayers.length <= 2 && undercover && undercover.isAlive) {
    game.state = GameState.GAME_OVER;
    game.winner = 'undercover';
    return { gameOver: true, winner: 'undercover', undercover };
  }

  return { gameOver: false };
}

/**
 * Task 2.8: 重置游戏
 */
function resetGame() {
  game = createInitialGame();
  logger.info('[Engine] 游戏已重置');
  return getPublicState();
}

/**
 * 获取当前游戏状态
 * 旁观者视角：始终暴露 isUndercover 和 wordPair（用户可见）
 * 注意：LLM 的 prompt 中不包含身份信息，仅词语不同实现隔离
 */
function getPublicState() {
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
function getHistory() {
  return game.history;
}

/**
 * 获取活跃玩家列表
 */
function getAlivePlayers() {
  return game.players.filter((p) => p.isAlive);
}

module.exports = {
  GameState,
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
