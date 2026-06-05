# 技术方案

## 目标

实现一个支持 Windows/macOS 的本地桌面应用，用于批量处理 3-5 个短视频的固定区域水印。用户在模板视频上框选 ROI 后，同一批视频只能统一选择一种处理策略：智能去水印或文字贴纸覆盖。

## 架构

```text
Electron Desktop App
├─ Renderer: React + Canvas
│  ├─ 视频导入与列表
│  ├─ 视频预览
│  ├─ ROI 框选与坐标换算
│  ├─ 策略配置
│  └─ 进度展示
│
├─ Main Process
│  ├─ 文件选择
│  ├─ 输出目录管理
│  ├─ Python Worker 进程管理
│  └─ IPC 事件转发
│
└─ Python Worker
   ├─ ffprobe 视频元信息
   ├─ FFmpeg 贴纸覆盖
   ├─ OpenCV Inpainting
   ├─ 队列处理
   └─ JSON Line 进度回传
```

## 技术选型

| 模块 | 选型 | 原因 |
| :-- | :-- | :-- |
| 桌面壳 | Electron | Windows/macOS 双端交付成熟 |
| 前端 | React + TypeScript | 状态和交互复杂度适中，类型约束明确 |
| ROI | HTML5 video + Canvas overlay | 可直接完成暂停、预览、框选 |
| 进程通信 | Electron IPC + Python stdout JSON Line | 简单、稳定、便于实时进度回传 |
| 贴纸覆盖 | FFmpeg `drawbox/drawtext` | 性能高，避免逐帧 Python 处理 |
| 智能去水印 | OpenCV `cv2.inpaint` | 本地化、依赖清晰、实现成本低 |
| 打包 | electron-builder + PyInstaller | 后续可将 Python worker 固化为平台可执行文件 |

## ROI 坐标映射

前端预览视频使用 `object-fit: contain`，真实显示区域可能存在左右或上下黑边。实现中通过容器尺寸、视频原始尺寸计算实际 media box，再将显示坐标映射到原视频像素坐标。

核心公式：

```text
scale = min(containerWidth / naturalWidth, containerHeight / naturalHeight)
displayWidth = naturalWidth * scale
displayHeight = naturalHeight * scale
offsetX = (containerWidth - displayWidth) / 2
offsetY = (containerHeight - displayHeight) / 2

realX = (roiX - offsetX) / displayWidth * naturalWidth
realY = (roiY - offsetY) / displayHeight * naturalHeight
realW = roiW / displayWidth * naturalWidth
realH = roiH / displayHeight * naturalHeight
```

映射后的 ROI 会被 clamp 到原视频尺寸内，避免 FFmpeg/OpenCV 越界。

## 批量队列

当前采用单并发顺序处理，原因是视频转码和 OpenCV 修复会占用 CPU、磁盘和内存。单并发能保证 UI 可响应，也能避免普通办公电脑过载。

Worker 事件格式：

```json
{"type":"started","fileId":"video-id"}
{"type":"progress","fileId":"video-id","percent":42}
{"type":"done","fileId":"video-id","outputPath":"/path/output.mp4"}
{"type":"error","fileId":"video-id","message":"ffmpeg failed"}
```

## 贴纸覆盖策略

贴纸覆盖使用 FFmpeg filter graph：

- 背景：`drawbox`
- 边框：`drawbox=t=3`
- 文字：`drawtext`
- 阴影：`drawtext shadowcolor/shadowx/shadowy`

该策略避免解码到 Python 逐帧处理，速度接近 FFmpeg 转码速度。

## 智能去水印策略

OpenCV 路径流程：

1. `cv2.VideoCapture` 读取输入视频。
2. 按 ROI 创建单通道 mask。
3. 每帧执行 `cv2.inpaint(frame, mask, 3, cv2.INPAINT_TELEA)`。
4. 先输出无音频临时视频。
5. 再用 FFmpeg 合成原视频音频。
6. 删除临时目录。

## 打包策略

开发阶段直接使用系统 `python3` 调用 `worker/main.py`。生产阶段建议：

1. 使用 PyInstaller 分别构建 macOS/Windows worker 可执行文件。
2. 将 FFmpeg/FFprobe 可执行文件随应用分发，或在安装流程中检测。
3. Electron 主进程根据平台选择内置 worker 路径。
4. 使用 electron-builder 生成 `.dmg`、`.exe` 安装包。

## 风险

- OpenCV 去水印效果取决于背景复杂度，不能保证完全无痕。
- FFmpeg `drawtext` 的中文字体需要后续内置字体并指定 `fontfile`。
- 竖屏视频或带旋转元数据的视频需要继续强化坐标和转码验证。
- 当前 MVP 未实现文件夹递归导入，可后续在主进程中展开目录。
