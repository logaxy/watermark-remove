export {};

import type { JobEvent, ProcessPayload, SelectVideosResult, VideoProbe } from "./types";

declare global {
  interface Window {
    watermarkApi: {
      selectVideos(): Promise<SelectVideosResult>;
      probeVideo(path: string): Promise<VideoProbe>;
      startJob(payload: ProcessPayload): Promise<{ ok: boolean }>;
      cancelJob(): Promise<{ ok: boolean }>;
      onJobEvent(callback: (event: JobEvent) => void): () => void;
    };
  }
}
