/**
 * 随机挑战生成器
 *
 * 生成随机的「语言理解」题用于验证 AI 回复的真实性。
 *
 * 设计目标：让无 LLM 的假站点/中间代理难以绕过。
 * - 老方案用数学题，答案不在题面，代理可本地计算 → 易破解。
 * - 新方案答案是题面中的某个词，靠计算无用，必须真正理解语言才能选对，
 *   而「整段回显」蒙混则由 validateResponse 的短回复规则封死。
 *
 * 成本利用：输入 token 便宜、输出 token 贵。
 * - 把鉴别力堆进「长题面」（廉价输入）：大海捞针式的多句段落，
 *   假代理必须处理整段才能定位答案。
 * - 输出锁死为「一个词」（廉价输出）：诚实模型几乎零输出成本。
 *
 * 每道题带难度档（difficulty）：
 * - 1 分类选择、2 阅读理解 —— 任何真实 LLM 都能轻松通过，
 *   用于健康检查不会把「活着但较弱」的模型误判为故障。
 * - 更高难度（推理类）留待将来的能力评估功能，本文件暂不实现。
 */

export interface Challenge {
  /** 发送给模型的问题 */
  prompt: string;
  /** 期望的正确答案（单个词，归一化后比较） */
  expectedAnswer: string;
  /** 难度档：1 = 分类选择，2 = 阅读理解 */
  difficulty: 1 | 2;
}

/** 回复中允许的最大 token 数：超过则视为整段回显，判定失败 */
const MAX_ANSWER_TOKENS = 6;

/** 分类词库：每个词只属于一个类别，避免「哪个是 X」出现歧义 */
const CATEGORY_BANK: Record<string, string[]> = {
  animal: ["cat", "dog", "tiger", "horse", "rabbit", "eagle", "dolphin", "wolf"],
  fruit: ["apple", "banana", "grape", "mango", "peach", "lemon", "cherry", "pear"],
  color: ["red", "blue", "green", "yellow", "purple", "pink", "black", "white"],
  country: ["japan", "france", "brazil", "canada", "egypt", "india", "norway", "kenya"],
  metal: ["iron", "gold", "copper", "silver", "zinc", "nickel", "lead", "tin"],
  vehicle: ["car", "truck", "train", "bicycle", "airplane", "boat", "scooter", "tram"],
  instrument: ["piano", "guitar", "violin", "drum", "flute", "trumpet", "harp", "cello"],
  drink: ["coffee", "tea", "juice", "milk", "soda", "water", "cocoa", "lemonade"],
};

/** 阅读理解题用的词库 */
const COMP_COLORS = ["brown", "gray", "golden", "spotted", "striped", "pale", "dark", "bright"];
const COMP_ANIMALS = ["fox", "owl", "bear", "deer", "frog", "crow", "otter", "lynx"];
const COMP_ACTIONS = ["slept", "jumped", "rested", "waited", "played", "hid", "stared", "wandered"];
const COMP_PLACES = ["river", "mountain", "garden", "market", "forest", "lake", "bridge", "castle"];

/** 从数组中随机取一个元素 */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** 从数组中随机取 count 个不重复元素 */
function sample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 生成难度 1：分类选择题
 *
 * 给出 1 个正确词 + 4 个其它类别的干扰词，要求选出属于目标类别的词。
 * 答案是题面中的某个词，需真正理解词义才能选对。
 */
function generateCategorySelect(): Challenge {
  const categories = Object.keys(CATEGORY_BANK);
  const targetCategory = pick(categories);
  const correct = pick(CATEGORY_BANK[targetCategory]);

  // 干扰项从其它类别中抽取（多塞几个，输入便宜、降低瞎猜命中率）
  const others = categories
    .filter((c) => c !== targetCategory)
    .flatMap((c) => CATEGORY_BANK[c]);
  const distractors = sample(others, 5);

  const options = shuffle([correct, ...distractors]);

  const prompt = `Pick the word that belongs to the given category. Reply with ONLY that one word.

Category: fruit
Options: car, banana, iron, blue, dog
A: banana

Category: ${targetCategory}
Options: ${options.join(", ")}
A:`;

  return { prompt, expectedAnswer: correct, difficulty: 1 };
}

/**
 * 生成难度 2：阅读理解题（大海捞针）
 *
 * 用随机词拼成一段含 6-7 个不同动物的描述（约 45 词，输入便宜），
 * 只针对其中一只提问，答案仍只需一个词（输出便宜）。
 * 假代理必须读完整段才能定位答案，瞎猜命中率约 1/8。
 */
function generateReadingComprehension(): Challenge {
  const count = 6 + Math.floor(Math.random() * 2); // 6-7 句 ≈ 45 词
  const animals = sample(COMP_ANIMALS, count);
  const facts = animals.map((animal) => ({
    animal,
    color: pick(COMP_COLORS),
    action: pick(COMP_ACTIONS),
    place: pick(COMP_PLACES),
  }));

  const passage = facts
    .map((f) => `The ${f.color} ${f.animal} ${f.action} near the ${f.place}.`)
    .join(" ");

  // 随机挑一只动物、随机问它的颜色或地点
  const target = pick(facts);
  const ask = pick([
    { question: `What color was the ${target.animal}?`, answer: target.color },
    { question: `Where was the ${target.animal}?`, answer: target.place },
  ]);

  const prompt = `Read the passage and answer the question with ONLY one word.

Passage: The small dog rested near the garden. The happy cat slept near the lake.
Question: Where was the cat?
A: lake

Passage: ${passage}
Question: ${ask.question}
A:`;

  return { prompt, expectedAnswer: ask.answer, difficulty: 2 };
}

/**
 * 生成一个随机语言挑战
 *
 * 在难度 1 / 2 间随机选择，二者都是任何真实 LLM 可轻松通过的题型。
 */
export function generateChallenge(): Challenge {
  return Math.random() > 0.5 ? generateCategorySelect() : generateReadingComprehension();
}

/** 验证结果 */
export interface ValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 归一化后的回复（用于失败时显示，已截断） */
  normalized: string | null;
}

/**
 * 归一化文本：转小写、去除 Markdown/标点、压缩空白
 *
 * 仅保留字母数字与单个空格，便于按词比较。
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 验证模型回复是否给出了正确答案
 *
 * 通过条件（两者都满足）：
 * 1. 正确答案作为完整词出现在回复中；
 * 2. 回复 token 数 ≤ MAX_ANSWER_TOKENS —— 拦截「整段回显题面」的蒙混破解。
 *
 * @param response 模型的回复内容
 * @param expectedAnswer 期望的答案（单个词）
 */
export function validateResponse(
  response: string,
  expectedAnswer: string
): ValidationResult {
  if (!response || !expectedAnswer) {
    return { valid: false, normalized: null };
  }

  const normalized = normalize(response);
  if (!normalized) {
    return { valid: false, normalized: null };
  }

  const expected = normalize(expectedAnswer);
  const tokens = normalized.split(" ");

  // 整段回显（如把题面/句子原样返回）token 数会远超答案，直接拒绝
  const withinLength = tokens.length <= MAX_ANSWER_TOKENS;
  const containsAnswer = tokens.includes(expected);

  // 失败时只展示前若干字符，避免日志过长
  const display = normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;

  return { valid: withinLength && containsAnswer, normalized: display };
}
