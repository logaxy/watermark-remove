# CLAUDE.md

## 项目说明

批量视频水印处理大师 - 基于 Electron + Python 的跨平台桌面应用。

## 发布流程（GitHub Actions）

### 自动打包触发方式

GitHub Actions 工作流会在推送 tag 时自动触发打包：

```bash
# 1. 提交代码
git add .
git commit -m "fix: 修复 xxx 问题"

# 2. 打标签（触发 GitHub Actions 打包）
git tag -a v0.1.2 -m "Release v0.1.2"

# 3. 推送标签
git push origin v0.1.2
```

### 版本号规范

- 使用语义化版本号：`v主版本.次版本.修订号`
- 示例：`v0.1.0`, `v0.1.1`, `v1.0.0`

### GitHub Actions 工作流

打包配置位于 `.github/workflows/build.yml`，支持：
- **macOS**: 构建 Universal 应用（同时支持 Intel 和 Apple Silicon）
- **Windows**: 构建 x64 应用

### 发布产物

打包完成后，产物将自动上传到 GitHub Releases：
- `批量视频水印处理大师-x.x.x-mac-universal.dmg`
- `批量视频水印处理大师-x.x.x-win-x64.exe`
- `批量视频水印处理大师-x.x.x-portable.exe`

## 本地开发

```bash
# 安装依赖
npm install
npm run setup:python

# 开发模式
npm run dev

# 构建 Worker
npm run build:worker

# 获取 FFmpeg
npm run fetch:ffmpeg

# 本地打包（仅当前平台）
npm run pack:mac
```

## 多平台架构兼容性

### macOS

应用支持 Universal 架构，自动识别当前 Mac 的处理器类型：

| 架构 | Worker 文件 | FFmpeg 文件 |
|------|------------|-------------|
| Apple Silicon (M1/M2/M3) | `watermark-worker-arm64` | `ffmpeg-arm64`, `ffprobe-arm64` |
| Intel (x64) | `watermark-worker-x64` | `ffmpeg-x64`, `ffprobe-x64` |

资源目录：`resources/bin/darwin/`

### Windows

- Worker: `watermark-worker.exe`
- FFmpeg: `ffmpeg.exe`, `ffprobe.exe`
- 资源目录：`resources/bin/win32/`

**注意**：Windows 二进制文件需要在 Windows 环境或 CI 中构建。

## 注意事项

1. 每次修改版本号后，记得同步更新 `package.json` 中的 `version` 字段
2. 推送 tag 前确保代码已提交到主分支
3. GitHub Actions 打包可能需要 10-20 分钟完成
