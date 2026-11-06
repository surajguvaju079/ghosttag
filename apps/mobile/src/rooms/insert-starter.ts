export function insertStarter(draft: string, starter: string) {
  if (!draft) return starter;
  return `${draft}${draft.endsWith("\n") ? "\n" : "\n\n"}${starter}`;
}
