# 批量视频水印处理大师

[![Build Desktop Apps](https://github.com/logaxy/watermark-remove/actions/workflows/build.yml/badge.svg)](https://github.com/logaxy/watermark-remove/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/logaxy/watermark-remove?include_prereleases)](https://github.com/logaxy/watermark-remove/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

面向短视频创作者的本地化批量视频水印处理桌面应用。当前版本实现 PRD 中的核心 MVP：3-5 个视频批量导入、模板视频 ROI 框选、统一策略处理、贴纸覆盖、OpenCV 智能去水印、队列进度回传与输出目录管理。

## 📥 下载安装包

> 无需安装 Node.js、Python 或 FFmpeg，开箱即用

### 最新版本 (v0.1.0)

| 平台 | 安装包 | 说明 |
|------|--------|------|
| **macOS** | [📦 DMG (Universal)](https://github.com/logaxy/watermark-remove/releases/latest/download/BatchWatermarkMaster-0.1.0-mac-universal.dmg) | 支持 Intel 和 Apple Silicon |
| **Windows** | [📦 安装程序](https://github.com/logaxy/watermark-remove/releases/latest/download/BatchWatermarkMaster-0.1.0-win-x64.exe) | 标准安装版 |
| **Windows** | [📦 便携版](https://github.com/logaxy/watermark-remove/releases/latest/download/BatchWatermarkMaster-0.1.0-portable.exe) | 免安装，直接运行 |

### 历史版本

👉 [查看所有 Releases](https://github.com/logaxy/watermark-remove/releases)

---

## 功能

- 支持选择或拖拽导入 3-5 个视频。
- 展示视频名称、时长、分辨率和处理状态。
- 使用第一个或选中视频作为模板视频进行 Canvas ROI 框选。
- 将界面框选区域映射为原视频真实像素坐标。
- 支持两种同批次单一策略：
  - 贴纸覆盖：8 种预设样式，支持 20 字以内文字。
  - 智能去水印：OpenCV `cv2.inpaint` 逐帧修复。
- 后台逐个处理视频，前端展示总体和单视频进度。
- 默认输出到首个视频同级 `_output` 目录。
- 单视频处理完成后清理 OpenCV 临时目录。

## 环境要求

- Node.js 20+
- Python 3.10+
- FFmpeg / FFprobe 可在命令行访问
- Python 包：

```bash
npm run setup:python
```

或手动安装：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r worker/requirements.txt
```

## 开发运行

```bash
npm install
npm run setup:python
npm run dev
```

如果 Electron 二进制下载超时，可以先执行下面命令完成类型检查和前端构建依赖安装：

```bash
npm install --ignore-scripts
```

但桌面端启动仍需要 Electron 下载脚本成功执行。网络恢复后重新运行 `npm install` 即可补齐 Electron 可执行文件。

## Python Worker 检查

```bash
npm run worker:check
```

## 项目结构

```text
app/
├─ main/       Electron 主进程
├─ preload/    安全 IPC 暴露
└─ renderer/   React 前端

worker/
├─ main.py       Worker 入口
├─ video_info.py ffprobe 元信息读取
├─ sticker.py    贴纸样式与 FFmpeg filter
└─ processors.py 批量队列和处理器

docs/
├─ technical-plan.md
└─ implementation-notes.md
```

## 打包发布（开箱即用）

应用内置 Python Worker、FFmpeg/FFprobe 与中文字体，用户无需安装 Node、Python 或 FFmpeg。

### macOS（Intel + Apple Silicon 通用）

```bash
npm run pack:mac
```

产物：`release/批量视频水印处理大师-<version>-mac-universal.dmg`

### Windows（安装包 + 便携版 exe）

在 Windows 机器上执行：

```powershell
npm run pack:win
```

产物：

- `release/批量视频水印处理大师-<version>-win-x64.exe`（安装程序）
- `release/批量视频水印处理大师-<version>-portable.exe`（免安装便携版）

也可通过 GitHub Actions（`.github/workflows/build.yml`）在 tag 推送时自动构建双平台安装包。

## 注意事项

智能去水印依赖逐帧图像修复，复杂背景下可能出现轻微涂抹感。贴纸覆盖速度更快，是当前建议优先使用的生产策略。
