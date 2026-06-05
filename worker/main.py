from __future__ import annotations

import json
import sys

from processors import dumps, process_queue
from video_info import probe_video


def read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw:
        raise RuntimeError("missing stdin payload")
    return json.loads(raw)


def emit(payload: dict) -> None:
    print(dumps(payload), flush=True)


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "process"
    payload = read_payload()

    if mode == "probe":
        print(json.dumps(probe_video(payload["path"]), ensure_ascii=False), flush=True)
        return 0

    if mode == "process":
        process_queue(payload, emit)
        return 0

    raise RuntimeError(f"unknown mode: {mode}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr, flush=True)
        raise SystemExit(1)
