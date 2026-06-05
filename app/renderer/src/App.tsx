import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Play, Square, WandSparkles } from "lucide-react";
import { ProcessLog, type LogEntry } from "./components/ProcessLog";
import { VideoCanvas } from "./components/VideoCanvas";
import { VideoList } from "./components/VideoList";
import type { BatchRoiConfig, JobEvent, Roi, VideoItem } from "./types";
import { emptyBatchRoi } from "./types";
import { api } from "./lib/api";
import { prepareImportPaths } from "./lib/import-policy";
import { appendLog, createLog, jobEventToLogs } from "./lib/logs";
import {
  absoluteToNormalized,
  fileNameFromPath,
  resolveVideoRoi
} from "./lib/video";
import "./styles/app.css";

const stickerStyles = [
  { id: "classic", name: "经典黑白", preview: "黑底白字" },
  { id: "variety", name: "综艺爆款", preview: "黄字描边" },
  { id: "warning", name: "警示红", preview: "纯红文字" },
  { id: "business", name: "商务风", preview: "灰底深字" },
  { id: "ocean", name: "清爽蓝", preview: "蓝底白字" },
  { id: "mint", name: "薄荷绿", preview: "绿底黑字" },
  { id: "violet", name: "轻紫边框", preview: "紫框白底" },
  { id: "darkline", name: "暗色细框", preview: "深底边框" }
];

