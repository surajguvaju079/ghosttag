export const matchTopics = [
  { id: "open", label: "Anything", description: "A relaxed, open conversation." },
  { id: "music", label: "Music & media", description: "Songs, films, books, and shows." },
  { id: "games", label: "Games & creativity", description: "Games, ideas, and things to make." },
  { id: "deep-talk", label: "Big questions", description: "Thoughtful conversation at your own pace." },
] as const;

export type MatchTopic = (typeof matchTopics)[number]["id"];

export function topicLabel(topic: string) {
  return matchTopics.find((item) => item.id === topic)?.label ?? "Selected topic";
}
