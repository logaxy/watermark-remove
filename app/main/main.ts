import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import path from "node:path";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import {
  MAX_IMPORT_COUNT,
  outputDirForFolder,
  pickVideoPaths,
  scanFolderVideos,
  type SelectVideosResult
} from "./video-import";

// 版本信息类型
type VersionInfo = {
  version: string;
  buildTime?: string;
  gitCommit?: string;
  gitBranch?: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
};

type VideoStrategy =
  | { kind: "inpaint" }
  | { kind: "sticker"; text: string; styleId: string };

type ProcessPayload = {
  videos: Array<{
    id: string;
    path: string;
    roi: { x: number; y: number; width: number; height: number };
  }>;
  strategy: VideoStrategy;
  outputDir?: string;
};

let mainWindow: BrowserWindow | null = null;
let worker: ChildProcessWithoutNullStreams | null = null;

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const projectRoot = path.resolve(__dirname, "..", "..");
const resourcesPath = app.isPackaged ? process.resourcesPath : projectRoot;
const bundledBinDir = path.join(resourcesPath, "bin");

// 读取版本信息
function getVersionInfo(): VersionInfo {
  const versionFile = path.join(__dirname, "../version.json");
  let extraInfo = {};

  if (fs.existsSync(versionFile)) {
    try {
      extraInfo = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
    } catch {
      // ignore
    }
  }

  return {
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    ...extraInfo
  };
}

// 应用启动时打印版本信息
console.log("=".repeat(50));
console.log("批量视频水印处理大师");
console.log(`版本: ${app.getVersion()}`);
console.log(`Electron: ${process.versions.electron}`);
console.log(`Node: ${process.versions.node}`);
console.log(`Chrome: ${process.versions.chrome}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log("=".repeat(50));

protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: "批量视频水印处理大师",
    backgroundColor: "#f6f7fb",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5273");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  // 启动自检
  const check = performStartupCheck();
  if (!check.ok) {
    console.error("启动自检失败:", check.errors);
  }

  protocol.handle("media", (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.searchParams.get("path") || "");
    if (!filePath || !fs.existsSync(filePath)) {
      return new Response("media file not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();
});

app.on("window-all-closed", () => {
  stopWorker();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

async function showMessageBox(options: Electron.MessageBoxOptions) {
  if (mainWindow) {
    return dialog.showMessageBox(mainWindow, options);
  }
  return dialog.showMessageBox(options);
}

async function showOpenDialog(options: Electron.OpenDialogOptions) {
  if (mainWindow) {
    return dialog.showOpenDialog(mainWindow, options);
  }
  return dialog.showOpenDialog(options);
}

ipcMain.handle("files:selectVideos", async (): Promise<SelectVideosResult> => {
  const folderResult = await showOpenDialog({
    title: "选择视频文件夹",
    message: `将扫描该文件夹内的视频（不含子目录），单次最多 ${MAX_IMPORT_COUNT} 个`,
    properties: ["openDirectory"]
  });

  if (folderResult.canceled || !folderResult.filePaths[0]) {
    return { paths: [], message: "已取消选择" };
  }

  const folderPath = folderResult.filePaths[0];
  const outputDir = outputDirForFolder(folderPath);
  const allVideos = scanFolderVideos(folderPath, Number.MAX_SAFE_INTEGER);
  const picked = pickVideoPaths(allVideos, { totalFound: allVideos.length, source: "folder" });

  if (!picked.paths.length) {
    await showMessageBox({
      type: "warning",
      title: "未找到视频",
      message: "该文件夹内没有视频文件",
      detail: "请确认文件夹内包含 mp4、mov、mkv 等视频文件，且不在子目录中。",
      buttons: ["知道了"]
    });
    return { paths: [], folderPath, outputDir, message: picked.message };
  }

  if (allVideos.length > MAX_IMPORT_COUNT) {
    await showMessageBox({
      type: "info",
      title: "已添加部分视频",
      message: picked.message,
      detail: `文件夹：${folderPath}`,
      buttons: ["知道了"]
    });
  }

  return { ...picked, folderPath, outputDir };
});

ipcMain.handle("videos:probe", async (_event, filePath: string) => {
  return runWorkerCommand({ type: "probe", path: filePath });
});

ipcMain.handle("jobs:start", async (_event, payload: ProcessPayload) => {
  if (!payload.videos.length) {
    throw new Error("没有可处理的视频");
  }
  startQueue(payload);
  return { ok: true };
});

ipcMain.handle("jobs:cancel", async () => {
  stopWorker();
  return { ok: true };
});

// 暴露版本信息给前端
ipcMain.handle("app:version", async () => {
  return getVersionInfo();
});

function defaultOutputDir(videoPath: string) {
  return path.join(path.dirname(videoPath), "output");
}

function resolvePythonBin() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const venvCandidates =
    process.platform === "win32"
      ? [path.join(projectRoot, ".venv", "Scripts", "python.exe")]
      : [path.join(projectRoot, ".venv", "bin", "python3"), path.join(projectRoot, ".venv", "bin", "python")];

  for (const candidate of venvCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === "win32" ? "python" : "python3";
}

function getRequiredBinaries(): string[] {
  const ext = process.platform === "win32" ? ".exe" : "";

  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return [
      `watermark-worker-${arch}${ext}`,
      `ffmpeg-${arch}${ext}`,
      `ffprobe-${arch}${ext}`,
    ];
  }

  // Windows
  return [
    `watermark-worker${ext}`,
    `ffmpeg${ext}`,
    `ffprobe${ext}`,
  ];
}

function performStartupCheck(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  console.log("[StartupCheck] 开始启动自检...");
  console.log(`[StartupCheck] platform=${process.platform}, arch=${process.arch}`);
  console.log(`[StartupCheck] bundledBinDir=${bundledBinDir}`);
  console.log(`[StartupCheck] isPackaged=${app.isPackaged}`);

  // 检查 bin 目录是否存在
  if (!fs.existsSync(bundledBinDir)) {
    errors.push(`Bin 目录不存在: ${bundledBinDir}`);
    return { ok: false, errors };
  }

  // 列出 bin 目录内容
  try {
    const files = fs.readdirSync(bundledBinDir);
    console.log(`[StartupCheck] Bin 目录文件: ${files.join(", ")}`);
  } catch (e) {
    errors.push(`无法读取 Bin 目录: ${e}`);
  }

  // 检查必需文件
  const required = getRequiredBinaries();
  for (const file of required) {
    const filePath = path.join(bundledBinDir, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`缺少文件: ${filePath}`);
    } else {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        errors.push(`文件大小为 0: ${filePath}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("[StartupCheck] 自检失败:");
    errors.forEach(e => console.error(`  ✗ ${e}`));
  } else {
    console.log("[StartupCheck] 自检通过 ✓");
  }

  return { ok: errors.length === 0, errors };
}

