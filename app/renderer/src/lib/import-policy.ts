const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".flv"]);

export const MIN_IMPORT_COUNT = 1;
export const MAX_IMPORT_COUNT = 10;

export function isVideoPath(filePath: string) {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

export function prepareImportPaths(rawPaths: string[]) {
  const unique = Array.from(new Set(rawPaths.filter(isVideoPath))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
  );

  if (!unique.length) {
    return { paths: [] as string[], message: "未找到有效的视频文件" };
  }

  const selected = unique.slice(0, MAX_IMPORT_COUNT);
  const message =
    unique.length > MAX_IMPORT_COUNT
      ? `共找到 ${unique.length} 个视频，已添加前 ${MAX_IMPORT_COUNT} 个`
      : `成功添加 ${selected.length} 个视频`;

  return { paths: selected, message };
}
