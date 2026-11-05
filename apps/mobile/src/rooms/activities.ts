// Activities are ordinary chat starters. They create no game state or history.
export const roomActivities = [
  {
    id: "story-relay",
    title: "Story relay",
    description: "Build a tiny story, one sentence each.",
    starter: "Story relay: one sentence each. I'll start: The mysterious box arrived just before sunset.",
  },
  {
    id: "word-chain",
    title: "Word chain",
    description: "Reply with a word that begins with the last letter of the previous word.",
    starter: "Word chain: each new word starts with the last letter of the previous one. First word: lantern",
  },
  {
    id: "three-clues",
    title: "Three clues",
    description: "Describe a place or object in three clues; others guess it.",
    starter: "Three clues: guess the place or object. 1) It's often quiet. 2) It holds many stories. 3) You can borrow one and take it home.",
  },
] as const;
