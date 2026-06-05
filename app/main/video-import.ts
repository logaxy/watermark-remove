import fs from "node:fs";
import path from "node:path";

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".flv"] as const;
export const MIN_IMPORT_COUNT = 1;
export const MAX_IMPORT_COUNT = 10;
export const OUTPUT_SUBDIR = "output";

export type SelectVideosResult = {
  paths: string[];
  folderPath?: string;
  outputDir?: string;
  message: string;
};

export function outputDirForFolder(folderPath: string) {
  return path.join(folderPath, OUTPUT_SUBDIR);
}

const extensionSet = new Set(VIDEO_EXTENSIONS);

export function isVideoFile(filePath: string) {
  return extensionSet.has(path.extname(filePath).toLowerCase() as (typeof VIDEO_EXTENSIONS)[number]);
}

export function scanFolderVideos(folderPath: string, limit = MAX_IMPORT_COUNT) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(folderPath, entry.name))
    .filter(isVideoFile)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))
    .slice(0, limit);
}

export function pickVideoPaths(
  rawPaths: string[],
  options?: { totalFound?: number; source?: "files" | "folder" }
): SelectVideosResult {
  const unique = Array.from(new Set(rawPaths.filter(isVideoFile))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
  );

  if (!unique.length) {
    return {
      paths: [],
      message:
        options?.source === "folder" ? "该文件夹内没有视频文件" : "未选择有效的视频文件"
    };
  }

  const totalFound = options?.totalFound ?? unique.length;
  const selected = unique.slice(0, MAX_IMPORT_COUNT);

  if (selected.length < MIN_IMPORT_COUNT) {
    return { paths: [], message: "请至少选择 1 个视频" };
  }

  if (totalFound > MAX_IMPORT_COUNT) {
    return {
      paths: selected,
      message: `共找到 ${totalFound} 个视频，已添加前 ${MAX_IMPORT_COUNT} 个`
    };
  }

  return {
    paths: selected,
    message: `成功添加 ${selected.length} 个视频`
  };
}
