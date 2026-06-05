import type { JobEvent, ProcessPayload, SelectVideosResult, VideoProbe } from "../types";

type WatermarkApi = {
  selectVideos(): Promise<SelectVideosResult>;
  probeVideo(path: string): Promise<VideoProbe>;
  startJob(payload: ProcessPayload): Promise<{ ok: boolean }>;
  cancelJob(): Promise<{ ok: boolean }>;
  onJobEvent(callback: (event: JobEvent) => void): () => void;
};

const browserPreviewApi: WatermarkApi = {
  async selectVideos() {
    return { paths: [], message: "浏览器预览模式不支持选择视频文件夹" };
  },
  async probeVideo() {
    return {
      duration: 0,
      width: 1920,
      height: 1080,
      rotation: 0
    };
  },
  async startJob() {
    return { ok: false };
  },
  async cancelJob() {
    return { ok: true };
  },
  onJobEvent() {
    return () => undefined;
  }
};

export const api: WatermarkApi = window.watermarkApi || browserPreviewApi;
