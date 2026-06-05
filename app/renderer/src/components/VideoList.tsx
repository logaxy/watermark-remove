import type { VideoItem } from "../types";
import { formatDuration } from "../lib/video";

type Props = {
  videos: VideoItem[];
  selectedId?: string;
  templateVideoId?: string;
  overrideIds: string[];
  onSelect: (id: string) => void;
};

const statusLabel: Record<VideoItem["status"], string> = {
  waiting: "等待中",
  processing: "处理中",
  completed: "已完成",
  failed: "失败"
};

export function VideoList({
  videos,
  selectedId,
  templateVideoId,
  overrideIds,
  onSelect
}: Props) {
  const overrideSet = new Set(overrideIds);

  if (!videos.length) {
    return (
      <div className="video-list-empty">
        <strong>暂无视频</strong>
        <span>点击「选择视频文件夹」扫描目录内视频</span>
        <span className="video-list-empty-hint">支持 1-10 个视频，仅扫描当前目录（不含子文件夹）</span>
      </div>
    );
  }

  return (
    <div className="video-list">
      {videos.map((video, index) => {
        const isTemplate = video.id === templateVideoId;
        const isOverride = overrideSet.has(video.id);

        return (
          <button
            className={`video-row ${video.id === selectedId ? "active" : ""}`}
            key={video.id}
            onClick={() => onSelect(video.id)}
            type="button"
          >
            <div className="video-row-index">{index + 1}</div>
            <div className="video-row-main">
              <strong title={video.path}>{video.name}</strong>
              <span className="video-row-meta">
                <span className="video-row-meta-text">
                  {video.width && video.height ? `${video.width}x${video.height}` : "读取中"} ·{" "}
                  {formatDuration(video.duration)}
                </span>
                {isTemplate && <span className="roi-badge roi-badge-template">模板</span>}
                {!isTemplate && isOverride && (
                  <span className="roi-badge roi-badge-override">已微调</span>
                )}
                {!isTemplate && !isOverride && templateVideoId && (
                  <span className="roi-badge roi-badge-unified">统一</span>
                )}
              </span>
              <div className="mini-progress">
                <i style={{ width: `${video.progress}%` }} />
              </div>
            </div>
            <span className={`status-pill ${video.status}`}>{statusLabel[video.status]}</span>
          </button>
        );
      })}
    </div>
  );
}
