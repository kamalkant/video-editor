export type UniversalMediaType = "video" | "image" | "audio";

export type UniversalAiGenerationRequest = {
  mediaType: UniversalMediaType;
  prompt: string;
  target: {
    trackId?: string;
    index?: number;
    at?: number;
    clipId?: string;
  };
  options?: {
    duration?: number;
    aspect?: "16:9" | "9:16" | "1:1";
    quality?: "standard" | "hd";
    resolution?: "720p" | "1080p";
    referenceImageId?: string;
    voice?: string;
    style?: string;
    provider?: string;
    hasAudio?: boolean;
  };
};

export type ActiveGenerationJob = {
  clipId: string;
  jobId?: string;
  mediaType: UniversalMediaType;
  prompt: string;
  progress: number;
  status: "queued" | "generating" | "ready" | "failed";
  error?: string;
  startedAt: number;
};
