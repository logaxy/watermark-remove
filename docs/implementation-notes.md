# 实现说明

## 已实现范围

- Electron 主进程：
  - 视频文件选择
  - 输出目录选择
  - Python worker 启动与停止
  - stdout JSON 事件转发
- React 前端：
  - 3-5 个视频导入限制
  - 拖拽导入
  - 视频列表与状态展示
  - 模板视频预览
  - ROI 鼠标框选
  - 贴纸/去水印二选一策略
  - 总体进度和单视频进度
- Python worker：
  - `ffprobe` 获取视频时长、分辨率、旋转信息
  - FFmpeg 贴纸覆盖
  - OpenCV inpaint 去水印
  - 队列顺序处理
  - 单视频临时文件清理

## 关键文件

| 文件 | 说明 |
| :-- | :-- |
| `app/main/main.ts` | Electron 主进程与 worker 管理 |
| `app/preload/preload.ts` | Renderer 安全 IPC API |
| `app/renderer/src/App.tsx` | 应用主界面和任务状态 |
| `app/renderer/src/components/VideoCanvas.tsx` | 视频预览与 ROI 框选 |
| `app/renderer/src/lib/video.ts` | 文件名、时长、ROI 映射工具 |
| `worker/main.py` | Python worker 入口 |
| `worker/processors.py` | 贴纸/去水印处理流程 |
| `worker/sticker.py` | 8 种贴纸样式 |
| `worker/video_info.py` | 视频元信息读取 |

## 后续增强建议

1. 内置中文字体文件，并在 FFmpeg `drawtext` 中指定 `fontfile`。
2. 支持文件夹拖拽后的递归视频筛选。
3. 增加任务失败重试和输出文件重名策略。
4. 增加 ROI 可拖拽调整大小，而不是只能重新框选。
5. 为竖屏视频和旋转元数据增加专门测试样例。
6. 使用 PyInstaller 将 Python worker 打包为独立可执行文件。
7. 增加端到端测试：导入样例视频、框选 ROI、验证输出文件存在。
