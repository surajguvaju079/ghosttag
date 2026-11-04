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
  return {
    date,
    topic: dailyTopics[day % dailyTopics.length],
    prompts: conversationPrompts,
    pulses: pulseChoices,
  };
}
