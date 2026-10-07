/** 订阅/热榜共用的极简 XML 提取（容错优先，不追求严格解析）。 */

/** 取原始块（不去标签），用于嵌套提取 */
export function rawBlock(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = pattern.exec(xml);
  return match?.[1] ?? null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** 去 CDATA、解实体、去标签、压平空白 */
export function cleanText(raw: string): string {
  return decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 取第一个匹配的标签内容（容错：标签可能带属性、大小写不一） */
export function extractTag(xml: string, tag: string): string | null {
  const raw = rawBlock(xml, tag);
  return raw != null ? cleanText(raw) : null;
}

/** 取所有匹配块（例如所有 <item>） */
export function allBlocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  for (const match of xml.matchAll(pattern)) {
    if (match[1] != null) out.push(match[1]);
  }
  return out;
}