export default function App() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [batchRoi, setBatchRoi] = useState<BatchRoiConfig>(emptyBatchRoi);
  const [fineTuneMode, setFineTuneMode] = useState(false);
  const [strategy, setStrategy] = useState<"inpaint" | "sticker">("sticker");
  const [stickerText, setStickerText] = useState("关注我");
  const [styleId, setStyleId] = useState("classic");
  const [sourceFolder, setSourceFolder] = useState<string>();
  const [outputDir, setOutputDir] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("请选择视频文件夹开始");
  const [messageTone, setMessageTone] = useState<"normal" | "warn" | "error">("normal");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const videosRef = useRef(videos);
  const progressMarksRef = useRef<Record<string, number>>({});

  videosRef.current = videos;

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedId) || videos[0],
    [selectedId, videos]
  );

  const templateVideo = useMemo(
    () => videos.find((video) => video.id === batchRoi.templateVideoId) || videos[0],
    [batchRoi.templateVideoId, videos]
  );

  const isTemplateSelected = Boolean(
    selectedVideo && templateVideo && selectedVideo.id === templateVideo.id
  );

  const hasOverride = Boolean(selectedVideo && batchRoi.overrides[selectedVideo.id]);

  const resolvedRoi = useMemo(
    () => (selectedVideo ? resolveVideoRoi(selectedVideo, batchRoi) : null),
    [selectedVideo, batchRoi]
  );

  const overrideCount = Object.keys(batchRoi.overrides).length;

  const totalProgress = useMemo(() => {
    if (!videos.length) return 0;
    return Math.round(videos.reduce((sum, item) => sum + item.progress, 0) / videos.length);
  }, [videos]);

  const importVideos = useCallback(async (paths: string[], notice?: string) => {
    const { paths: selected, message: importMessage } = prepareImportPaths(paths);
    if (!selected.length) {
      setMessage(notice || importMessage);
      setLogs((current) => appendLog(current, "warn", notice || importMessage));
      return;
    }

    const batchId = Date.now();
    const nextVideos: VideoItem[] = selected.map((path, index) => ({
      id: `${batchId}-${index}`,
      path,
      name: fileNameFromPath(path),
      status: "waiting",
      progress: 0
    }));

    const templateId = nextVideos[0]?.id;

    setVideos(nextVideos);
    setSelectedId(templateId);
    setBatchRoi({ templateVideoId: templateId, default: null, overrides: {} });
    setFineTuneMode(false);
    setMessage("读取视频信息中");

    const probed = await Promise.all(
      nextVideos.map(async (video) => {
        try {
          const info = await api.probeVideo(video.path);
          return { ...video, ...info };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "读取失败";
          setLogs((current) => appendLog(current, "error", `${video.name} 读取失败：${errorMessage}`));
          return {
            ...video,
            status: "failed" as const,
            error: errorMessage
          };
        }
      })
    );

    setVideos(probed);
    setMessageTone("normal");
    setMessage(
      notice
        ? `${notice}，请在模板视频上框选一次，将自动应用到全部视频`
        : "请在模板视频上框选一次，将自动应用到全部视频"
    );
  }, []);

  useEffect(() => {
    return api.onJobEvent((event: JobEvent) => {
      const logResult = jobEventToLogs(event, videosRef.current, progressMarksRef.current);
      if (logResult) {
        progressMarksRef.current = logResult.progressMarks;
        setLogs((current) => [...current, ...logResult.logs].slice(-500));
      }

      if (event.type === "started") {
        setVideos((current) =>
          current.map((item) =>
            item.id === event.fileId ? { ...item, status: "processing", progress: 0 } : item
          )
        );
        setMessageTone("normal");
        setMessage("正在处理视频");
      }

      if (event.type === "progress") {
        setVideos((current) =>
          current.map((item) =>
            item.id === event.fileId ? { ...item, progress: event.percent } : item
          )
        );
      }

      if (event.type === "done") {
        setVideos((current) =>
          current.map((item) =>
            item.id === event.fileId
              ? { ...item, status: "completed", progress: 100, outputPath: event.outputPath }
              : item
          )
        );
      }

      if (event.type === "error") {
        setVideos((current) =>
          current.map((item) =>
            item.id === event.fileId
              ? { ...item, status: "failed", error: event.message }
              : item
          )
        );
        setMessageTone("error");
        setMessage(event.message);
      }

      if (event.type === "log" && event.level === "error") {
        setMessageTone("error");
        setMessage(event.message.trim() || "处理进程报错");
      }

      if (event.type === "worker-exit") {
        setIsRunning(false);
        setMessageTone(event.code === 0 ? "normal" : "warn");
        setMessage(event.code === 0 ? "批量处理完成" : "处理已结束，请查看下方日志排查问题");
      }
    });
  }, []);

  const canStart = videos.length > 0 && Boolean(batchRoi.default) && !isRunning;

  function handleSelectVideo(id: string) {
    setSelectedId(id);
    setFineTuneMode(false);
  }

  function handleRoiEdit(roi: Roi) {
    if (!selectedVideo?.width || !selectedVideo.height) return;

    const normalized = absoluteToNormalized(roi, selectedVideo.width, selectedVideo.height);

    if (isTemplateSelected) {
      setBatchRoi((current) => ({ ...current, default: normalized }));
      return;
    }

    if (fineTuneMode) {
      setBatchRoi((current) => ({
        ...current,
        overrides: { ...current.overrides, [selectedVideo.id]: normalized }
      }));
    }
  }

  function enableFineTune() {
    setFineTuneMode(true);
  }

  function resetSelectedToDefault() {
    if (!selectedVideo) return;
    setBatchRoi((current) => {
      const nextOverrides = { ...current.overrides };
      delete nextOverrides[selectedVideo.id];
      return { ...current, overrides: nextOverrides };
    });
    setFineTuneMode(false);
  }

  async function selectVideoFolder() {
    try {
      const result = await api.selectVideos();
      if (result.folderPath) {
        setSourceFolder(result.folderPath);
      }
      if (result.outputDir) {
        setOutputDir(result.outputDir);
      }
      setMessage(result.message);
      if (result.paths.length) {
        await importVideos(result.paths, result.message);
        if (result.outputDir) {
          setLogs((current) => appendLog(current, "info", `输出目录：${result.outputDir}`));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "选择视频文件夹失败，请重试";
      setMessageTone("error");
      setMessage(errorMessage);
      setLogs((current) => appendLog(current, "error", errorMessage));
    }
  }

  async function start() {
    if (!videos.length || !outputDir) {
      setMessageTone("warn");
      setMessage("请先选择视频文件夹");
      return;
    }
    if (!batchRoi.default) {
      setMessageTone("warn");
      setMessage("请先在模板视频上框选水印区域，再点击开始处理");
      return;
    }
    if (strategy === "sticker" && !stickerText.trim()) {
      setMessageTone("warn");
      setMessage("请输入贴纸文字");
      return;
    }

    const videosWithRoi = videos.map((video) => {
      const roi = resolveVideoRoi(video, batchRoi);
      return { video, roi };
    });

    const missing = videosWithRoi.find((item) => !item.roi);
    if (missing) {
      setMessageTone("warn");
      setMessage(`${missing.video.name} 无法解析水印区域，请确认视频信息已读取完成`);
      return;
    }

    setMessageTone("normal");
    setIsRunning(true);
    setMessage("正在启动处理…");
    progressMarksRef.current = {};
    setLogs((current) => [
      ...current,
      createLog(
        "info",
        `提交 ${videos.length} 个视频，策略：${strategy === "inpaint" ? "智能去水印" : "贴纸覆盖"}；统一区域应用于 ${videos.length - overrideCount} 个，${overrideCount} 个已微调`
      )
    ]);
    setVideos((current) =>
      current.map((item) => ({
        ...item,
        status: item.status === "failed" ? item.status : "waiting",
        progress: 0,
        error: undefined
      }))
    );

    try {
      await api.startJob({
        videos: videosWithRoi.map(({ video, roi }) => ({
          id: video.id,
          path: video.path,
          roi: roi!
        })),
        outputDir,
        strategy:
          strategy === "inpaint"
            ? { kind: "inpaint" }
            : { kind: "sticker", text: stickerText.trim(), styleId }
      });
      setMessage("处理已开始，可在列表中查看进度");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "启动处理失败";
      setIsRunning(false);
      setMessageTone("error");
      setMessage(errorMessage);
      setLogs((current) => appendLog(current, "error", errorMessage));
    }
  }

  async function stop() {
    await api.cancelJob();
    setIsRunning(false);
    setMessage("已取消处理");
    setLogs((current) => appendLog(current, "warn", "用户已取消处理"));
  }

  const roiReadout = (() => {
    if (!batchRoi.default) {
      return "暂停到含水印画面后，在模板视频上拖拽框选一次";
    }
    if (hasOverride && !isTemplateSelected) {
      return "当前视频已微调，其余视频仍使用统一区域";
    }
    if (isTemplateSelected) {
      return `批次统一区域（将应用于 ${videos.length} 个视频${overrideCount ? `，其中 ${overrideCount} 个已微调` : ""}）`;
    }
    return "切换预览核对位置，如需偏差可点击「微调此视频」";
  })();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>批量视频水印处理大师</h1>
          <p className={messageTone === "normal" ? "" : `message-${messageTone}`}>{message}</p>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={selectVideoFolder}>
            <FolderOpen size={18} />
            选择视频文件夹
          </button>
          {isRunning ? (
            <button className="danger-button" type="button" onClick={stop}>
              <Square size={18} />
              停止
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={start}
              disabled={!canStart}
              title={!batchRoi.default && videos.length ? "请先在模板视频上框选水印区域" : undefined}
            >
              <Play size={18} />
              开始处理
            </button>
          )}
        </div>
      </header>

      <section className="workspace">
        <aside className="panel side-panel">
          <div className="panel-title">视频列表</div>
          <VideoList
            videos={videos}
            selectedId={selectedVideo?.id}
            templateVideoId={batchRoi.templateVideoId}
            overrideIds={Object.keys(batchRoi.overrides)}
            onSelect={handleSelectVideo}
          />
          <div className="drop-hint">
            {sourceFolder ? `当前文件夹：${sourceFolder}` : "选择文件夹后自动扫描其中 1-10 个视频"}
          </div>
        </aside>

        <section className="panel preview-panel">
          <div className="preview-panel-header">
            <div className="panel-title">模板预览与批量区域</div>
            {!isTemplateSelected && selectedVideo && batchRoi.default && (
              <div className="preview-roi-actions">
                {!fineTuneMode && (
                  <button className="ghost-button preview-roi-button" type="button" onClick={enableFineTune}>
                    {hasOverride ? "重新微调" : "微调此视频"}
                  </button>
                )}
                {fineTuneMode && (
                  <span className="preview-roi-hint">拖拽框选以微调当前视频</span>
                )}
                {hasOverride && !fineTuneMode && (
                  <button
                    className="ghost-button preview-roi-button"
                    type="button"
                    onClick={resetSelectedToDefault}
                  >
                    恢复统一
                  </button>
                )}
                {hasOverride && fineTuneMode && (
                  <button
                    className="ghost-button preview-roi-button"
                    type="button"
                    onClick={resetSelectedToDefault}
                  >
                    恢复统一
                  </button>
                )}
              </div>
            )}
          </div>
          <VideoCanvas
            src={selectedVideo?.path}
            naturalWidth={selectedVideo?.width}
            naturalHeight={selectedVideo?.height}
            resolvedRoi={resolvedRoi}
            editable={Boolean(
              selectedVideo?.width &&
                selectedVideo.height &&
                (isTemplateSelected || fineTuneMode)
            )}
            roiVariant={hasOverride && !isTemplateSelected ? "override" : "default"}
            onRoiEdit={handleRoiEdit}
            onNaturalSize={(width, height) => {
              if (!selectedVideo?.id) return;
              setVideos((current) =>
                current.map((item) =>
                  item.id === selectedVideo.id ? { ...item, width, height } : item
                )
              );
            }}
          />
          <div className="roi-readout">
            {resolvedRoi
              ? `${roiReadout} · ROI X ${resolvedRoi.x}, Y ${resolvedRoi.y}, W ${resolvedRoi.width}, H ${resolvedRoi.height}`
              : roiReadout}
          </div>
        </section>

        <aside className="panel config-panel">
          <div className="panel-title">处理策略</div>
          <div className="segmented">
            <button
              className={strategy === "sticker" ? "selected" : ""}
              type="button"
              onClick={() => setStrategy("sticker")}
            >
              贴纸覆盖
            </button>
            <button
              className={strategy === "inpaint" ? "selected" : ""}
              type="button"
              onClick={() => setStrategy("inpaint")}
            >
              智能去水印
            </button>
          </div>

          {strategy === "sticker" ? (
            <>
              <label className="field-label">
                贴纸文字
                <input
                  maxLength={20}
                  value={stickerText}
                  onChange={(event) => setStickerText(event.target.value)}
                />
              </label>
              <div className="style-grid">
                {stickerStyles.map((style) => (
                  <button
                    key={style.id}
                    className={`style-card ${styleId === style.id ? "selected" : ""}`}
                    type="button"
                    onClick={() => setStyleId(style.id)}
                  >
                    <span>{style.preview}</span>
                    <strong>{style.name}</strong>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="inpaint-note">
              <WandSparkles size={24} />
              <strong>正在深度修复时会逐帧处理</strong>
              <span>复杂背景可能产生轻微涂抹感，建议优先用于固定、低纹理水印。</span>
            </div>
          )}

          <div className="total-progress">
            <div>
              <span>总体进度</span>
              <strong>{totalProgress}%</strong>
            </div>
            <i>
              <b style={{ width: `${totalProgress}%` }} />
            </i>
          </div>
          <div className="output-path">
            {outputDir ? `输出到：${outputDir}` : "输出到所选文件夹下的 output 子目录"}
          </div>
        </aside>
      </section>

      <ProcessLog logs={logs} onClear={() => setLogs([])} />
    </main>
  );
}
