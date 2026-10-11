import { captionWords } from "./segments";

/**
 * "Add emojis" for captions: one emoji after the first word that clearly calls for it
 * (English and Hinglish keywords). One per caption at most, so captions stay readable.
 */
const EMOJI: Array<[RegExp, string]> = [
  [/^(money|paisa|paise|rupees?|cash|price|profit|earn(ing)?s?|kamai)$/i, "💰"],
  [/^(fire|hot|lit|aag|viral)$/i, "🔥"],
  [/^(love|pyaar|pyar|dil|heart)$/i, "❤️"],
  [/^(laugh|funny|lol|haha|hasi|mazaa|maza)$/i, "😂"],
  [/^(wow|amazing|awesome|kamaal|kamal|zabardast|mast)$/i, "🤩"],
  [/^(idea|tip|tips|trick|hack|secret)$/i, "💡"],
  [/^(time|minutes?|seconds?|jaldi|fast|quick)$/i, "⏱️"],
  [/^(win|winner|success|jeet|champion)$/i, "🏆"],
  [/^(growth|grow|increase|badha|up)$/i, "📈"],
  [/^(phone|mobile|app)$/i, "📱"],
  [/^(video|camera|shoot|reel|reels|shorts)$/i, "🎬"],
  [/^(music|song|gaana|beat)$/i, "🎵"],
  [/^(food|khana|eat|tasty)$/i, "🍛"],
  [/^(stop|warning|careful|dhyan|galti|mistake)$/i, "⚠️"],
  [/^(yes|haan|right|correct|sahi)$/i, "✅"],
  [/^(no|nahi|nahin|wrong|galat)$/i, "❌"],
  [/^(think|soch|socho|question|kyun|why)$/i, "🤔"],
  [/^(world|india|bharat|global)$/i, "🌍"],
  [/^(rocket|launch|start|shuru)$/i, "🚀"],
  [/^(sad|dukh|cry|crying)$/i, "😢"],
];

const HAS_EMOJI = /\p{Extended_Pictographic}/u;

/** The emoji for a word, or null. Punctuation around the word is ignored. */
export function emojiFor(word: string): string | null {
  const bare = word.replace(/[^\p{L}\p{N}]/gu, "");
  if (!bare) return null;
  for (const [re, emoji] of EMOJI) if (re.test(bare)) return emoji;
  return null;
}

/**
 * The caption with one emoji added after its first matching word. Word timings stay in step:
 * the emoji appears together with the word before it. Captions that already have an emoji
 * are left alone, so running it twice changes nothing.
 */
export function emojiBoost(caption: { text: string; wordTimes?: number[] }): { text: string; wordTimes?: number[] } {
  if (HAS_EMOJI.test(caption.text)) return caption;
  const lines = caption.text.split("\n");
  let wordIndex = 0;
  for (let li = 0; li < lines.length; li++) {
    const words = lines[li].split(" ");
    for (let wi = 0; wi < words.length; wi++) {
      if (!words[wi]) continue;
      const emoji = emojiFor(words[wi]);
      if (emoji) {
        words.splice(wi + 1, 0, emoji);
        lines[li] = words.join(" ");
        const text = lines.join("\n");
        const times = caption.wordTimes;
        const wordTimes =
          times && times.length === captionWords(caption.text).length
            ? [...times.slice(0, wordIndex + 1), times[wordIndex], ...times.slice(wordIndex + 1)]
            : undefined;
        return wordTimes ? { text, wordTimes } : { text };
      }
      wordIndex++;
    }
  }
  return caption;
}
