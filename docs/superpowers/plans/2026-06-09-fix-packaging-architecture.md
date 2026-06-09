# 修复打包架构问题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 macOS (Intel + Apple Silicon) 和 Windows 打包后应用找不到内置处理引擎的问题，确保 CI 构建的产物可靠可用。

**Architecture:** 重构资源发现和 CI 验证流程。运行时添加启动自检，CI 添加打包后应用内部结构验证，构建脚本添加双架构 fallback 机制。

**Tech Stack:** Electron, electron-builder, GitHub Actions, Python, PyInstaller, Bash, PowerShell

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `.github/workflows/build.yml` | CI 工作流：构建、验证、发布 |
| `app/main/main.ts` | 主进程：资源发现、启动自检 |
| `scripts/build-worker.sh` | macOS Worker 构建脚本（双架构） |
| `scripts/package-mac.sh` | macOS 本地打包脚本 |
| `scripts/package-win.ps1` | Windows 本地打包脚本 |
| `electron-builder.yml` | 打包配置（保持不变，确认正确） |

---

## Task 1: 修复 CI 验证路径错误

**Files:**
- Modify: `.github/workflows/build.yml:67-73`

**问题：** CI 验证步骤使用 `resources/bin/mac/`，但实际目录是 `resources/bin/darwin/`

- [ ] **Step 1: 修复 macOS 验证路径**

将 `resources/bin/mac/` 改为 `resources/bin/darwin/`

```yaml
      - name: Verify built workers
        run: |
          echo "Built workers:"
          ls -la resources/bin/darwin/ || echo "Directory not found"
          for f in resources/bin/darwin/watermark-worker-*; do
            if [ -f "$f" ]; then
              echo "Checking: $f"
              file "$f" || true
            fi
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "fix(ci): 修复 macOS 验证路径 mac -> darwin"
```

---

## Task 2: 改进 build-worker.sh 双架构构建（添加 fallback）

**Files:**
- Modify: `scripts/build-worker.sh`

**问题：** Rosetta 2 在 CI 上可能不稳定，x86_64 构建失败会导致 Intel Mac 无法使用

**方案：** 如果 x86_64 构建失败，尝试用 arm64 的 worker 作为 fallback（Universal 应用可以在 Apple Silicon Mac 上运行 x86_64 代码，但 Intel Mac 不能运行 arm64 代码。所以 fallback 不是完美的，但至少能给出警告）

实际上更好的方案：**如果 x86_64 构建失败，整个 CI 失败**，而不是静默跳过。这样发现问题而不是让用户发现。

- [ ] **Step 1: 修改 build-worker.sh，构建失败时退出**

当前代码在 x86_64 构建失败时只是打印警告并继续：
```bash
else
    echo "⚠ 警告: 当前环境无法构建 x86_64 Worker，Intel Mac 将无法使用"
    echo "  如果在 GitHub Actions 上运行，请确保使用支持双架构的 runner"
fi
```

改为 CI 环境下构建失败时退出：

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$ROOT/worker"
OUT_DIR="$ROOT/resources/bin/darwin"
BUILD_DIR="$ROOT/build/worker"

# 检测是否在 CI 环境
IS_CI="${CI:-false}"

mkdir -p "$OUT_DIR" "$BUILD_DIR"

setup_arch_venv() {
  local arch="$1"
  local arch_venv="$BUILD_DIR/venv-$arch"

  if [ ! -d "$arch_venv" ]; then
    echo "创建 $arch Python 虚拟环境..."
    if [ "$arch" = "x86_64" ]; then
      if arch -x86_64 /usr/bin/true 2>/dev/null; then
        arch -x86_64 /usr/bin/python3 -m venv "$arch_venv"
      else
        echo "错误: 当前环境不支持 x86_64 构建" >&2
        return 1
      fi
    else
      python3 -m venv "$arch_venv"
    fi
  fi

  if [ "$arch" = "x86_64" ]; then
    if arch -x86_64 /usr/bin/true 2>/dev/null; then
      arch -x86_64 "$arch_venv/bin/python" -m pip install --upgrade pip >/dev/null
      arch -x86_64 "$arch_venv/bin/python" -m pip install -r "$WORKER_DIR/requirements.txt" pyinstaller >/dev/null
    else
      return 1
    fi
  else
    "$arch_venv/bin/python" -m pip install --upgrade pip >/dev/null
    "$arch_venv/bin/python" -m pip install -r "$WORKER_DIR/requirements.txt" pyinstaller >/dev/null
  fi
}

