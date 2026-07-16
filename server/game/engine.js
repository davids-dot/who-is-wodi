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
const { PLAYERS, getPlayers } = require('./players');

// 游戏状态枚举
const GameState = {
  IDLE: 'IDLE',
  DEALING: 'DEALING',
  DESCRIBING: 'DESCRIBING',
  VOTING_PENDING: 'VOTING_PENDING',
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

function createInitialGame(mode) {
  const players = getPlayers(mode || 'participate');
  return {
    state: GameState.IDLE,
    round: 0,
    wordPair: null,
    undercoverId: null,
    mode: mode || 'participate',
    players: players.map((p) => ({
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
  if (!word) return [];
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
- 7个人中有6个人拿到相同词语，1个人拿到相似但不同的词语（卧底）
- 每个人轮流用一句话描述自己的词语
- 不能直接说出词语本身
- 游戏规则：描述中不能包含你词语中的任何一个字（"${wordChars.join('、')}"），但如果你偶尔违反了这个规则也没关系，这只是游戏规则不是硬性限制
- **重要：绝对不能重复任何历史描述（包括你自己之前说过的）**
- **说话要像朋友聊天，用最口语化的方式，别说专业术语**
- 短一点，15个字以内

关键：你不知道自己是平民还是卧底！你需要根据其他人的描述来推测。

口语化要求：
- ❌ 别说："随机数生成算法"、"主打概率博弈"、"数据表明"、"受众极广"
- ✅ 要说："看运气"、"凭手气"、"大家都爱玩"、"挺常见的"
- 像朋友闲聊一样自然，别像写报告

你的人设：${player.personality}
你的名字：${player.name}`;
}

function buildDescriptionUserMessage(player, round, history, currentDescriptions) {
  const currentText = buildCurrentRoundText(currentDescriptions);
  const wordChars = getWordChars(player.word);

  // 判断是否是第一轮前三个描述的玩家
  const descriptionOrder = currentDescriptions ? currentDescriptions.length : 0;
  const isFirstRoundEarlyPlayer = round === 1 && descriptionOrder < 3;

  let msg = `这是第${round}轮。\n你的词语是：${player.word}\n`;
  msg += `根据游戏规则，你的描述中不应该包含以下任何一个字：${wordChars.join('、')}\n\n`;

  // 收集所有历史描述用于去重提示
  const allHistoryDescs = [];
  if (history && history.length > 0) {
    for (const round of history) {
      for (const desc of round.descriptions) {
        allHistoryDescs.push(`${desc.playerName}: "${desc.text}"`);
      }
    }
  }

  if (allHistoryDescs.length > 0) {
    msg += `【绝对禁止重复以下任何描述，包括你自己之前说过的】\n`;
    msg += allHistoryDescs.join('\n');
    msg += '\n\n';
  }
  if (currentText) {
    msg += `本轮在你之前的玩家描述：\n${currentText}\n`;
  }

  // 第一轮前三个玩家使用模糊描述策略
  if (isFirstRoundEarlyPlayer) {
    msg += `\n【特殊策略 - 你是本轮第${descriptionOrder + 1}个描述的玩家】
游戏刚开始，大家都不知道彼此的词是什么。你的描述应该"点到为止"，**只说大的类别，不说具体特征**。

要求：
1. **绝对不能重复上面的任何历史描述（包括你自己之前说过的）**
2. 15个字以内
3. 像聊天一样自然，别用"毕竟"、"结果"这些连接词
4. **只说类别/场景，不说特征**：
   - ✅ 说"动物"、"海鲜"、"食物"、"用品"、"游戏"、"工具"等大类
   - ✅ 说"水里游的"、"桌上玩的"、"吃的"、"用的"等场景
   - ❌ 不说具体特征：颜色、形状、材质、功能、部位
5. **留有余地**：让后面的人能接话，但卧底猜不出具体是什么

模糊描述技巧：
- 用类别词："是个动物"、"算个用品"、"一种食物"
- 用场景："水里有的"、"桌上玩的"、"平时吃的"
- 用泛指："这东西挺常见"、"大家都见过"
- **绝对避免**：壳、腿、颜色、大小、形状、功能等具体特征

示例（假设词是"螃蟹"）：
- ❌ 太直接："壳硬"、"横着走"、"有钳子"、"海鲜"
- ✅ 够模糊："是个动物"、"水里游的"、"餐桌上常见"

示例（假设词是"键盘"）：
- ❌ 太直接："打字用的"、"电脑配件"、"有黑白键"
- ✅ 够模糊："是个工具"、"桌上用的"、"办公常见"

用${player.style}的语气，给出一个模糊但合理的描述。`;
  } else {
    msg += `\n身份推测：你不知道自己是平民还是卧底。
- 观察其他人的描述，判断他们的词是否和你的词一致
- 如果其他人的描述明显和你的词是同一类 → 你是平民，正常描述你的词
- 如果其他人的描述和你的词不太相关 → 你是卧底，要假装平民，往其他人的描述方向靠拢
- 绝对不能暴露你在猜测身份！

用${player.style}的语气，一句话描述。
要求：
1. **绝对不能重复上面的任何历史描述（包括你自己之前说过的）**
2. 15个字以内
3. 像聊天一样自然，别用"毕竟"、"结果"这些连接词
4. 根据你推测的身份，选择描述策略

只输出描述内容，不要加引号或其他标记。`;
  }

  return msg;
}

function buildVoteSystemPrompt(player) {
  const wordChars = getWordChars(player.word);

  return `你正在参与"谁是卧底"游戏。
你的人设：${player.personality}
你的名字：${player.name}
你的词语是：${player.word}
你的词语中的字是：${wordChars.join('、')}（你不应该在描述中使用这些字）

关键：你不知道自己是平民还是卧底！你需要根据所有人的描述来推测自己的身份。

身份推测：
- 观察所有人的描述，判断大多数人的词是否和你的词一致
- 如果大多数人的描述明显和你的词是同一类 → 你是平民
- 如果大多数人的描述和你的词不太相关 → 你是卧底

投票策略：
- 如果你是平民 → 投给描述最可疑的人（可能是卧底）
- 如果你是卧底 → 使用"搅浑水"策略（见下方）
- 绝对不能暴露你是卧底！

【卧底搅浑水策略 - 三选一】
如果你是卧底，必须根据局势选择一种策略来投票：

1. **嫁祸策略**（推荐：当某人描述确实可疑时使用）
   - 投给那个描述最像卧底的人（比如用了明显不同的词）
   - 理由要"带节奏"："TA的描述明显跟大家不一样"、"TA说的太具体了，感觉在装"
   - 目的：把焦点转移到真正的可疑者身上

2. **抱团策略**（推荐：当大多数人意见一致时使用）
   - 投给那个已经被多人怀疑的玩家
   - 理由要"跟风"："我也觉得TA有问题"、"跟大家一样，投TA"
   - 目的：融入群体，不显得突兀

3. **装傻策略**（推荐：局势不明朗时使用）
   - 投给一个描述稍微模糊但不算最可疑的人
   - 理由要"犹豫"："不太确定，但TA的描述有点奇怪"、"感觉TA在藏着什么"
   - 目的：显得你在认真分析，但又不会引起怀疑

重要判断规则（优先级从高到低）：
1. **最高优先级**：如果某人的描述中出现了你词语中的任何一个字（${wordChars.join('、')}），说明他的词和你的不同，他大概率是卧底！
2. **高优先级**：如果某人的描述明显和你的词不是同一类（如你说"键盘"他说"黑白键"），他很可能是卧底
3. **一般优先级**：如果某人的描述太模糊、太抽象，可能是卧底在隐藏

请根据所有人的描述，分析谁是卧底。`;
}

function buildVoteUserMessage(player, history, alivePlayers) {
  const historyText = buildHistoryText(history);
  const aliveNames = alivePlayers
    .filter((p) => p.id !== player.id)
    .map((p) => p.name)
    .join('、');
  const wordChars = getWordChars(player.word);

  // 分析局势，为卧底提供策略建议
  const situationAnalysis = analyzeVotingSituation(history, alivePlayers, player);

  return `以下是所有轮次的描述记录：
${historyText}

请投票选出你认为是卧底的玩家。
可投票的玩家：${aliveNames}

身份推测：
- 观察所有人的描述，判断大多数人的词是否和你的词"${player.word}"一致
- 如果大多数人的描述明显和你的词是同一类 → 你是平民
- 如果大多数人的描述和你的词不太相关 → 你是卧底

投票策略：
- 如果你是平民 → 投给描述最可疑的人（可能是卧底）
- 如果你是卧底 → 使用"搅浑水"策略（见下方）
- 绝对不能暴露你是卧底！

【卧底搅浑水策略 - 根据局势选择】
${situationAnalysis}

投票规则：
- **绝对禁止**：理由中不能出现你的词语"${player.word}"或其中的任何一个字（${wordChars.join('、')}）
- 如果你不太确定，理由用一句话简单说（10个字以内，不要带逗号）
- 如果你非常确定，可以详细解释，但仍不能出现你的词语或其中的字
- 你可以说"描述太模糊"、"用词不对"等，但不能说出具体是哪个字
- **带节奏技巧**：理由要有"引导性"，比如"TA的描述跟大家明显不一样"、"感觉TA在装"

请以JSON格式回复（只输出JSON，不要其他内容）：
{"voteFor": "玩家名", "reason": "说明理由"}`;
}

/**
 * 分析投票局势，为卧底提供策略建议
 */
function analyzeVotingSituation(history, alivePlayers, currentPlayer) {
  if (!history || history.length === 0) {
    return '局势分析：第一轮投票，信息有限。建议使用【装傻策略】，投给一个描述稍微模糊的人，理由用犹豫的语气。';
  }

  // 统计每个玩家在描述中出现的可疑程度
  const suspicionMap = new Map();

  for (const round of history) {
    if (round.descriptions) {
      for (const desc of round.descriptions) {
        if (desc.playerId === currentPlayer.id) continue;

        let suspicionScore = suspicionMap.get(desc.playerId) || 0;

        // 描述太具体可能可疑
        if (desc.text && (desc.text.includes('用来') || desc.text.includes('可以') || desc.text.includes('有'))) {
          suspicionScore += 1;
        }

        // 描述太模糊也可能可疑
        if (desc.text && (desc.text.includes('感觉') || desc.text.includes('好像') || desc.text.includes('不太'))) {
          suspicionScore += 0.5;
        }

        suspicionMap.set(desc.playerId, suspicionScore);
      }
    }
  }

  // 找出最可疑的玩家
  let mostSuspiciousId = null;
  let maxScore = -1;
  for (const [playerId, score] of suspicionMap) {
    if (score > maxScore) {
      maxScore = score;
      mostSuspiciousId = playerId;
    }
  }

  const mostSuspiciousPlayer = alivePlayers.find(p => p.id === mostSuspiciousId);
  const suspiciousName = mostSuspiciousPlayer ? mostSuspiciousPlayer.name : '某人';

  if (maxScore > 1.5) {
    return `局势分析：${suspiciousName}的描述比较可疑，跟大家不太一样。建议使用【嫁祸策略】，投给${suspiciousName}，理由要"带节奏"，比如"TA的描述明显跟大家不一样"。`;
  } else if (maxScore > 0.5) {
    return `局势分析：局势不太明朗，${suspiciousName}稍微可疑一点。建议使用【装傻策略】，投给${suspiciousName}，理由用犹豫的语气，比如"不太确定，但感觉TA的描述有点奇怪"。`;
  } else {
    return `局势分析：大家描述都比较接近，难以分辨。建议使用【抱团策略】，观察其他人的投票倾向，然后跟风投给被多人怀疑的人。`;
  }
}

// ========== 并发控制工具函数 ==========

/**
 * 分批并行执行，每批 concurrency 个
 * @param {Array} items - 待执行项数组
 * @param {number} concurrency - 每批并发数
 * @param {Function} fn - 处理函数，接收单个 item，返回 Promise
 * @returns {Promise<Array>} 所有结果（保持原顺序） */
async function runWithConcurrency(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ========== 卧底猜词 + 擦边球描述 ==========

/**
 * 让卧底根据其他人的描述推测平民词
 * @param {Object} player - 当前玩家（卧底）
 * @param {number} round - 当前轮次
 * @param {Array} history - 历史记录
 * @param {Array} currentDescriptions - 当前轮次已完成的描述
 * @returns {Promise<string|null>} 推测的平民词，如果无法推测则返回 null
 */
async function inferCivilianWord(player, round, history, currentDescriptions) {
  // 收集所有其他人的描述
  const allDescriptions = [];

  // 从历史记录中收集
  if (history && history.length > 0) {
    for (const roundData of history) {
      if (roundData.descriptions) {
        for (const desc of roundData.descriptions) {
          if (desc.playerId !== player.id) {
            allDescriptions.push(desc.text);
          }
        }
      }
    }
  }

  // 从当前轮次收集
  if (currentDescriptions) {
    for (const desc of currentDescriptions) {
      if (desc.playerId !== player.id) {
        allDescriptions.push(desc.text);
      }
    }
  }

  // 如果描述太少，无法推测
  if (allDescriptions.length < 2) {
    return null;
  }

  const prompt = `你是"谁是卧底"游戏中的玩家。你的词语是"${player.word}"。

你观察到其他玩家的描述：
${allDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

这些描述都是围绕同一个词的（平民词），但你的词和他们的不一样（你是卧底）。

请根据这些描述，推测平民可能是什么词。

要求：
1. 只输出一个词，不要解释
2. 如果完全无法推测，输出"UNKNOWN"
3. 尽量准确，但不要猜得太离谱

推测的平民词是：`;

  try {
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: '你是一个善于推理的玩家，擅长根据描述推测词语。只输出一个词，不要有任何解释。',
      temperature: 0.7,
      maxTokens: 20,
    });

    const inferredWord = response.trim();

    if (inferredWord && inferredWord !== 'UNKNOWN' && inferredWord.length < 20) {
      logger.info({
        playerName: player.name,
        undercoverWord: player.word,
        inferredCivilianWord: inferredWord,
        descriptionCount: allDescriptions.length,
      }, '[Engine] 卧底推测平民词成功');
      return inferredWord;
    }

    return null;
  } catch (err) {
    logger.warn({
      playerName: player.name,
      err: err.message,
    }, '[Engine] 卧底推测平民词失败');
    return null;
  }
}

/**
 * 生成擦边球描述（对两个词都适用）
 * @param {Object} player - 当前玩家
 * @param {string} inferredCivilianWord - 推测的平民词
 * @param {Array} allHistoryDescs - 所有历史描述（用于去重）
 * @returns {Promise<string|null>} 擦边球描述，如果生成失败返回 null
 */
async function generateAmbiguousDescription(player, inferredCivilianWord, allHistoryDescs) {
  const prompt = `你是"谁是卧底"游戏中的玩家。你需要生成一个描述，这个描述要同时适用于两个词：
- 你的词（卧底词）："${player.word}"
- 你推测的平民词："${inferredCivilianWord}"

请生成一个15字以内的描述，这个描述要对两个词都成立，不能偏向任何一个。

擦边球描述技巧：
- 找两个词的共同点（功能、场景、类别等）
- 用模糊的、抽象的词汇
- 避免具体的特征（颜色、形状、材质等）
- 用场景化的描述

示例：
- 如果卧底词是"键盘"，平民词是"钢琴"：
  ✅ "都有黑白相间的按键"（对两者都成立）
  ✅ "按下去会发出声音"（对两者都成立）
  ❌ "用来打字"（只适用于键盘）
  ❌ "乐器的一种"（只适用于钢琴）

${allHistoryDescs.length > 0 ? `【绝对禁止重复以下任何描述】\n${allHistoryDescs.join('\n')}\n` : ''}

请生成一个擦边球描述（15字以内，像聊天一样自然）：`;

  try {
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: `你是一个聪明的卧底玩家。你的目标是生成一个"擦边球"描述，这个描述要同时适用于你的词和推测的平民词。描述要自然、口语化，15字以内。只输出描述内容，不要加引号。`,
      temperature: 0.8,
      maxTokens: 50,
    });

    const description = response.trim().replace(/[""]/g, '');

    if (description && description.length > 0 && description.length <= 30) {
      logger.info({
        playerName: player.name,
        undercoverWord: player.word,
        inferredCivilianWord,
        generatedDescription: description,
      }, '[Engine] 生成擦边球描述成功');
      return description;
    }

    return null;
  } catch (err) {
    logger.warn({
      playerName: player.name,
      err: err.message,
    }, '[Engine] 生成擦边球描述失败');
    return null;
  }
}

// ========== 游戏逻辑（带 gameId 参数） ==========

/**
 * 开始游戏 — 随机选词、分配身份
 */
function startGame(gameId, mode) {
  const game = getGame(gameId);
  // 重置为初始状态再开始
  const fresh = createInitialGame(mode);
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
 * 卧底策略：先猜平民词，再生成擦边球描述
 */
async function* generateDescription(gameId, player) {
  const game = getGame(gameId);
  if (!player.word) {
    throw new Error(`玩家 ${player.name} 的词语未分配，请先调用 startGame`);
  }

  logger.info({
    gameId,
    playerId: player.id,
    playerName: player.name,
    round: game.round,
    word: player.word,
    isUndercover: player.isUndercover,
  }, '[Engine] 开始生成描述');

  let fullText = '';
  let usedAmbiguousStrategy = false;

  // ========== 卧底特殊策略：猜词 + 擦边球描述 ==========
  // 只有卧底且不是第一轮前三个描述的玩家才尝试猜词
  const descriptionOrder = game.currentDescriptions ? game.currentDescriptions.length : 0;
  const isFirstRoundEarlyPlayer = game.round === 1 && descriptionOrder < 3;

  if (player.isUndercover && !isFirstRoundEarlyPlayer) {
    try {
      // 1. 先推测平民词
      const inferredCivilianWord = await inferCivilianWord(
        player,
        game.round,
        game.history,
        game.currentDescriptions
      );

      if (inferredCivilianWord) {
        // 2. 收集所有历史描述用于去重
        const allHistoryDescs = [];
        if (game.history && game.history.length > 0) {
          for (const round of game.history) {
            for (const desc of round.descriptions) {
              allHistoryDescs.push(desc.text);
            }
          }
        }
        if (game.currentDescriptions) {
          for (const desc of game.currentDescriptions) {
            allHistoryDescs.push(desc.text);
          }
        }

        // 3. 生成擦边球描述
        const ambiguousDesc = await generateAmbiguousDescription(
          player,
          inferredCivilianWord,
          allHistoryDescs
        );

        if (ambiguousDesc) {
          fullText = ambiguousDesc;
          usedAmbiguousStrategy = true;

          // 模拟流式输出（一次性输出）
          yield ambiguousDesc;

          logger.info({
            gameId,
            playerId: player.id,
            playerName: player.name,
            undercoverWord: player.word,
            inferredCivilianWord,
            description: ambiguousDesc,
          }, '[Engine] 卧底使用擦边球描述策略');
        }
      }
    } catch (err) {
      logger.warn({
        gameId,
        playerId: player.id,
        playerName: player.name,
        err: err.message,
      }, '[Engine] 卧底擦边球策略失败，回退到普通描述');
      // 回退到普通描述流程
      usedAmbiguousStrategy = false;
    }
  }

  // ========== 普通描述流程（非卧底或擦边球策略失败）==========
  if (!usedAmbiguousStrategy) {
    const systemPrompt = buildDescriptionSystemPrompt(player);
    const userMessage = buildDescriptionUserMessage(
      player,
      game.round,
      game.history,
      game.currentDescriptions
    );

    // 超时重试：最多尝试 2 次（1 次初始 + 1 次重试）
    const MAX_ATTEMPTS = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const stream = await llm.chat({
          messages: [{ role: 'user', content: userMessage }],
          systemPrompt,
          stream: true,
          temperature: 0.9,
          maxTokens: 100,
        });

        fullText = '';
        for await (const chunk of stream) {
          if (chunk.content) {
            fullText += chunk.content;
            yield chunk.content;
          }
        }

        // 成功，跳出重试循环
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (err.code === 'LLM_TIMEOUT' && attempt < MAX_ATTEMPTS) {
          logger.warn({
            gameId,
            playerId: player.id,
            playerName: player.name,
            attempt,
            err: err.message,
          }, '[Engine] 描述生成超时，正在重试');
          // 继续下一次循环
        } else {
          // 非超时错误或重试次数用尽，抛出
          throw err;
        }
      }
    }

    // 如果重试也失败了（理论上不会走到这里，因为上面会 throw）
    if (lastError) {
      throw lastError;
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
    usedAmbiguousStrategy,
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
    // 超时重试：最多尝试 2 次（1 次初始 + 1 次重试）
    let result = null;
    const MAX_VOTE_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_VOTE_ATTEMPTS; attempt++) {
      try {
        result = await llm.chat({
          messages: [{ role: 'user', content: userMessage }],
          systemPrompt,
          stream: false,
          temperature: 0.7,
          maxTokens: 200,
          responseFormat: { type: 'json_object' },
        });
        break; // 成功，跳出重试循环
      } catch (err) {
        if (err.code === 'LLM_TIMEOUT' && attempt < MAX_VOTE_ATTEMPTS) {
          logger.warn({
            gameId,
            voterName: player.name,
            attempt,
            err: err.message,
          }, '[Engine] 投票生成超时，正在重试');
          continue;
        }
        throw err; // 非超时错误或重试次数用尽，抛出到外层 catch
      }
    }

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
 * 统计票数，返回最高票集合和票数统计
 */
function tallyVotes(votes) {
  const voteCount = {};
  for (const vote of votes) {
    voteCount[vote.voteFor] = (voteCount[vote.voteFor] || 0) + 1;
  }

  let maxVotes = 0;
  for (const count of Object.values(voteCount)) {
    if (count > maxVotes) {
      maxVotes = count;
    }
  }

  const maxVotedPlayers = Object.entries(voteCount)
    .filter(([_, count]) => count === maxVotes)
    .map(([name, _]) => name);

  return { voteCount, maxVotes, maxVotedPlayers };
}

/**
 * 执行决胜投票：非最高票玩家对最高票候选人重新投票
 */
async function executeRunoffVote(gameId, maxVotedPlayers, originalVotes) {
  const game = getGame(gameId);

  // 找出非最高票玩家（可以参与决胜投票的人）
  const maxVotedSet = new Set(maxVotedPlayers);
  const runoffVoters = game.players.filter(
    (p) => p.isAlive && !maxVotedSet.has(p.name) && !p.isHuman
  );

  // 如果没有非最高票玩家，无法决胜
  if (runoffVoters.length === 0) {
    logger.info({ gameId, maxVotedPlayers }, '[Engine] 无决胜投票参与者，判定平票');
    return null;
  }

  logger.info({
    gameId,
    maxVotedPlayers,
    runoffVoterCount: runoffVoters.length,
  }, '[Engine] 开始决胜投票');

  // 让非最高票玩家对最高票候选人投票
  const runoffVotes = [];
  for (const voter of runoffVoters) {
    const vote = await generateRunoffVote(gameId, voter, maxVotedPlayers);
    runoffVotes.push(vote);
  }

  // 合并原投票和决胜投票（只保留投给最高票候选人的票）
  const relevantOriginalVotes = originalVotes.filter(
    (v) => maxVotedSet.has(v.voteFor)
  );
  const allRunoffVotes = [...relevantOriginalVotes, ...runoffVotes];

  // 重新统计
  const { voteCount, maxVotes, maxVotedPlayers: newMaxVoted } = tallyVotes(allRunoffVotes);

  logger.info({
    gameId,
    voteCount,
    maxVotedPlayers: newMaxVoted,
  }, '[Engine] 决胜投票结果');

  // 如果决胜后仍有多个最高票，递归进行下一轮决胜
  if (newMaxVoted.length > 1) {
    // 检查是否可以继续决胜（是否有非最高票玩家）
    const newMaxVotedSet = new Set(newMaxVoted);
    const remainingVoters = game.players.filter(
      (p) => p.isAlive && !newMaxVotedSet.has(p.name) && !p.isHuman
    );

    if (remainingVoters.length === 0) {
      logger.info({ gameId }, '[Engine] 决胜后仍平票，无法继续决胜');
      return null;
    }

    // 递归决胜
    return executeRunoffVote(gameId, newMaxVoted, allRunoffVotes);
  }

  // 决胜成功，返回唯一最高票者
  return newMaxVoted[0];
}

/**
 * 生成决胜投票（限制候选人范围）
 */
async function generateRunoffVote(gameId, player, candidates) {
  const game = getGame(gameId);
  const systemPrompt = buildVoteSystemPrompt(player);

  // 构建决胜投票的 userMessage，限制候选人
  const historyText = buildHistoryText(game.history);
  const candidatesStr = candidates.join('、');

  const userMessage = `以下是所有轮次的描述记录：
${historyText}

决胜投票：请从以下候选人中选出卧底。
候选人：${candidatesStr}

分析谁是卧底，必须从以上候选人中选择。

用JSON格式返回：
{
  "target": "玩家名字（必须从候选人中选择）",
  "reason": "一句话说明理由"
}`;

  try {
    const result = await llm.chat({
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
      stream: false,
      temperature: 0.7,
      maxTokens: 200,
      responseFormat: { type: 'json_object' },
    });

    const parsed = JSON.parse(result.content || '{}');
    const target = parsed.target || candidates[0];
    const reason = parsed.reason || '决胜投票';

    // 确保目标在候选人中
    const validTarget = candidates.includes(target) ? target : candidates[0];

    return {
      voterId: player.id,
      voterName: player.name,
      voteFor: validTarget,
      reason: `[决胜] ${reason}`,
      isFallback: false,
    };
  } catch (err) {
    logger.warn({ gameId, voterName: player.name, err: err.message }, '[Engine] 决胜投票失败，使用随机');
    return {
      voterId: player.id,
      voterName: player.name,
      voteFor: candidates[Math.floor(Math.random() * candidates.length)],
      reason: '[决胜] 随机选择',
      isFallback: true,
    };
  }
}

/**
 * 淘汰得票最多者，支持决胜投票
 */
async function eliminatePlayer(gameId) {
  const game = getGame(gameId);
  logger.info({ gameId, votes: game.currentVotes }, '[Engine] 开始统计票数');

  // 统计票数
  let { voteCount, maxVotes, maxVotedPlayers } = tallyVotes(game.currentVotes);

  let eliminated = null;
  let isTie = false;

  // 如果有多人最高票，尝试决胜投票
  if (maxVotedPlayers.length > 1) {
    logger.info({ gameId, maxVotedPlayers, maxVotes }, '[Engine] 出现平票，尝试决胜投票');

    const runoffResult = await executeRunoffVote(gameId, maxVotedPlayers, game.currentVotes);

    if (runoffResult) {
      // 决胜成功
      eliminated = runoffResult;
      isTie = false;
      logger.info({ gameId, eliminated }, '[Engine] 决胜投票成功');
    } else {
      // 决胜失败，判定为平票
      isTie = true;
      logger.info({ gameId }, '[Engine] 决胜投票失败，判定平票');
    }
  } else if (maxVotedPlayers.length === 1) {
    // 唯一最高票
    eliminated = maxVotedPlayers[0];
    isTie = false;
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
function resetGame(gameId, mode) {
  games.set(gameId, createInitialGame(mode));
  logger.info({ gameId, mode: mode || 'participate' }, '[Engine] 游戏已重置');
  return getPublicState(gameId);
}

/**
 * 获取当前游戏状态（信息隔离版）
 * 用户存活时：隐藏其他人的 isUndercover/word/wordPair，返回 myWord/myPlayerId
 * 用户被淘汰或游戏结束时：返回全部信息
 */
function getPublicState(gameId) {
  const game = getGame(gameId);
  const humanPlayer = game.players.find((p) => p.isHuman);
  const humanAlive = humanPlayer && humanPlayer.isAlive;
  const showAll = !humanAlive || game.state === GameState.GAME_OVER;

  return {
    state: game.state,
    round: game.round,
    mode: game.mode || 'participate',
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isAlive: p.isAlive,
      isHuman: p.isHuman || false,
      isUndercover: showAll ? p.isUndercover : undefined,
      word: showAll ? p.word : (p.isHuman ? p.word : undefined),
      personality: p.personality,
      style: p.style,
    })),
    aliveCount: game.players.filter((p) => p.isAlive).length,
    currentRoundDescriptions: game.currentDescriptions,
    history: game.history,
    winner: game.winner,
    wordPair: showAll ? game.wordPair : null,
    myWord: humanAlive ? humanPlayer.word : null,
    myPlayerId: humanPlayer ? humanPlayer.id : null,
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

// ========== 用户参与模式新增方法 ==========

const HUMAN_SEAT_ID = 4;

/**
 * 获取需要描述的 AI 玩家列表（用户存活时分批，被淘汰时全量）
 * @param {string} gameId
 * @param {boolean} isFirstBatch - true: 座位1-3, false: 座位5-7
 * @returns {Array} AI 玩家列表
 */
function describeBatch(gameId, isFirstBatch) {
  const game = getGame(gameId);
  const humanPlayer = game.players.find((p) => p.isHuman);
  const humanAlive = humanPlayer && humanPlayer.isAlive;

  // 用户被淘汰时，返回所有存活 AI（连续流模式）
  if (!humanAlive) {
    return game.players.filter((p) => p.isAlive && !p.isHuman);
  }

  // 用户存活时分批
  const aliveAIs = game.players.filter((p) => p.isAlive && !p.isHuman);
  if (isFirstBatch) {
    return aliveAIs.filter((p) => p.id < HUMAN_SEAT_ID);
  } else {
    return aliveAIs.filter((p) => p.id > HUMAN_SEAT_ID);
  }
}

/**
 * 用户提交描述文本
 */
function userDescribe(gameId, text) {
  const game = getGame(gameId);
  const humanPlayer = game.players.find((p) => p.isHuman);
  if (!humanPlayer) {
    throw new Error('No human player in this game');
  }
  const desc = {
    playerId: humanPlayer.id,
    playerName: humanPlayer.name,
    round: game.round,
    text: text.trim(),
    timestamp: new Date().toISOString(),
  };
  game.currentDescriptions.push(desc);
  logger.info({ gameId, playerId: humanPlayer.id, text: text.trim() }, '[Engine] 用户描述已提交');
  return desc;
}

/**
 * AI 投票（不执行淘汰，返回 AI 投票结果）
 */
async function aiVote(gameId) {
  const game = getGame(gameId);
  game.state = GameState.VOTING;
  const aliveAIs = game.players.filter((p) => p.isAlive && !p.isHuman);

  logger.info({
    gameId,
    aiCount: aliveAIs.length,
    concurrency: LLM_CONCURRENCY,
  }, '[Engine] 开始 AI 投票');

  const aiVotes = await runWithConcurrency(
    aliveAIs,
    LLM_CONCURRENCY,
    (player) => generateVote(gameId, player)
  );

  return aiVotes;
}

/**
 * 用户提交投票
 */
function userVote(gameId, voteFor, reason) {
  const game = getGame(gameId);
  const humanPlayer = game.players.find((p) => p.isHuman);
  if (!humanPlayer) {
    throw new Error('No human player in this game');
  }
  const vote = {
    voterId: humanPlayer.id,
    voterName: humanPlayer.name,
    voteFor,
    reason: reason || '人类玩家投票',
    isFallback: false,
  };
  logger.info({ gameId, voteFor, reason, voterName: humanPlayer.name }, '[Engine] 用户投票已提交');
  return vote;
}

/**
 * 合并所有票数，执行淘汰，检查游戏结束
 */
async function voteResult(gameId, aiVotes, userVoteResult) {
  const game = getGame(gameId);
  const allVotes = [...aiVotes];
  if (userVoteResult) {
    allVotes.push(userVoteResult);
  }
  game.currentVotes = allVotes;

  const { eliminated, isTie, voteCount } = await eliminatePlayer(gameId);
  const gameOverInfo = checkGameOver(gameId);

  return {
    votes: allVotes,
    eliminated,
    isTie,
    voteCount,
    gameOver: gameOverInfo.gameOver,
    winner: gameOverInfo.winner || null,
    undercover: gameOverInfo.undercover || null,
    state: getPublicState(gameId),
  };
}

/**
 * 标记本轮描述全部完成，进入待投票状态
 */
function setDescriptionComplete(gameId) {
  const game = getGame(gameId);
  game.state = GameState.VOTING_PENDING;
  logger.info({ gameId, round: game.round }, '[Engine] 描述完成，进入待投票');
}

/**
 * 用户离开页面，游戏结束
 */
function abandonGame(gameId) {
  const game = getGame(gameId);
  if (!game) return;

  const humanPlayer = game.players.find((p) => p.isHuman);
  game.state = GameState.GAME_OVER;

  if (humanPlayer && humanPlayer.isUndercover) {
    game.winner = 'civilian';
  } else {
    game.winner = 'undercover';
  }

  scheduleCleanup(gameId);
  logger.info({ gameId, winner: game.winner }, '[Engine] 用户离开，游戏结束');
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
  describeBatch,
  setDescriptionComplete,
  userDescribe,
  aiVote,
  userVote,
  voteResult,
  abandonGame,
};
