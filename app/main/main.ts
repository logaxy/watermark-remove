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
const projectRoot = app.isPackaged
  ? path.dirname(app.getPath("exe"))
  : path.resolve(__dirname, "..", "..");

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

function startQueue(payload: ProcessPayload) {
  stopWorker();

  const workerPath = path.join(projectRoot, "worker", "main.py");
  const pythonBin = resolvePythonBin();
  const outputDir = payload.outputDir || defaultOutputDir(payload.videos[0].path);
  fs.mkdirSync(outputDir, { recursive: true });

  worker = spawn(pythonBin, [workerPath, "process"], {
    cwd: projectRoot,
    env: { ...process.env, PYTHONUNBUFFERED: "1" }
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
  const workerPath = path.join(projectRoot, "worker", "main.py");
  const pythonBin = resolvePythonBin();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [workerPath, "probe"], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
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
