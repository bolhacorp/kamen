"use client";

import React, { useMemo, useState } from "react";
import { usePipelineLog } from "../pipeline-log/usePipelineLog";
import type {
  PipelineLogSource,
  PipelineLogLevel,
} from "../pipeline-log/types";

const SOURCE_COLORS: Record<PipelineLogSource, string> = {
  openai: "rgb(16 185 129)", // green
  liveavatar: "rgb(59 130 246)", // blue
  orchestrator: "rgb(168 85 247)", // purple
};

const LEVEL_COLORS: Record<PipelineLogLevel, string> = {
  debug: "rgb(156 163 175)",
  info: "rgb(255 255 255)",
  warn: "rgb(251 191 36)",
  error: "rgb(248 113 113)",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toTimeString().slice(0, 12) + "." + String(ts % 1000).padStart(3, "0")
  );
}

/** Floating log panel (bottom-right, above Log button). Closes only when Log button is clicked again. */
export const PipelineLogViewer: React.FC = () => {
  const { entries, clear: clearLog } = usePipelineLog();
  const [sourceFilter, setSourceFilter] = useState<PipelineLogSource | "all">(
    "all",
  );
  const [levelFilter, setLevelFilter] = useState<PipelineLogLevel | "all">(
    "all",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (levelFilter !== "all" && e.level !== levelFilter) return false;
      return true;
    });
  }, [entries, sourceFilter, levelFilter]);

  const handleCopy = () => {
    const text = filtered
      .map(
        (e) =>
          `[${formatTime(e.ts)}] [${e.source}] [${e.level}] ${e.message}${
            e.detail ? " " + JSON.stringify(e.detail) : ""
          }`,
      )
      .join("\n");
    void navigator.clipboard.writeText(text);
  };

  return (
    <div
      className="fixed bottom-14 right-4 z-[100] flex flex-col rounded-lg overflow-hidden border border-white/20 shadow-xl"
      style={{
        background: "rgb(17 24 39)",
        width: "min(480px, 92vw)",
        maxHeight: "min(55vh, 420px)",
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 flex-shrink-0">
        <h2 className="text-sm font-semibold text-white">Pipeline log</h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(e.target.value as PipelineLogSource | "all")
            }
            className="bg-white/10 text-white text-xs rounded px-1.5 py-1 border border-white/20"
          >
            <option value="all">All</option>
            <option value="openai">OpenAI</option>
            <option value="liveavatar">LiveAvatar</option>
            <option value="orchestrator">Orchestrator</option>
          </select>
          <select
            value={levelFilter}
            onChange={(e) =>
              setLevelFilter(e.target.value as PipelineLogLevel | "all")
            }
            className="bg-white/10 text-white text-xs rounded px-1.5 py-1 border border-white/20"
          >
            <option value="all">All</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={clearLog}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs"
          >
            Clear
          </button>
        </div>
      </div>
      <div
        className="overflow-y-auto flex-1 font-mono text-xs p-2"
        style={{ minHeight: 200 }}
      >
        {filtered.length === 0 ? (
          <p className="text-gray-500 p-4">
            No log entries (or none match filters).
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((entry) => (
              <li
                key={entry.id}
                className="rounded px-2 py-1 hover:bg-white/5"
                style={{
                  borderLeft: `3px solid ${SOURCE_COLORS[entry.source]}`,
                }}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setExpandedId((id) => (id === entry.id ? null : entry.id))
                  }
                >
                  <span className="text-gray-500 mr-2">
                    {formatTime(entry.ts)}
                  </span>
                  <span
                    className="font-semibold mr-2"
                    style={{ color: SOURCE_COLORS[entry.source] }}
                  >
                    {entry.source}
                  </span>
                  <span
                    className="mr-2"
                    style={{ color: LEVEL_COLORS[entry.level] }}
                  >
                    [{entry.level}]
                  </span>
                  <span className="text-gray-200">{entry.message}</span>
                  {entry.detail && Object.keys(entry.detail).length > 0 && (
                    <span className="text-gray-500 ml-1">
                      {expandedId === entry.id ? " ▼" : " ▶"}
                    </span>
                  )}
                </button>
                {expandedId === entry.id && entry.detail && (
                  <pre className="mt-1 p-2 rounded bg-black/40 text-gray-300 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.detail, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
