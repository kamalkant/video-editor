/**
 * The services a user can connect with their own API key (the "API keys"
 * window: AI Tools → Settings, or the Import dialog). Pure: the window and the
 * server share it. AI: only Gemini powers features today (the others are
 * "Soon"). Media libraries: Pexels, Pixabay and YouTube for the Import dialog.
 */

export type ProviderId = "gemini" | "grok" | "openai" | "pexels" | "pixabay" | "youtube";

export type Provider = {
  id: ProviderId;
  group: "ai" | "media";
  name: string;
  /** What it does in the editor. */
  uses: string;
  /** false: the key can be saved, but no feature uses it yet. */
  ready: boolean;
  keyUrl: string;
  /** A loose check of the key's shape (so a typo is caught before saving). */
  shape: RegExp;
  example: string;
};

export const PROVIDERS: Provider[] = [
  { id: "gemini", group: "ai", name: "Google Gemini", uses: "Subtitles and translation, voices, pictures and backgrounds, Veo videos", ready: true, keyUrl: "https://aistudio.google.com/apikey", shape: /^[0-9A-Za-z_\-.:=]{16,256}$/, example: "AIza… or custom key" },
  { id: "grok", group: "ai", name: "xAI Grok", uses: "Pictures and videos (Grok Imagine)", ready: true, keyUrl: "https://console.x.ai", shape: /^xai-[0-9A-Za-z]{20,200}$/, example: "xai-…" },
  { id: "openai", group: "ai", name: "OpenAI", uses: "Pictures, voices and subtitles", ready: false, keyUrl: "https://platform.openai.com/api-keys", shape: /^sk-[0-9A-Za-z_-]{20,200}$/, example: "sk-…" },
  { id: "pixabay", group: "media", name: "Pixabay", uses: "Free stock videos to import (Import → Pixabay)", ready: true, keyUrl: "https://pixabay.com/api/docs/", shape: /^\d{3,12}-[0-9a-f]{20,40}$/, example: "12345678-…" },
  { id: "youtube", group: "media", name: "YouTube Data API", uses: "Searching YouTube (Import → YouTube). A Google Cloud key with “YouTube Data API v3” turned on — not the Gemini key", ready: true, keyUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", shape: /^[0-9A-Za-z_\-.:=]{16,256}$/, example: "AIza… or custom key" },
];
export const PROVIDER_GROUPS = [
  { id: "ai", label: "AI services" },
  { id: "media", label: "Media libraries (Import)" },
] as const;

export const providerOf = (id: string) => PROVIDERS.find((p) => p.id === id);
export const isProviderId = (v: unknown): v is ProviderId => PROVIDERS.some((p) => p.id === v);

/** What the settings window shows about a provider (never the key itself). */
export type ProviderStatus = {
  id: ProviderId;
  enabled: boolean;
  hasKey: boolean;
  /** "settings": saved in AI settings; "env": from the .env.local file. */
  source: "settings" | "env" | null;
  /** The key's last 4 characters, to recognise it. */
  last4: string | null;
};
