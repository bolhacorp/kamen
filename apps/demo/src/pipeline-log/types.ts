export type PipelineLogSource =
  | "openai"
  | "liveavatar"
  | "orchestrator"
  | "iara";
export type PipelineLogLevel = "debug" | "info" | "warn" | "error";

export interface PipelineLogEntry {
  id: string;
  ts: number;
  source: PipelineLogSource;
  level: PipelineLogLevel;
  message: string;
  detail?: Record<string, unknown>;
}

export type PipelineLogFilter = {
  source: PipelineLogSource | "all";
  level: PipelineLogLevel | "all";
};
