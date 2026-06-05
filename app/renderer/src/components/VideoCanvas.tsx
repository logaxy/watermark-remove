import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Roi } from "../types";
import {
  formatDuration,
  mapDisplayRoiToNatural,
  mapNaturalRoiToDisplay,
  objectFitContainBox,
  toMediaUrl
} from "../lib/video";

type Props = {
  src?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  resolvedRoi?: Roi | null;
  editable: boolean;
  roiVariant?: "default" | "override";
  onRoiEdit: (roi: Roi) => void;
  onNaturalSize?: (width: number, height: number) => void;
};

type Point = { x: number; y: number };

export function VideoCanvas({
  src,
  naturalWidth,
  naturalHeight,
  resolvedRoi,
  editable,
  roiVariant = "default",
  onRoiEdit,
  onNaturalSize
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [draftDisplayRoi, setDraftDisplayRoi] = useState<Roi | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const effectiveWidth = naturalWidth || mediaSize?.width;
  const effectiveHeight = naturalHeight || mediaSize?.height;

  useEffect(() => {
    setLoadError(null);
    setMediaSize(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsSeeking(false);
    setDraftDisplayRoi(null);
  }, [src]);

  useEffect(() => {
    if (dragStart) return;
    const wrap = wrapRef.current;
    if (!wrap || !resolvedRoi || !effectiveWidth || !effectiveHeight) {
      setDraftDisplayRoi(null);
      return;
    }
    setDraftDisplayRoi(
      mapNaturalRoiToDisplay(
        resolvedRoi,
        wrap.clientWidth,
        wrap.clientHeight,
        effectiveWidth,
        effectiveHeight
      )
    );
  }, [resolvedRoi, effectiveWidth, effectiveHeight, dragStart, src]);

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function commitRoi(nextDisplayRoi: Roi | null) {
    setDraftDisplayRoi(nextDisplayRoi);

    const wrap = wrapRef.current;
    if (!nextDisplayRoi || !wrap || !effectiveWidth || !effectiveHeight) {
      return;
    }

    const box = objectFitContainBox(
      wrap.clientWidth,
      wrap.clientHeight,
      effectiveWidth,
      effectiveHeight
    );
    const wrapRect = wrap.getBoundingClientRect();
    const mediaBox = new DOMRect(
      wrapRect.left + box.left,
      wrapRect.top + box.top,
      box.width,
      box.height
    );
    const mapped = mapDisplayRoiToNatural(
      nextDisplayRoi,
      mediaBox,
      wrapRect,
      effectiveWidth,
      effectiveHeight
    );

    onRoiEdit(mapped);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  function seekTo(value: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(value)) return;
    video.currentTime = value;
    setCurrentTime(value);
  }

  const displayRoi = draftDisplayRoi;

  return (
    <div className="preview-stage">
      <div
        className={`preview-frame ${editable ? "preview-frame-editable" : "preview-frame-readonly"}`}
        ref={wrapRef}
        onPointerDown={(event) => {
          if (!src || !editable) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = pointFromEvent(event);
          setDragStart(point);
          commitRoi({ x: point.x, y: point.y, width: 1, height: 1 });
        }}
        onPointerMove={(event) => {
          if (!dragStart || !editable) return;
          const point = pointFromEvent(event);
          commitRoi({
            x: Math.min(dragStart.x, point.x),
            y: Math.min(dragStart.y, point.y),
            width: Math.abs(point.x - dragStart.x),
            height: Math.abs(point.y - dragStart.y)
          });
        }}
        onPointerUp={() => {
          setDragStart(null);
        }}
      >
        {src ? (
          <video
            ref={videoRef}
            className="preview-video"
            src={toMediaUrl(src)}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (!video.videoWidth || !video.videoHeight) return;
              setMediaSize({ width: video.videoWidth, height: video.videoHeight });
              setDuration(video.duration);
              onNaturalSize?.(video.videoWidth, video.videoHeight);
            }}
            onTimeUpdate={(event) => {
              if (isSeeking) return;
              setCurrentTime(event.currentTarget.currentTime);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={() => setLoadError("视频预览加载失败，请确认文件可正常播放")}
          />
        ) : (
          <div className="empty-preview">导入视频后，在这里框选水印区域</div>
        )}
        {loadError && <div className="preview-error">{loadError}</div>}
        {displayRoi && (
          <div
            className={`roi-box ${roiVariant === "override" ? "roi-box-override" : ""}`}
            style={{
              left: displayRoi.x,
              top: displayRoi.y,
              width: displayRoi.width,
              height: displayRoi.height
            }}
          />
        )}
      </div>

      {src && (
        <div className="preview-controls">
          <button
            className="preview-play-button"
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <input
            className="preview-progress"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onPointerDown={() => setIsSeeking(true)}
            onPointerUp={() => setIsSeeking(false)}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
          <span className="preview-time">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