function resolveWorkerBinary() {
  const ext = process.platform === "win32" ? ".exe" : "";

  // 调试日志：记录查找信息
  console.log(`[resolveWorkerBinary] platform=${process.platform}, arch=${process.arch}`);
  console.log(`[resolveWorkerBinary] bundledBinDir=${bundledBinDir}`);
  console.log(`[resolveWorkerBinary] resourcesPath=${resourcesPath}`);
  console.log(`[resolveWorkerBinary] isPackaged=${app.isPackaged}`);

  // macOS: 根据架构查找对应的 worker
  if (process.platform === "darwin") {
    const archBinary =
      process.arch === "arm64" ? "watermark-worker-arm64" : "watermark-worker-x64";
    const archPath = path.join(bundledBinDir, `${archBinary}${ext}`);
    console.log(`[resolveWorkerBinary] macOS looking for: ${archPath}`);
    if (fs.existsSync(archPath)) {
      return archPath;
    }
    // 如果找不到架构特定版本，尝试默认名称
    console.log(`[resolveWorkerBinary] Architecture-specific worker not found, trying default`);
  }

  // Windows 和其他平台：默认名称
  const defaultPath = path.join(bundledBinDir, `watermark-worker${ext}`);
  console.log(`[resolveWorkerBinary] Looking for default: ${defaultPath}`);

  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  // 尝试列出 bin 目录内容（调试用）
  try {
    if (fs.existsSync(bundledBinDir)) {
      const files = fs.readdirSync(bundledBinDir);
      console.log(`[resolveWorkerBinary] Files in ${bundledBinDir}:`, files);
    } else {
      console.log(`[resolveWorkerBinary] bundledBinDir does not exist: ${bundledBinDir}`);
    }
  } catch (e) {
    console.error(`[resolveWorkerBinary] Error listing directory:`, e);
  }

  // 改进的错误信息
  const platformLabel = process.platform === "darwin" ? "macOS" : process.platform;
  const archLabel = process.arch;
  const expectedFiles = getRequiredBinaries();

  throw new Error(
    `未找到内置处理引擎 (${platformLabel} ${archLabel})\n\n` +
    `期望在以下目录找到文件:\n${bundledBinDir}\n\n` +
    `需要的文件:\n${expectedFiles.map(f => `  - ${f}`).join("\n")}\n\n` +
    `可能原因:\n` +
    `  1. 安装包不完整，请重新下载安装\n` +
    `  2. 应用文件被损坏或删除\n\n` +
    `如果问题持续，请联系开发者。`
  );
}

function workerCommand(mode: "process" | "probe") {
  if (app.isPackaged) {
    const workerPath = resolveWorkerBinary();
    return { command: workerPath, args: [mode], cwd: bundledBinDir };
  }

  const workerPath = path.join(projectRoot, "worker", "main.py");
  return { command: resolvePythonBin(), args: [workerPath, mode], cwd: projectRoot };
}

function workerEnv() {
  return {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    WATERMARK_BIN_DIR: bundledBinDir,
    WATERMARK_RESOURCES_DIR: resourcesPath
  };
}

function startQueue(payload: ProcessPayload) {
  stopWorker();

  const { command, args, cwd } = workerCommand("process");
  const outputDir = payload.outputDir || defaultOutputDir(payload.videos[0].path);
  fs.mkdirSync(outputDir, { recursive: true });

  worker = spawn(command, args, {
    cwd,
    env: workerEnv()
  });

  worker.on("error", (error) => {
    mainWindow?.webContents.send("jobs:event", {
      type: "error",
      fileId: "",
      message: `无法启动处理进程: ${error.message}`
    });
    mainWindow?.webContents.send("jobs:event", { type: "worker-exit", code: 1 });
    worker = null;
  });

  worker.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        mainWindow?.webContents.send("jobs:event", JSON.parse(line));
      } catch {
        mainWindow?.webContents.send("jobs:event", { type: "log", message: line });
      }
    }
  });

  worker.stderr.on("data", (chunk) => {
    mainWindow?.webContents.send("jobs:event", {
      type: "log",
      level: "error",
      message: chunk.toString()
    });
  });

  worker.on("exit", (code) => {
    mainWindow?.webContents.send("jobs:event", { type: "worker-exit", code });
    worker = null;
  });

  worker.stdin.write(JSON.stringify({ ...payload, outputDir, tempRoot: os.tmpdir() }));
  worker.stdin.end();
}

function stopWorker() {
  if (!worker) return;
  worker.kill();
  worker = null;
}

function runWorkerCommand(payload: unknown) {
  const { command, args, cwd } = workerCommand("probe");

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: workerEnv()
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Worker exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
