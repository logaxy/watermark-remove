import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

export type LogLevel = "info" | "warn" | "error" | "success";

export type LogEntry = {
  id: string;
  time: string;
  level: LogLevel;
  message: string;
};

type Props = {
  logs: LogEntry[];
  onClear: () => void;
};

const levelLabel: Record<LogLevel, string> = {
  info: "信息",
  warn: "警告",
  error: "错误",
  success: "完成"
};

export function ProcessLog({ logs, onClear }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
  }, [logs]);

  return (
    <section className="panel log-panel">
      <div className="log-panel-header">
        <div className="panel-title">处理日志</div>
        <button className="ghost-button log-clear-button" type="button" onClick={onClear}>
          <Trash2 size={16} />
          清空
        </button>
      </div>
      <div className="log-panel-body" ref={bodyRef}>
        {logs.length ? (
          logs.map((entry) => (
            <div className={`log-line log-${entry.level}`} key={entry.id}>
              <time>{entry.time}</time>
              <span className="log-level">{levelLabel[entry.level]}</span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        ) : (
          <div className="log-empty">处理过程中的状态与错误信息会显示在这里</div>
        )}
      </div>
    </section>
  );
}
