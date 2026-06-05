import type { JobEvent } from "../types";
import type { LogEntry, LogLevel } from "../components/ProcessLog";

let logSeq = 0;

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

export function createLog(level: LogLevel, message: string): LogEntry {
  logSeq += 1;
  return {
    id: `${Date.now()}-${logSeq}`,
    time: nowLabel(),
    level,
    message
  };
}

export function appendLog(
  logs: LogEntry[],
  level: LogLevel,
  message: string,
  maxEntries = 500
): LogEntry[] {
  const trimmed = message.trim();
  if (!trimmed) return logs;
  const next = [...logs, createLog(level, trimmed)];
  return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
}

export function jobEventToLogs(
  event: JobEvent,
  videos: Array<{ id: string; name: string }>,
  progressMarks: Record<string, number>
): { logs: LogEntry[]; progressMarks: Record<string, number> } | null {
  const nameOf = (fileId: string) => videos.find((v) => v.id === fileId)?.name || fileId;

  if (event.type === "started") {
    return {
      logs: [createLog("info", `开始处理：${nameOf(event.fileId)}`)],
      progressMarks: { ...progressMarks, [event.fileId]: 0 }
    };
  }

  if (event.type === "progress") {
    const last = progressMarks[event.fileId] ?? -1;
    const milestones = [0, 25, 50, 75, 100];
    const hit = milestones.find((m) => event.percent >= m && last < m);
    if (!hit) return null;
    return {
      logs: [createLog("info", `${nameOf(event.fileId)} 进度 ${event.percent}%`)],
      progressMarks: { ...progressMarks, [event.fileId]: hit }
    };
  }

  if (event.type === "done") {
    return {
      logs: [createLog("success", `处理完成：${nameOf(event.fileId)} → ${event.outputPath}`)],
      progressMarks
    };
  }

  if (event.type === "error") {
    return {
      logs: [createLog("error", `${nameOf(event.fileId)} 失败：${event.message}`)],
      progressMarks
    };
  }

  if (event.type === "log") {
    const level: LogLevel = event.level === "error" ? "error" : "info";
    return {
      logs: [createLog(level, event.message)],
      progressMarks
    };
  }

  if (event.type === "worker-exit") {
    const level: LogLevel = event.code === 0 ? "success" : "warn";
    const message =
      event.code === 0
        ? "全部任务处理结束"
        : `处理进程退出，代码 ${event.code ?? "unknown"}，请检查上方失败项与错误日志`;
    return {
      logs: [createLog(level, message)],
      progressMarks
    };
  }

  return null;
}
