# 批量视频水印处理大师

面向短视频创作者的本地化批量视频水印处理桌面应用。当前版本实现 PRD 中的核心 MVP：3-5 个视频批量导入、模板视频 ROI 框选、统一策略处理、贴纸覆盖、OpenCV 智能去水印、队列进度回传与输出目录管理。

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
pip install opencv-python numpy pillow
```

## 开发运行

```bash
npm install
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

## 注意事项

智能去水印依赖逐帧图像修复，复杂背景下可能出现轻微涂抹感。贴纸覆盖速度更快，是当前建议优先使用的生产策略。
