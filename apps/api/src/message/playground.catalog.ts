export const dailyTopics = [
  'What small thing made today better?',
  'What would you try if nobody expected you to be good at it?',
  'What is a place you would like to wander through?',
  'Which song fits your mood today?',
  'What is something kind a stranger did for you?',
  'If you had one free hour, how would you spend it?',
  'What is a tiny win you are proud of?',
  'What is a comfort food you would share?',
  'Which fictional world would you visit for one day?',
  'What is a question you wish people asked more often?',
  'What is a skill you would learn just for fun?',
  'What made you laugh recently?',
  'What is your favorite way to unwind?',
  'What is one thing you are looking forward to?',
] as const;

export const dailyStories = [
  'A paper boat appeared at the door with a map drawn inside.',
  'The old clock skipped one minute, and everyone noticed something different.',
  'A tiny garden grew overnight on the roof of the bus stop.',
  'The library returned a book that nobody remembered borrowing.',
  'A friendly note was tucked into the pocket of a borrowed coat.',
  'The last train carried one suitcase with no name on it.',
  'A street musician played a tune that made the rain pause.',
  'Someone found a key with a handwritten invitation attached.',
  'The lights in the empty café turned on just before sunrise.',
  'A postcard arrived from a place that did not appear on any map.',
  'The town agreed to leave one door open for a mystery guest.',
  'A lost umbrella led its new owner to an unexpected celebration.',
  'The first page of the notebook already knew today’s date.',
  'At sunset, the bridge displayed a message meant for strangers.',
] as const;

export const conversationPrompts = [
  'Tell me about a small win from this week.',
  'What is a harmless opinion you feel strongly about?',
  'What would your ideal slow day look like?',
  'What is something you used to dislike but now enjoy?',
  'What is a game, film, or book you keep recommending?',
  'What would you do with a surprise free afternoon?',
] as const;

export const pulseChoices = [
  {
    id: 'plans',
    question: 'Choose a free evening:',
    optionA: 'Make plans',
    optionB: 'Stay in',
  },
  {
    id: 'travel',
    question: 'Pick a weekend escape:',
    optionA: 'Mountains',
    optionB: 'Beach',
  },
  {
    id: 'stories',
    question: 'Which story pulls you in?',
    optionA: 'Mystery',
    optionB: 'Comedy',
  },
  {
    id: 'talk',
    question: 'What starts a good chat?',
    optionA: 'A funny question',
    optionB: 'A real story',
  },
  {
    id: 'play',
    question: 'Play something together?',
    optionA: 'Word game',
    optionB: 'Trivia',
  },
  {
    id: 'morning',
    question: 'Your best quiet time:',
    optionA: 'Early morning',
    optionB: 'Late night',
  },
  {
    id: 'music',
    question: 'Music while working?',
    optionA: 'Always',
    optionB: 'Silence please',
  },
  {
    id: 'food',
    question: 'A snack to share:',
    optionA: 'Sweet',
    optionB: 'Savory',
  },
] as const;

export function todayCatalog(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const day = Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
  const rotated = <T>(items: readonly T[], count: number) =>
    Array.from(
      { length: count },
      (_, index) => items[(day + index) % items.length],
    );
  return {
    date,
    topic: dailyTopics[day % dailyTopics.length],
    story: dailyStories[day % dailyStories.length],
    prompts: rotated(conversationPrompts, 3),
    pulses: rotated(pulseChoices, 3),
  };
}
