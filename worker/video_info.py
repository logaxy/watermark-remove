from __future__ import annotations

import json
import subprocess
from typing import Any

from runtime import resolve_binary


def probe_video(path: str) -> dict[str, Any]:
    command = [
        resolve_binary("ffprobe"),
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration,side_data_list:stream_tags=rotate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path,
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    stream = (data.get("streams") or [{}])[0]
    duration = stream.get("duration") or (data.get("format") or {}).get("duration") or 0
    rotation = 0

    tags = stream.get("tags") or {}
    if tags.get("rotate"):
      rotation = int(tags["rotate"])

    for side_data in stream.get("side_data_list") or []:
        if "rotation" in side_data:
            rotation = int(side_data["rotation"])

    return {
        "duration": float(duration or 0),
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "rotation": rotation,
    }