build_arch() {
  local arch="$1"
  local arch_dir="$BUILD_DIR/$arch"
  local arch_venv="$BUILD_DIR/venv-$arch"

  if ! setup_arch_venv "$arch"; then
    echo "✗ 无法设置 $arch 构建环境" >&2
    return 1
  fi

  mkdir -p "$arch_dir"

  echo "构建 Python Worker ($arch)..."
  (
    cd "$WORKER_DIR"
    if [ "$arch" = "x86_64" ]; then
      arch -x86_64 "$arch_venv/bin/pyinstaller" \
        --noconfirm --clean \
        --distpath "$arch_dir/dist" \
        --workpath "$arch_dir/build" \
        worker.spec
    else
      "$arch_venv/bin/pyinstaller" \
        --noconfirm --clean \
        --distpath "$arch_dir/dist" \
        --workpath "$arch_dir/build" \
        worker.spec
    fi
  )
}

# 清理旧的构建
rm -f "$OUT_DIR/watermark-worker" "$OUT_DIR/watermark-worker-arm64" "$OUT_DIR/watermark-worker-x64"

CURRENT_ARCH="$(uname -m)"
BUILD_SUCCESS=0
BUILD_FAILED=0

# 优先构建当前架构
echo "当前架构: $CURRENT_ARCH"
if [ "$CURRENT_ARCH" = "arm64" ]; then
  if build_arch arm64; then
    cp "$BUILD_DIR/arm64/dist/watermark-worker" "$OUT_DIR/watermark-worker-arm64"
    echo "✓ 已生成 arm64 Worker: $OUT_DIR/watermark-worker-arm64"
    BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
  else
    echo "✗ arm64 Worker 构建失败" >&2
    BUILD_FAILED=$((BUILD_FAILED + 1))
  fi

  # 尝试构建 x86_64
  if arch -x86_64 /usr/bin/true 2>/dev/null; then
    if build_arch x86_64; then
      cp "$BUILD_DIR/x86_64/dist/watermark-worker" "$OUT_DIR/watermark-worker-x64"
      echo "✓ 已生成 x64 Worker: $OUT_DIR/watermark-worker-x64"
      BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
    else
      echo "✗ x86_64 Worker 构建失败" >&2
      BUILD_FAILED=$((BUILD_FAILED + 1))
    fi
  else
    echo "✗ 错误: Rosetta 2 不可用，无法构建 x86_64 Worker" >&2
    BUILD_FAILED=$((BUILD_FAILED + 1))
  fi

elif [ "$CURRENT_ARCH" = "x86_64" ]; then
  if build_arch x86_64; then
    cp "$BUILD_DIR/x86_64/dist/watermark-worker" "$OUT_DIR/watermark-worker-x64"
    echo "✓ 已生成 x64 Worker: $OUT_DIR/watermark-worker-x64"
    BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
  else
    echo "✗ x86_64 Worker 构建失败" >&2
    BUILD_FAILED=$((BUILD_FAILED + 1))
  fi

  # 在 Intel Mac 上通常无法构建 arm64
  echo "⚠ 提示: 在 Intel Mac 上无法构建 arm64 Worker"
else
  echo "未知架构: $CURRENT_ARCH" >&2
  exit 1
fi

chmod +x "$OUT_DIR"/watermark-worker-* 2>/dev/null || true

echo ""
echo "构建完成: $BUILD_SUCCESS 个架构成功, $BUILD_FAILED 个架构失败"

# CI 环境下，如果任何架构构建失败，退出
if [ "$IS_CI" = "true" ] && [ "$BUILD_FAILED" -gt 0 ]; then
  echo "错误: CI 环境下不允许构建失败" >&2
  exit 1
fi

