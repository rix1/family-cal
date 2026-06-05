export interface MentionMatch {
  query: string;
  start: number;
  end: number;
}

export function activeMention(text: string, cursor: number): MentionMatch | null {
  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([a-z0-9-]*)$/i);
  if (!match) return null;
  const start = cursor - match[1].length - 1;
  return { query: match[1].toLowerCase(), start, end: cursor };
}

export function insertMention(
  text: string,
  match: MentionMatch,
  personId: string,
): { text: string; cursor: number } {
  const handle = `@${personId}`;
  const suffix = text.slice(match.end);
  const separator = suffix === "" || /^\s/.test(suffix) ? "" : " ";
  return {
    text: text.slice(0, match.start) + handle + separator + suffix,
    cursor: match.start + handle.length + (suffix.startsWith(" ") ? 1 : separator.length),
  };
}
