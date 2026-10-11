/** The AI features that cost credits, and what each costs by default (admins change it: setting ai_credit_costs). */
export const DEFAULT_AI_COSTS = {
  subtitles: 1, // per started minute of sound
  translate: 1,
  highlights: 2,
  chapters: 1,
  script: 1,
  voice: 1,
  image: 2,
  video: 20,
  grok: 2,
} as const;
export type AiTool = keyof typeof DEFAULT_AI_COSTS;
export const AI_TOOLS = Object.keys(DEFAULT_AI_COSTS) as AiTool[];

export const AI_TOOL_LABELS: Record<AiTool, string> = {
  subtitles: "Subtitles (per minute)",
  translate: "Translate",
  highlights: "Highlights",
  chapters: "YouTube chapters",
  script: "Script / prompt help",
  voice: "AI voice (per line)",
  image: "Image",
  video: "Video (Veo)",
  grok: "Grok picture",
};

/** The cost table an admin saved (JSON), merged over the defaults; bad values are ignored. */
export function parseAiCosts(json: string | null | undefined): Record<AiTool, number> {
  const out = { ...DEFAULT_AI_COSTS } as Record<AiTool, number>;
  try {
    const raw = JSON.parse(json || "{}") as Record<string, unknown>;
    for (const t of AI_TOOLS) {
      const v = Number(raw[t]);
      if (Number.isInteger(v) && v >= 0 && v <= 1000) out[t] = v;
    }
  } catch {
    /* keep the defaults */
  }
  return out;
}
