// Playful, encouraging messages shown when a task is completed — in the
// Logbook (deterministic per task so a row always reads the same) and as a
// completion toast (random). Mirrors the desktop LogbookRow's COMPLETION_MESSAGES.

export const COMPLETION_MESSAGES = [
  "Executed with precision",
  "Future you is grateful",
  "One less thing standing between you and your goals",
  "That's what momentum looks like",
  "You showed up and delivered",
  "Done is a beautiful word",
  "Another one bites the dust",
  "Quietly unstoppable",
  "Consistency is the new talent — nice work",
  "You make it look easy",
  "That's exactly how it's done",
  "Small win, real progress",
  "Crossed off. Moving forward",
  "Effort acknowledged, result delivered",
  "The satisfaction of done",
  "You didn't wait for perfect — you just did it",
  "Checked. What's next?",
  "Tasks fear you",
  "Done before most people started",
  "This is what a good day is made of",
];

/** Deterministic message for a given seed (e.g. a task id). */
export function completionMessage(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return COMPLETION_MESSAGES[h % COMPLETION_MESSAGES.length];
}

/** Random message for one-off nudges (toasts). */
export function randomCompletionMessage(): string {
  return COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)];
}
