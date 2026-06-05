export type SelectVideosResult = {
  paths: string[];
  folderPath?: string;
  outputDir?: string;
  message: string;
};

export type VideoProbe = {
  duration: number;
  width: number;
  height: number;
  rotation: number;
};

export type Roi = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedRoi = {
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
};

export type BatchRoiConfig = {
  templateVideoId?: string;
  default: NormalizedRoi | null;
  overrides: Record<string, NormalizedRoi>;
};

export const emptyBatchRoi = (): BatchRoiConfig => ({
  default: null,
  overrides: {}
});

export type VideoItem = {
  id: string;
  path: string;
  name: string;
  duration?: number;
  width?: number;
  height?: number;
  status: "waiting" | "processing" | "completed" | "failed";
  progress: number;
  outputPath?: string;
  error?: string;
};

export type ProcessPayload = {
  videos: Array<{ id: string; path: string; roi: Roi }>;
  strategy:
    | { kind: "inpaint" }
    | { kind: "sticker"; text: string; styleId: string };
  outputDir?: string;
};

export type JobEvent =
  | { type: "progress"; fileId: string; percent: number }
  | { type: "started"; fileId: string }
  | { type: "done"; fileId: string; outputPath: string }
  | { type: "error"; fileId: string; message: string }
  | { type: "worker-exit"; code: number | null }
  | { type: "log"; level?: string; message: string };
