/**
 * 谁是卧底 — 词库
 *
 * 每组词对包含 civilian（平民词）和 undercover（卧底词）
 * 筛选标准：
 *   1. 两个词语义相近但不同
 *   2. 组成字不太常见（避免禁字过于严苛）
 *   3. 避免包含"子、的、大、小"等极高频字
 */

const WORD_PAIRS = [
  { civilian: '奶茶', undercover: '豆浆' },
  { civilian: '键盘', undercover: '钢琴' },
  { civilian: '奥特曼', undercover: '变形金刚' },
  { civilian: '火锅', undercover: '烧烤' },
  { civilian: '微信', undercover: '飞书' },
  { civilian: '篮球', undercover: '排球' },
  { civilian: '猫', undercover: '兔' },
  { civilian: '高铁', undercover: '航班' },
  { civilian: '冰箱', undercover: '空调' },
  { civilian: '红包', undercover: '礼物' },
  { civilian: '快递', undercover: '外卖' },
  { civilian: '面膜', undercover: '口红' },
  { civilian: '沙发', undercover: '床垫' },
  { civilian: '耳机', undercover: '音响' },
  { civilian: '雨伞', undercover: '斗篷' },
  { civilian: '护照', undercover: '驾照' },
  { civilian: '盲盒', undercover: '手办' },
  { civilian: '弹幕', undercover: '评论' },
  { civilian: '瀑布', undercover: '喷泉' },
  { civilian: '鞭炮', undercover: '烟花' },
  { civilian: '披萨', undercover: '煎饼' },
  { civilian: '拖鞋', undercover: '凉鞋' },
  { civilian: '帐篷', undercover: '房车' },
  { civilian: '沙漏', undercover: '闹钟' },
  { civilian: '风铃', undercover: '口哨' },
  { civilian: '魔方', undercover: '拼图' },
  { civilian: '蝉鸣', undercover: '蛙声' },
  { civilian: '萤火', undercover: '星光' },
  { civilian: '彩虹', undercover: '极光' },
  { civilian: '晚霞', undercover: '晨雾' },
  { civilian: '椰树', undercover: '竹林' },
  { civilian: '榴莲', undercover: '菠萝' },
  { civilian: '薄荷', undercover: '芥末' },
  { civilian: '旗袍', undercover: '汉服' },
  { civilian: '滑板', undercover: '旱冰' },
  { civilian: '哑铃', undercover: '杠铃' },
  { civilian: '钢笔', undercover: '毛笔' },
  { civilian: '邮票', undercover: '信封' },
  { civilian: '勋章', undercover: '奖杯' },
  { civilian: '篝火', undercover: '壁炉' },
  { civilian: '龙舟', undercover: '帆船' },
  { civilian: '风筝', undercover: '气球' },
  { civilian: '麻将', undercover: '扑克' },
  { civilian: '相声', undercover: '小品' },
  { civilian: '芭蕾', undercover: '踢踏' },
  { civilian: '排球', undercover: '水球' },
  { civilian: '攀岩', undercover: '蹦极' },
  { civilian: '冲浪', undercover: '漂流' },
  { civilian: '滑雪', undercover: '滑冰' },
  { civilian: '潜水', undercover: '泅渡' },
  { civilian: '围棋', undercover: '象棋' },
];

/**
 * 随机获取一组词对
 * @returns {{civilian: string, undercover: string}}
 */
function getRandomWordPair() {
  const idx = Math.floor(Math.random() * WORD_PAIRS.length);
  return WORD_PAIRS[idx];
}

module.exports = { WORD_PAIRS, getRandomWordPair };
