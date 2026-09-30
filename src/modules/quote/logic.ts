/** 每日一句：内置语料 + 按日期/随机挑选（纯逻辑，便于单测）。 */

export interface Quote {
  text: string;
  from?: string;
}

export const QUOTES: Quote[] = [
  { text: "行到水穷处，坐看云起时。", from: "王维《终南别业》" },
  { text: "长风破浪会有时，直挂云帆济沧海。", from: "李白《行路难》" },
  { text: "纸上得来终觉浅，绝知此事要躬行。", from: "陆游《冬夜读书示子聿》" },
  { text: "山重水复疑无路，柳暗花明又一村。", from: "陆游《游山西村》" },
  { text: "不登高山，不知天之高也。", from: "《荀子·劝学》" },
  { text: "博观而约取，厚积而薄发。", from: "苏轼《稼说送张琥》" },
  { text: "千里之行，始于足下。", from: "《老子》" },
  { text: "知者不惑，仁者不忧，勇者不惧。", from: "《论语·子罕》" },
  { text: "工欲善其事，必先利其器。", from: "《论语·卫灵公》" },
  { text: "岁月不居，时节如流。", from: "孔融《论盛孝章书》" },
  { text: "莫听穿林打叶声，何妨吟啸且徐行。", from: "苏轼《定风波》" },
  { text: "问渠那得清如许？为有源头活水来。", from: "朱熹《观书有感》" },
  { text: "会当凌绝顶，一览众山小。", from: "杜甫《望岳》" },
  { text: "沉舟侧畔千帆过，病树前头万木春。", from: "刘禹锡《酬乐天扬州初逢席上见赠》" },
  { text: "合抱之木，生于毫末；九层之台，起于累土。", from: "《老子》" },
  { text: "天行健，君子以自强不息。", from: "《周易·乾卦》" },
  { text: "海纳百川，有容乃大；壁立千仞，无欲则刚。", from: "林则徐" },
  { text: "慎终如始，则无败事。", from: "《老子》" },
  { text: "君子藏器于身，待时而动。", from: "《周易·系辞》" },
  { text: "把每一件简单的事做好，就是不简单。", from: "海尔管理格言" },
  { text: "凡事预则立，不预则废。", from: "《礼记·中庸》" },
  { text: "滴水穿石，不是力量大，而是功夫深。", from: "谚语" },
  { text: "心之所向，素履以往。", from: "《绿野仙踪》译语" },
  { text: "既以为人己愈有，既以与人己愈多。", from: "《老子》" },
  { text: "不积跬步，无以至千里；不积小流，无以成江海。", from: "《荀子·劝学》" },
  { text: "穷则独善其身，达则兼善天下。", from: "《孟子·尽心上》" },
  { text: "位卑未敢忘忧国。", from: "陆游《病起书怀》" },
  { text: "业精于勤，荒于嬉；行成于思，毁于随。", from: "韩愈《进学解》" },
  { text: "路虽远，行则将至；事虽难，做则必成。", from: "《荀子·修身》化用" },
  { text: "慢慢来，比较快。", from: "谚语" },
];

/** 周四彩蛋（向 SuperTab 的疯狂星期四文案致敬） */
export const THURSDAY_LINES: Quote[] = [
  { text: "今天星期四，谁请我吃肯德基疯狂星期四？", from: "V我50" },
  { text: "问：怎样用一句话证明今天是星期四？答：V我50。", from: "网络" },
  { text: "周四的意义不在于星期四，而在于疯狂。", from: "KFC 文学" },
  { text: "距离周末还有一天，距离疯狂星期四还剩 0 天。", from: "KFC 文学" },
];

export function isThursday(date: Date): boolean {
  return date.getDay() === 4;
}

/** 稳定的字符串哈希（用于按日期取同一条） */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export type QuoteMode = "daily" | "random";

export function pickQuote(
  date: Date,
  mode: QuoteMode,
  random: () => number = Math.random,
): Quote {
  if (isThursday(date) && mode === "daily") {
    const index = hashString(dateKey(date)) % THURSDAY_LINES.length;
    return THURSDAY_LINES[index]!;
  }
  if (mode === "random") {
    const list = isThursday(date) ? THURSDAY_LINES : QUOTES;
    return list[Math.floor(random() * list.length)] ?? list[0]!;
  }
  const index = hashString(dateKey(date)) % QUOTES.length;
  return QUOTES[index]!;
}