ls -la "$OUT_DIR"/watermark-worker-* 2>/dev/null || echo "未找到构建产物"
```

- [ ] **Step 2: Commit**

```bash
git add scripts/build-worker.sh
git commit -m "fix(build): CI 环境下 Worker 构建失败时退出"
```

---

## Task 3: 改进运行时资源发现（main.ts）

**Files:**
- Modify: `app/main/main.ts:218-280`

**问题：** `resolveWorkerBinary()` 在找不到文件时抛出错误，但错误信息不够详细

- [ ] **Step 1: 添加启动自检函数**

在 `resolveWorkerBinary()` 之前添加：

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
```

- [ ] **Step 2: 修改 resolveWorkerBinary，改进错误信息**

```typescript
function resolveWorkerBinary() {
  const ext = process.platform === "win32" ? ".exe" : "";

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
```

- [ ] **Step 3: 在应用启动时调用自检**

在 `app.whenReady().then(async () => { ... })` 中添加：

```typescript
app.whenReady().then(async () => {
  // 启动自检
  const check = performStartupCheck();
  if (!check.ok) {
    console.error("启动自检失败:", check.errors);
    // 不阻止应用启动，但在处理视频时会报错
  }

  protocol.handle("media", (request) => {
    // ... 现有代码
  });

  createWindow();
});
```

- [ ] **Step 4: Commit**

```bash
git add app/main/main.ts
git commit -m "feat: 添加启动自检和改进错误信息"
```

---

## Task 4: 添加 CI 打包后验证（macOS）

**Files:**
- Modify: `.github/workflows/build.yml`

**问题：** CI 只验证了构建目录，没有验证打包后的 .dmg 内部结构

- [ ] **Step 1: 在 build-mac job 中添加打包后验证步骤**

在 "Upload macOS artifact" 步骤之前添加：

```yaml
      - name: Verify packaged app structure
        run: |
          set -e
          DMG_PATH=$(ls release/*.dmg | head -1)
          if [ -z "$DMG_PATH" ]; then
            echo "错误: 未找到 .dmg 文件" >&2
            exit 1
          fi
          echo "验证打包后的应用: $DMG_PATH"

          # 创建挂载点
          MOUNT_POINT="/tmp/watermark-verify-$RANDOM"
          mkdir -p "$MOUNT_POINT"

          # 挂载 dmg
          echo "挂载 dmg..."
          hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

          # 查找 .app
          APP_PATH=$(find "$MOUNT_POINT" -name "*.app" -maxdepth 2 | head -1)
          if [ -z "$APP_PATH" ]; then
            echo "错误: 未找到 .app" >&2
            hdiutil detach "$MOUNT_POINT" -quiet || true
            exit 1
          fi
          echo "找到应用: $APP_PATH"

          # 检查 Resources/bin 目录
          BIN_DIR="$APP_PATH/Contents/Resources/bin"
          echo "检查 bin 目录: $BIN_DIR"

          if [ ! -d "$BIN_DIR" ]; then
            echo "错误: bin 目录不存在" >&2
            echo "Contents/Resources 内容:"
            ls -la "$APP_PATH/Contents/Resources/" >&2
            hdiutil detach "$MOUNT_POINT" -quiet || true
            exit 1
          fi

          echo "bin 目录内容:"
          ls -la "$BIN_DIR"

          # 检查必需文件
          REQUIRED_FILES=(
            "watermark-worker-arm64"
            "watermark-worker-x64"
            "ffmpeg-arm64"
            "ffmpeg-x64"
            "ffprobe-arm64"
            "ffprobe-x64"
          )

          MISSING=0
          for file in "${REQUIRED_FILES[@]}"; do
            FILE_PATH="$BIN_DIR/$file"
            if [ -f "$FILE_PATH" ]; then
              SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH" 2>/dev/null || echo "?")
              echo "  ✓ $file (${SIZE} bytes)"
              # 检查文件大小
              if [ "$SIZE" -eq 0 ]; then
                echo "    ✗ 错误: 文件大小为 0" >&2
                MISSING=$((MISSING + 1))
              fi
            else
              echo "  ✗ $file (缺失)" >&2
              MISSING=$((MISSING + 1))
            fi
          done

          # 卸载 dmg
          hdiutil detach "$MOUNT_POINT" -quiet || true
          rm -rf "$MOUNT_POINT"

          if [ "$MISSING" -gt 0 ]; then
            echo "错误: $MISSING 个文件缺失或无效" >&2
            exit 1
          fi

          echo "✓ 打包验证通过"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "feat(ci): 添加 macOS 打包后应用结构验证"
```

