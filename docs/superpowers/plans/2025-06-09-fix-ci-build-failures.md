# 修复 GitHub Actions CI 构建失败问题

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 GitHub Actions 中 macOS 和 Windows 构建失败的问题，确保打包后的应用能正确找到二进制资源文件。

**架构:** 通过修改主进程的资源查找逻辑，使其在找不到带架构后缀的 FFmpeg 文件时，回退到不带后缀的默认文件名（universal 打包后的实际文件名）。同时修复 build-worker.sh 中的变量顺序问题和 Windows CI 构建流程。

**Tech Stack:** Electron, electron-builder, TypeScript, Bash, PowerShell

---

## 文件结构映射

| 文件 | 职责 | 操作 |
|------|------|------|
| `app/main/main.ts:243-261` | `getRequiredBinaries()` - 定义各平台需要的二进制文件名 | 修改：添加回退逻辑 |
| `app/main/main.ts:309-365` | `resolveWorkerBinary()` - 查找 worker 二进制文件 | 修改：添加 FFmpeg 回退查找 |
| `scripts/build-worker.sh:73-104` | CI 环境检测和架构构建逻辑 | 修改：修复变量定义顺序 |
| `.github/workflows/build.yml:177-320` | Windows CI 构建流程 | 修改：确保目录创建和错误处理 |
| `electron-builder.yml:13-21` | extraResources 配置 | 检查：确认配置正确 |

---

## Task 1: 修复 `build-worker.sh` 变量定义顺序

**Files:**
- Modify: `scripts/build-worker.sh:73-104`

**问题:** `CURRENT_ARCH` 变量在第 103 行才定义，但在第 79 行就被引用了。

- [ ] **Step 1: 修改变量定义位置**

将 `CURRENT_ARCH` 的定义移到 `IS_CI` 之后、使用之前：

```bash
# 检测是否在 CI 环境
IS_CI="${CI:-false}"
CURRENT_ARCH="$(uname -m)"

# 在 CI 环境下，检测是否为 Apple Silicon Mac
if [ "$IS_CI" = "true" ] && [ "$CURRENT_ARCH" = "arm64" ]; then
```

同时删除原来第 103 行的重复定义。

- [ ] **Step 2: 验证修改**

运行：`bash -n scripts/build-worker.sh`
Expected: 无语法错误

- [ ] **Step 3: Commit**

```bash
git add scripts/build-worker.sh
git commit -m "fix(build): 修复 build-worker.sh 中 CURRENT_ARCH 变量定义顺序"
```

---

## Task 2: 修改主进程支持 FFmpeg 文件名回退

**Files:**
- Modify: `app/main/main.ts:243-307`

**问题:** macOS universal 打包后，FFmpeg 文件名变为 `ffmpeg` 和 `ffprobe`（不带架构后缀），但代码期望的是 `ffmpeg-arm64`/`ffmpeg-x64`。

- [ ] **Step 1: 修改 `getRequiredBinaries()` 函数**

```typescript
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
```

**保持此函数不变**（它定义了"理想"的文件名），但需要在 `performStartupCheck()` 中添加回退逻辑。

- [ ] **Step 2: 修改 `performStartupCheck()` 添加回退逻辑**

在 `app/main/main.ts:286-297` 的必需文件检查循环中，添加回退逻辑：

```typescript
  // 检查必需文件
  const required = getRequiredBinaries();
  for (const file of required) {
    const filePath = path.join(bundledBinDir, file);
    if (!fs.existsSync(filePath)) {
      // 回退：尝试不带架构后缀的文件名（universal 打包后的文件名）
      const fallbackFile = file.replace(/-(arm64|x64)(\.exe)?$/, "$2");
      if (fallbackFile !== file) {
        const fallbackPath = path.join(bundledBinDir, fallbackFile);
        if (fs.existsSync(fallbackPath)) {
          const stats = fs.statSync(fallbackPath);
          if (stats.size === 0) {
            errors.push(`文件大小为 0: ${fallbackPath}`);
          } else {
            console.log(`[StartupCheck] 使用回退文件: ${fallbackFile}`);
          }
          continue;
        }
      }
      errors.push(`缺少文件: ${filePath}`);
    } else {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        errors.push(`文件大小为 0: ${filePath}`);
      }
    }
  }
```

- [ ] **Step 3: 修改 `resolveWorkerBinary()` 中的 FFmpeg 路径解析**

在 `app/main/main.ts:318-329` 的 macOS worker 查找逻辑后，添加 FFmpeg 路径环境变量设置（可选，用于传递给 worker）：

实际上，更合适的修改是在 `workerEnv()` 函数中，设置 `WATERMARK_FFMPEG_PATH` 和 `WATERMARK_FFPROBE_PATH` 环境变量，让 worker 知道使用哪个文件：

```typescript
function workerEnv() {
  // 检测 FFmpeg 实际文件名（带架构后缀或不带）
  let ffmpegName = "ffmpeg";
  let ffprobeName = "ffprobe";
  
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const ffmpegWithArch = `ffmpeg-${arch}`;
    const ffprobeWithArch = `ffprobe-${arch}`;
    
    if (!fs.existsSync(path.join(bundledBinDir, ffmpegWithArch))) {
      // universal 打包后的回退文件名
      ffmpegName = "ffmpeg";
      ffprobeName = "ffprobe";
    } else {
      ffmpegName = ffmpegWithArch;
      ffprobeName = ffprobeWithArch;
    }
  }

  return {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    WATERMARK_BIN_DIR: bundledBinDir,
    WATERMARK_RESOURCES_DIR: resourcesPath,
    WATERMARK_FFMPEG_PATH: path.join(bundledBinDir, ffmpegName),
    WATERMARK_FFPROBE_PATH: path.join(bundledBinDir, ffprobeName),
  };
}
```

