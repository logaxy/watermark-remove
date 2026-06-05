import type { BatchRoiConfig, NormalizedRoi, Roi, VideoItem } from "../types";

export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

/** Electron 开发模式下 http 页面无法直接加载 file://，需走自定义协议 */
export function toMediaUrl(filePath: string) {
  return `media://local/?path=${encodeURIComponent(filePath)}`;
}

export function formatDuration(seconds?: number) {
  if (!seconds || Number.isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function clampRoi(roi: Roi, width: number, height: number): Roi {
  const x = Math.max(0, Math.min(Math.round(roi.x), width - 1));
  const y = Math.max(0, Math.min(Math.round(roi.y), height - 1));
  const right = Math.max(x + 1, Math.min(Math.round(roi.x + roi.width), width));
  const bottom = Math.max(y + 1, Math.min(Math.round(roi.y + roi.height), height));

  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

export function mapDisplayRoiToNatural(
  roi: Roi,
  mediaBox: DOMRect,
  canvasBox: DOMRect,
  naturalWidth: number,
  naturalHeight: number
) {
  const local = {
    x: roi.x - (mediaBox.left - canvasBox.left),
    y: roi.y - (mediaBox.top - canvasBox.top),
    width: roi.width,
    height: roi.height
  };

  const mapped = {
    x: (local.x / mediaBox.width) * naturalWidth,
    y: (local.y / mediaBox.height) * naturalHeight,
    width: (local.width / mediaBox.width) * naturalWidth,
    height: (local.height / mediaBox.height) * naturalHeight
  };

  return clampRoi(mapped, naturalWidth, naturalHeight);
}

export function absoluteToNormalized(roi: Roi, width: number, height: number): NormalizedRoi {
  return {
    xRatio: roi.x / width,
    yRatio: roi.y / height,
    widthRatio: roi.width / width,
    heightRatio: roi.height / height
  };
}

export function normalizedToAbsolute(normalized: NormalizedRoi, width: number, height: number): Roi {
  return clampRoi(
    {
      x: normalized.xRatio * width,
      y: normalized.yRatio * height,
      width: normalized.widthRatio * width,
      height: normalized.heightRatio * height
    },
    width,
    height
  );
}

export function resolveVideoRoi(
  video: Pick<VideoItem, "id" | "width" | "height">,
  config: BatchRoiConfig
): Roi | null {
  if (!video.width || !video.height) return null;

  const normalized = config.overrides[video.id] ?? config.default;
  if (!normalized) return null;

  return normalizedToAbsolute(normalized, video.width, video.height);
}

export function mapNaturalRoiToDisplay(
  roi: Roi,
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number
): Roi {
  const box = objectFitContainBox(containerWidth, containerHeight, naturalWidth, naturalHeight);
  return {
    x: box.left + (roi.x / naturalWidth) * box.width,
    y: box.top + (roi.y / naturalHeight) * box.height,
    width: (roi.width / naturalWidth) * box.width,
    height: (roi.height / naturalHeight) * box.height
  };
}

export function objectFitContainBox(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
) {
  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;

  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height
  };
}
