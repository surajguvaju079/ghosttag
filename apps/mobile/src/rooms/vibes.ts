import type { Vibe } from "../api/contracts";
export const vibes: {
  value: Vibe;
  label: string;
  emoji: string;
  hint: string;
  color: string;
}[] = [
  {
    value: "DEEP_TALK",
    label: "Deep talk",
    emoji: "☾",
    hint: "Skip the small talk",
    color: "#B99AFF",
  },
  {
    value: "CHAOS",
    label: "Chaos",
    emoji: "✷",
    hint: "Let it get weird",
    color: "#FF91B2",
  },
  {
    value: "RANT_ZONE",
    label: "Rant zone",
    emoji: "☁",
    hint: "Get it off your chest",
    color: "#FFBC8B",
  },
  {
    value: "GAMER_LOBBY",
    label: "Gamer lobby",
    emoji: "⌘",
    hint: "Find your next squad",
    color: "#8FE2C5",
  },
];
export function vibeLabel(vibe?: Vibe) {
  return vibes.find((item) => item.value === vibe)?.label || "Your room";
}
export function avatar(value: string) {
  const icons: Record<string, string> = {
    ghost: "👻",
    shadow: "🌑",
    nova: "✨",
    pixel: "👾",
    comet: "☄️",
    echo: "🫧",
    raven: "🐦‍⬛",
    fox: "🦊",
    owl: "🦉",
    cat: "🐈",
    moon: "🌙",
    cloud: "☁️",
    wolf: "🐺",
    panda: "🐼",
  };
  return icons[value.toLowerCase()] || "👻";
}