- [ ] **Step 4: 验证 TypeScript 编译**

运行：`npm run build`
Expected: 编译成功，无错误

- [ ] **Step 5: Commit**

```bash
git add app/main/main.ts
git commit -m "fix(main): 支持 universal 打包后的 FFmpeg 文件名回退"
```

---

## Task 3: 修改 Worker 支持环境变量指定的 FFmpeg 路径

**Files:**
- Modify: `worker/runtime.py`

**问题:** Worker 需要能够使用主进程通过环境变量传递的 FFmpeg 路径。

- [ ] **Step 1: 检查当前 runtime.py 的 FFmpeg 路径逻辑**

读取 `worker/runtime.py` 文件，找到 FFmpeg 路径相关的代码。

- [ ] **Step 2: 添加环境变量支持**

在 `runtime.py` 中，修改 FFmpeg 路径获取逻辑：

```python
import os

def get_ffmpeg_path():
    """获取 FFmpeg 可执行文件路径"""
    # 优先使用主进程通过环境变量传递的路径
    env_path = os.environ.get("WATERMARK_FFMPEG_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    
    # 回退到默认查找逻辑
    # ... 原有逻辑 ...

def get_ffprobe_path():
    """获取 FFprobe 可执行文件路径"""
    env_path = os.environ.get("WATERMARK_FFPROBE_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    
    # 回退到默认查找逻辑
    # ... 原有逻辑 ...
```

- [ ] **Step 3: Commit**

```bash
git add worker/runtime.py
git commit -m "feat(worker): 支持通过环境变量指定 FFmpeg 路径"
```

---

## Task 4: 修复 Windows CI 构建流程

**Files:**
- Modify: `.github/workflows/build.yml:204-208`

**问题:** Windows CI 构建时 `resources/bin/win32/` 目录可能不存在或为空。

- [ ] **Step 1: 在 Windows 打包前添加目录创建和验证步骤**

在 `.github/workflows/build.yml` 的 "Package Windows" 步骤之前，添加目录准备步骤：

```yaml
      - name: Prepare Windows binaries
        shell: pwsh
        run: |
          $BinDir = "resources\bin\win32"
          New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
          
          # 检查目录内容
          Write-Host "=== 检查 bin 目录 ==="
          if (Test-Path $BinDir) {
            Get-ChildItem -Path $BinDir | ForEach-Object { Write-Host "  $($_.Name)" }
          } else {
            Write-Host "目录不存在: $BinDir"
          }
```

- [ ] **Step 2: 修改 package-win.ps1 确保目录创建**

在 `scripts/package-win.ps1` 中，添加目录创建和验证：

```powershell
Write-Host "==> 确保资源目录存在"
New-Item -ItemType Directory -Force -Path "resources\bin\win32" | Out-Null
New-Item -ItemType Directory -Force -Path "resources\fonts" | Out-Null
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build.yml scripts/package-win.ps1
git commit -m "fix(ci): 确保 Windows 构建时资源目录存在"
```

---

## Task 5: 本地验证 macOS 打包

**Files:**
- None (验证步骤)

- [ ] **Step 1: 运行本地 macOS 打包**

```bash
npm run pack:mac
```

- [ ] **Step 2: 验证打包后的应用结构**

```bash
DMG_PATH=$(ls release/*.dmg | head -1)
MOUNT_POINT="/tmp/watermark-verify-$(date +%s)"
mkdir -p "$MOUNT_POINT"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

APP_PATH=$(find "$MOUNT_POINT" -name "*.app" -maxdepth 2 | head -1)
echo "=== bin 目录内容 ==="
ls -la "$APP_PATH/Contents/Resources/bin/"

hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
rm -rf "$MOUNT_POINT"
```

Expected: 
- `watermark-worker-arm64` 存在
- `watermark-worker-x64` 存在（可选）
- `ffmpeg` 存在（universal 打包后的文件名）
- `ffprobe` 存在（universal 打包后的文件名）

- [ ] **Step 3: 运行应用验证自检通过**

启动应用，确认控制台输出 "自检通过"。

---

## Task 6: 最终提交和 Tag

- [ ] **Step 1: 更新版本号**

```bash
# 修改 package.json 中的 version 字段
npm version patch --no-git-tag-version
```

- [ ] **Step 2: 提交所有更改**

```bash
git add package.json package-lock.json
git commit -m "fix: 修复 CI 构建失败问题 - FFmpeg 文件名回退和变量顺序"
```

- [ ] **Step 3: 打 Tag 触发 CI**

```bash
git tag -a v0.1.5 -m "Release v0.1.5 - 修复 CI 构建失败"
git push origin master --follow-tags
```

---

## 验证清单

- [ ] `build-worker.sh` 中 `CURRENT_ARCH` 在 `IS_CI` 之后立即定义
- [ ] macOS 应用启动自检通过（能正确找到 FFmpeg）
- [ ] Windows CI 构建成功
- [ ] macOS CI 构建成功
- [ ] 应用能正常处理视频
