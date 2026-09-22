export type EmojiPuzzle = { emoji: string; answer: string; hint: string };

export const EMOJI_PUZZLES: EmojiPuzzle[] = [
  { emoji: "🌧️ mixed🐈", answer: "RAINING CATS AND DOGS", hint: "Idiom" },
  { emoji: "⏰💰", answer: "TIME IS MONEY", hint: "Saying" },
  { emoji: "🍰🕯️", answer: "BIRTHDAY CAKE", hint: "Celebration" },
  { emoji: "🌙⭐", answer: "GOOD NIGHT", hint: "Greeting" },
  { emoji: "🐝🍯", answer: "BUSY BEE", hint: "Phrase" },
  { emoji: "🧊🧊🧊👶", answer: "ICE ICE BABY", hint: "Song" },
  { emoji: "👀🍎", answer: "EYE CANDY", hint: "Slang" },
  { emoji: "💔🏠", answer: "BROKEN HOME", hint: "Phrase" },
  { emoji: "🔥🌶️", answer: "HOT STUFF", hint: "Slang" },
  { emoji: "🧠💡", answer: "BRIGHT IDEA", hint: "Phrase" },
  { emoji: "🐢🏁", answer: "SLOW AND STEADY", hint: "Fable" },
  { emoji: "🎣🎣", answer: "FISHING", hint: "Activity" },
  { emoji: "👑💍", answer: "CROWN JEWEL", hint: "Phrase" },
  { emoji: "☕☕☕", answer: "COFFEE BREAK", hint: "Work" },
  { emoji: "🎬🍿", answer: "MOVIE NIGHT", hint: "Fun" },
  { emoji: "📚🐜", answer: "BOOKWORM", hint: "Person" },
  { emoji: "🌞🌻", answer: "SUNFLOWER", hint: "Plant" },
  { emoji: "❄️👸", answer: "ICE QUEEN", hint: "Character" },
  { emoji: "🎸⭐", answer: "ROCK STAR", hint: "Fame" },
  { emoji: "🧩🔑", answer: "PUZZLE KEY", hint: "Meta" },
];

export function pickEmojiPuzzles(n: number): EmojiPuzzle[] {
  const shuffled = [...EMOJI_PUZZLES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}
