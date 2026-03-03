"use client";

import type {
  PipelineLogEntry,
  PipelineLogLevel,
  PipelineLogSource,
} from "./types";

const MAX_ENTRIES = 2000;

type Listener = () => void;

let entries: PipelineLogEntry[] = [];
const listeners = new Set<Listener>();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `log-${Date.now()}-${idCounter}`;
}

function emit() {
  listeners.forEach((l) => l());
}

function add(entry: Omit<PipelineLogEntry, "id" | "ts">) {
  const full: PipelineLogEntry = {
    ...entry,
    id: nextId(),
    ts: Date.now(),
  };
  entries.push(full);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  emit();
}

export function getEntries(): PipelineLogEntry[] {
  return [...entries];
}

export function clear(): void {
  entries = [];
  emit();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function log(
  source: PipelineLogSource,
  level: PipelineLogLevel,
  message: string,
  detail?: Record<string, unknown>,
) {
  add({ source, level, message, detail });
}

export function logOpenAI(
  message: string,
  level: PipelineLogLevel = "info",
  detail?: Record<string, unknown>,
) {
  log("openai", level, message, detail);
}

export function logLiveAvatar(
  message: string,
  level: PipelineLogLevel = "info",
  detail?: Record<string, unknown>,
) {
  log("liveavatar", level, message, detail);
}

export function logOrchestrator(
  message: string,
  level: PipelineLogLevel = "info",
  detail?: Record<string, unknown>,
) {
  log("orchestrator", level, message, detail);
}