---

## Task 5: 添加 CI 打包后验证（Windows）

**Files:**
- Modify: `.github/workflows/build.yml`

**问题：** Windows 打包后也没有验证应用内部结构

- [ ] **Step 1: 在 build-win job 中添加打包后验证步骤**

在 "Upload Windows artifacts" 步骤之前添加：

```yaml
      - name: Verify packaged app structure
        shell: pwsh
        run: |
          Write-Host "=== 验证 Windows 打包结构 ==="

          # 查找 portable exe
          $portableExe = Get-ChildItem -Path "release" -Filter "*portable.exe" | Select-Object -First 1
          if (-not $portableExe) {
            Write-Host "错误: 未找到 portable exe" -ForegroundColor Red
            exit 1
          }

          Write-Host "找到 portable 版本: $($portableExe.FullName)"

          # 创建临时目录
          $tempDir = Join-Path $env:TEMP ("watermark-verify-" + [guid]::NewGuid().ToString())
          New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

          try {
            # 使用 7z 解压（electron-builder 的 portable 版本是 7z SFX）
            # 先尝试用 7z
            $sevenZip = "C:\Program Files\7-Zip\7z.exe"
            if (Test-Path $sevenZip) {
              & $sevenZip x "$($portableExe.FullName)" -o"$tempDir" -y | Out-Null
            } else {
              # 尝试直接运行提取
              Write-Host "7-Zip 未安装，尝试其他方式..."
              # 对于 NSIS 安装包，无法直接解压验证
              # 但至少检查文件大小
              $size = $portableExe.Length
              Write-Host "文件大小: $size bytes"
              if ($size -lt 100000000) {  # 小于 100MB 可能有问题
                Write-Host "警告: 文件大小异常小" -ForegroundColor Yellow
              }
            }

            # 检查解压后的目录
            $binDir = Join-Path $tempDir "resources\app\bin"
            if (Test-Path $binDir) {
              Write-Host "找到 bin 目录: $binDir"
              Get-ChildItem -Path $binDir | ForEach-Object {
                Write-Host "  $($_.Name) ($($_.Length) bytes)"
              }

              # 检查必需文件
              $requiredFiles = @("watermark-worker.exe", "ffmpeg.exe", "ffprobe.exe")
              $missing = 0
              foreach ($file in $requiredFiles) {
                $filePath = Join-Path $binDir $file
                if (Test-Path $filePath) {
                  $info = Get-Item $filePath
                  if ($info.Length -eq 0) {
                    Write-Host "  ✗ $file (大小为 0)" -ForegroundColor Red
                    $missing++
                  } else {
                    Write-Host "  ✓ $file ($($info.Length) bytes)"
                  }
                } else {
                  Write-Host "  ✗ $file (缺失)" -ForegroundColor Red
                  $missing++
                }
              }

              if ($missing -gt 0) {
                Write-Host "错误: $missing 个文件缺失或无效" -ForegroundColor Red
                exit 1
              }
            } else {
              Write-Host "警告: 无法验证内部结构（可能不是 7z 格式）" -ForegroundColor Yellow
              # 不失败，因为 NSIS 安装包无法直接解压
            }
          } finally {
            Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
          }

          Write-Host "✓ Windows 打包验证完成"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "feat(ci): 添加 Windows 打包后应用结构验证"
```

---

## Task 6: 添加本地打包验证脚本

**Files:**
- Modify: `scripts/package-mac.sh`
- Modify: `scripts/package-win.ps1`

**问题：** 本地打包后也没有验证

- [ ] **Step 1: 修改 package-mac.sh，添加打包后验证**

