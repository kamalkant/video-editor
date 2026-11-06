/** The audio tools (video.viplay.in/audio/…): sound files edited in the browser, nothing uploaded. */
export type AudioToolId = "convert" | "compress" | "trim" | "normalize" | "record";

export const AUDIO_TOOLS: { id: AudioToolId; title: string; short: string; description: string }[] = [
  { id: "convert", title: "Audio Converter", short: "MP3, M4A, WAV, WebM", description: "Change a sound file (or a video's sound) to MP3, M4A, WAV or WebM." },
  { id: "compress", title: "Audio Compressor", short: "Make the file smaller", description: "Make a sound file smaller: a lower bitrate, mono, a lower sample rate. Shows the size before and after." },
  { id: "trim", title: "Audio Trimmer", short: "Cut start and end, fade", description: "Cut a sound to the part you want on its waveform, with fade in and fade out." },
  { id: "normalize", title: "Audio Normalizer", short: "Even loudness (LUFS)", description: "Make a sound as loud as streaming sites expect (−14 LUFS), podcasts (−16) or broadcast (−23), without clipping." },
  { id: "record", title: "Voice Recorder", short: "Record your microphone", description: "Record your voice with a live level meter, listen back, and save it as MP3, M4A, WAV or WebM." },
];

export const audioToolById = (id: string) => AUDIO_TOOLS.find((t) => t.id === id);
