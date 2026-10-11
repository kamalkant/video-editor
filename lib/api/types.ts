import type { PreviewStats } from "../ffmpeg/preview";
import type { VideoInfo } from "../ffmpeg/probe";
import type { Job } from "../jobs/queue";
import type { VideoMeta } from "../videos";

export type { Job, PreviewStats, VideoInfo, VideoMeta };
export type ApiErrorBody = { error: { code: string; message: string; detail?: string } };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  try {
    const b = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, b.error.code, b.error.message, b.error.detail);
  } catch {
    return new ApiError(res.status, "http_" + res.status, "Something went wrong. Check that ViPlay Studio is still running.");
  }
}
