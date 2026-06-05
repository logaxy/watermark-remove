from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

from sticker import render_sticker_png
from video_info import probe_video


Progress = Callable[[int], None]

QUICKTIME_VIDEO_ARGS = [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "main",
    "-tag:v",
    "avc1",
]

QUICKTIME_AUDIO_ARGS = ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]

QUICKTIME_MUX_ARGS = ["-movflags", "+faststart"]


def run_ffmpeg_with_progress(command: list[str], duration: float, on_progress: Progress) -> None:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None
    for line in process.stdout:
        line = line.strip()
        if not line.startswith("out_time_ms="):
            continue
        try:
            out_time_ms = int(line.split("=", 1)[1])
            percent = min(99, int((out_time_ms / 1_000_000) / max(duration, 0.1) * 100))
            on_progress(percent)
        except ValueError:
            continue

    _, stderr = process.communicate()
    if process.returncode != 0:
        raise RuntimeError(format_ffmpeg_error(stderr) or "ffmpeg processing failed")
    on_progress(100)


def format_ffmpeg_error(stderr: str) -> str:
    if not stderr:
        return ""
    lines = [line.strip() for line in stderr.splitlines() if line.strip()]
    preferred = [
        line
        for line in lines
        if any(
            marker in line
            for marker in (
                "Error",
                "error",
                "Invalid",
                "No such filter",
                "Filter not found",
                "failed",
                "not found",
            )
        )
    ]
    if preferred:
        return preferred[-1]
    return lines[-1] if lines else stderr.strip()


def process_sticker(
    input_path: str,
    output_path: str,
    roi: dict,
    strategy: dict,
    temp_root: str,
    on_progress: Progress,
) -> None:
    info = probe_video(input_path)
    tmp_dir = tempfile.mkdtemp(prefix="watermark_sticker_", dir=temp_root if temp_root else None)
    sticker_path = os.path.join(tmp_dir, "sticker.png")

    try:
        render_sticker_png(
            sticker_path,
            roi,
            strategy.get("text", ""),
            strategy.get("styleId", "classic"),
        )
        overlay_x = int(roi["x"])
        overlay_y = int(roi["y"])
        command = [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-i",
            sticker_path,
            "-filter_complex",
            f"[0:v][1:v]overlay={overlay_x}:{overlay_y}:format=auto,format=yuv420p",
            *QUICKTIME_VIDEO_ARGS,
            *QUICKTIME_AUDIO_ARGS,
            *QUICKTIME_MUX_ARGS,
            "-progress",
            "pipe:1",
            "-nostats",
            output_path,
        ]
        run_ffmpeg_with_progress(command, info["duration"], on_progress)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def process_inpaint(input_path: str, output_path: str, roi: dict, temp_root: str, on_progress: Progress) -> None:
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("OpenCV/Numpy 未安装，请安装 opencv-python 与 numpy") from exc

    info = probe_video(input_path)
    tmp_dir = tempfile.mkdtemp(prefix="watermark_inpaint_", dir=temp_root if temp_root else None)
    silent_video = os.path.join(tmp_dir, "video_no_audio.mp4")

    try:
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise RuntimeError("无法打开视频")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or max(1, info["duration"] * fps))
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(silent_video, fourcc, fps, (info["width"], info["height"]))

        mask = np.zeros((info["height"], info["width"]), dtype=np.uint8)
        x = int(roi["x"])
        y = int(roi["y"])
        w = int(roi["width"])
        h = int(roi["height"])
        mask[y : y + h, x : x + w] = 255

        frame_index = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            repaired = cv2.inpaint(frame, mask, 3, cv2.INPAINT_TELEA)
            writer.write(repaired)
            frame_index += 1
            if frame_index % 5 == 0:
                on_progress(min(96, int(frame_index / max(total_frames, 1) * 96)))

        cap.release()
        writer.release()

        mux_command = [
            "ffmpeg",
            "-y",
            "-i",
            silent_video,
            "-i",
            input_path,
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            *QUICKTIME_VIDEO_ARGS,
            *QUICKTIME_AUDIO_ARGS,
            *QUICKTIME_MUX_ARGS,
            "-shortest",
            output_path,
        ]
        subprocess.run(mux_command, capture_output=True, text=True, check=True)
        on_progress(100)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def process_queue(payload: dict, emit: Callable[[dict], None]) -> None:
    output_dir = Path(payload["outputDir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    strategy = payload["strategy"]

    for video in payload["videos"]:
        file_id = video["id"]
        input_path = video["path"]
        roi = video["roi"]
        output_path = output_dir / output_name(input_path, strategy["kind"])
        emit({"type": "started", "fileId": file_id})

        def progress(percent: int) -> None:
            emit({"type": "progress", "fileId": file_id, "percent": percent})

        try:
            if strategy["kind"] == "sticker":
                process_sticker(
                    input_path,
                    str(output_path),
                    roi,
                    strategy,
                    payload.get("tempRoot", ""),
                    progress,
                )
            elif strategy["kind"] == "inpaint":
                process_inpaint(input_path, str(output_path), roi, payload.get("tempRoot", ""), progress)
            else:
                raise RuntimeError(f"未知处理策略: {strategy['kind']}")

            emit({"type": "done", "fileId": file_id, "outputPath": str(output_path)})
        except Exception as exc:
            emit({"type": "error", "fileId": file_id, "message": str(exc)})


OUTPUT_SUFFIX = {
    "sticker": "贴纸",
    "inpaint": "去水印",
}


def output_name(input_path: str, kind: str) -> str:
    source = Path(input_path)
    label = OUTPUT_SUFFIX.get(kind, kind)
    return f"{source.stem}_{label}{source.suffix or '.mp4'}"


def dumps(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)