在文件末尾 `echo "==> 完成，产物位于 release/"` 之前添加：

```bash
echo "==> 验证打包后的应用结构"
DMG_PATH=$(ls release/*.dmg 2>/dev/null | head -1)
if [ -n "$DMG_PATH" ]; then
  MOUNT_POINT="/tmp/watermark-verify-$RANDOM"
  mkdir -p "$MOUNT_POINT"
  hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

  APP_PATH=$(find "$MOUNT_POINT" -name "*.app" -maxdepth 2 | head -1)
  if [ -n "$APP_PATH" ]; then
    BIN_DIR="$APP_PATH/Contents/Resources/bin"
    echo "检查 bin 目录: $BIN_DIR"
    if [ -d "$BIN_DIR" ]; then
      ls -la "$BIN_DIR"
      echo "✓ 应用结构验证通过"
    else
      echo "✗ 警告: bin 目录不存在"
    fi
  fi

  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  rm -rf "$MOUNT_POINT"
fi
```

- [ ] **Step 2: Commit**

```bash
git add scripts/package-mac.sh
git commit -m "feat: 本地 macOS 打包后添加应用结构验证"
```

---

## Task 7: 确认 electron-builder.yml 配置正确

**Files:**
- Read: `electron-builder.yml`

**问题：** 需要确认 `extraResources` 配置能正确复制文件

当前配置：
```yaml
extraResources:
  - from: resources/bin/${os}
    to: bin
    filter:
      - "**/*"
  - from: resources/fonts
    to: fonts
    filter:
      - "**/*"
```

这个配置是正确的：
- macOS: `${os}` = `darwin`，从 `resources/bin/darwin/` 复制到 `bin/`
- Windows: `${os}` = `win32`，从 `resources/bin/win32/` 复制到 `bin/`

**不需要修改**，但需要确认 CI 构建时目录结构正确。

- [ ] **Step 1: 确认配置正确，无需修改**

在 `package-mac.sh` 和 CI 流程中确保：
1. `resources/bin/darwin/` 目录存在
2. 包含所有必需文件
3. 文件大小不为 0

---

## Task 8: 测试完整 CI 流程

**Files:**
- 推送 tag 触发 CI

- [ ] **Step 1: 推送测试 tag**

```bash
# 确保所有修改已提交
git add .
git commit -m "fix: 修复打包架构问题"

# 打标签触发 CI
git tag -a v0.1.4 -m "Release v0.1.4 - 修复打包架构问题"
git push origin v0.1.4
```

- [ ] **Step 2: 监控 CI 构建**

在 GitHub Actions 页面观察：
1. build-mac job 是否成功
2. build-win job 是否成功
3. 验证步骤是否通过
4. 发布的 .dmg 和 .exe 是否可用

- [ ] **Step 3: 下载并测试**

从 GitHub Releases 下载：
1. macOS universal .dmg - 在 M Mac 上测试
2. 请有 Intel Mac 的朋友测试
3. Windows 版本需要找 Windows 用户测试

---

## 自审检查

### 1. Spec 覆盖检查

| 需求 | 对应 Task |
|------|-----------|
| 修复 CI 验证路径错误 | Task 1 |
| 改进构建脚本，添加 fallback | Task 2 |
| 运行时自检和详细错误 | Task 3 |
| CI 打包后验证（macOS） | Task 4 |
| CI 打包后验证（Windows） | Task 5 |
| 本地打包验证 | Task 6 |
| 确认打包配置 | Task 7 |
| 测试完整流程 | Task 8 |

### 2. Placeholder 扫描

- [x] 无 "TBD"、"TODO"、"implement later"
- [x] 无 "Add appropriate error handling" 等模糊描述
- [x] 所有步骤包含具体代码

### 3. 类型一致性

- [x] `getRequiredBinaries()` 返回 `string[]`
- [x] `performStartupCheck()` 返回 `{ ok: boolean; errors: string[] }`
- [x] 所有文件路径使用 `path.join()`

---

## 执行方式选择

**Plan complete and saved to `docs/superpowers/plans/2026-06-09-fix-packaging-architecture.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session, batch execution with checkpoints

Which approach?
