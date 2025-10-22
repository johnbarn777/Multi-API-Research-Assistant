const INLINE_CODE_PATTERN = /`([^`]+)`/g;
const STRONG_EMPHASIS_PATTERN = /\*\*(.*?)\*\*/g;
const STRONG_EMPHASIS_ALT_PATTERN = /__(.*?)__/g;
const EMPHASIS_PATTERN = /\*(.*?)\*/g;
const EMPHASIS_ALT_PATTERN = /_(.*?)_/g;
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string }
  | { type: "blockquote"; text: string };

interface ParserState {
  currentParagraph: string[];
  currentList: { ordered: boolean; items: string[] } | null;
  currentCode: { language?: string; lines: string[] } | null;
  currentBlockquote: string[];
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const state: ParserState = {
    currentParagraph: [],
    currentList: null,
    currentCode: null,
    currentBlockquote: []
  };

  const flushParagraph = () => {
    if (state.currentParagraph.length === 0) {
      return;
    }
    const text = cleanInline(state.currentParagraph.join(" ").trim());
    if (text.length > 0) {
      blocks.push({
        type: "paragraph",
        text
      });
    }
    state.currentParagraph = [];
  };

  const flushList = () => {
    if (!state.currentList || state.currentList.items.length === 0) {
      state.currentList = null;
      return;
    }
    blocks.push({
      type: "list",
      ordered: state.currentList.ordered,
      items: state.currentList.items.map((item) => cleanInline(item.trim())).filter(Boolean)
    });
    state.currentList = null;
  };

  const flushCode = () => {
    if (!state.currentCode) {
      return;
    }
    const text = state.currentCode.lines.join("\n");
    if (text.trim().length > 0) {
      blocks.push({
        type: "code",
        text
      });
    }
    state.currentCode = null;
  };

  const flushBlockquote = () => {
    if (state.currentBlockquote.length === 0) {
      return;
    }
    const text = cleanInline(state.currentBlockquote.join(" ").trim());
    if (text.length > 0) {
      blocks.push({
        type: "blockquote",
        text
      });
    }
    state.currentBlockquote = [];
  };

  const flushAll = () => {
    flushCode();
    flushParagraph();
    flushList();
    flushBlockquote();
  };

  const normalized = markdown.replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of normalized) {
    const line = rawLine.trimEnd();

    if (state.currentCode) {
      if (/^```/.test(line)) {
        flushCode();
      } else {
        state.currentCode.lines.push(rawLine);
      }
      continue;
    }

    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      flushBlockquote();
      const language = line.replace(/```/, "").trim() || undefined;
      state.currentCode = { language, lines: [] };
      continue;
    }

    if (line.length === 0) {
      flushParagraph();
      flushList();
      flushBlockquote();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushAll();
      blocks.push({
        type: "heading",
        level: Math.min(headingMatch[1].length, 6),
        text: cleanInline(headingMatch[2].trim())
      });
      continue;
    }

    const bulletMatch = line.match(/^\s*([-*+])\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      flushBlockquote();
      if (!state.currentList || state.currentList.ordered) {
        flushList();
        state.currentList = {
          ordered: false,
          items: []
        };
      }
      state.currentList.items.push(bulletMatch[2].trim());
      continue;
    }

    const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushBlockquote();
      if (!state.currentList || !state.currentList.ordered) {
        flushList();
        state.currentList = {
          ordered: true,
          items: []
        };
      }
      state.currentList.items.push(orderedMatch[2].trim());
      continue;
    }

    const listContinuationMatch =
      state.currentList && line.match(/^\s{2,}(.*\S.*)$/);
    if (listContinuationMatch && state.currentList) {
      const lastIndex = state.currentList.items.length - 1;
      if (lastIndex >= 0) {
        state.currentList.items[lastIndex] = `${state.currentList.items[lastIndex]} ${listContinuationMatch[1].trim()}`;
      }
      continue;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      state.currentBlockquote.push(blockquoteMatch[1].trim());
      continue;
    }

    flushList();
    flushBlockquote();
    state.currentParagraph.push(line.trim());
  }

  flushAll();

  return blocks;
}

export function cleanInline(value: string): string {
  let result = value;

  result = result.replace(IMAGE_PATTERN, (_match, alt, url) => {
    if (alt && alt.trim().length > 0) {
      return `${alt.trim()} (${url})`;
    }
    return url;
  });

  result = result.replace(LINK_PATTERN, (_, text, url) => {
    const trimmedText = typeof text === "string" ? text.trim() : "";
    if (trimmedText.length === 0) {
      return url;
    }
    return `${trimmedText} (${url})`;
  });

  result = result
    .replace(STRONG_EMPHASIS_PATTERN, "$1")
    .replace(STRONG_EMPHASIS_ALT_PATTERN, "$1")
    .replace(EMPHASIS_PATTERN, "$1")
    .replace(EMPHASIS_ALT_PATTERN, "$1")
    .replace(INLINE_CODE_PATTERN, (_, code) => `"${code}"`);

  return result.replace(/\s+/g, " ").trim();
}
