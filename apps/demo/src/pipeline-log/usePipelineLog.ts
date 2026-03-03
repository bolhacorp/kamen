"use client";

import { useEffect, useState } from "react";
import { getEntries, subscribe, clear } from "./store";
import type { PipelineLogEntry } from "./types";

export function usePipelineLog(): {
  entries: PipelineLogEntry[];
  clear: () => void;
} {
  const [entries, setEntries] = useState<PipelineLogEntry[]>(getEntries);

  useEffect(() => {
    setEntries(getEntries());
    const unsub = subscribe(() => setEntries(getEntries()));
    return unsub;
  }, []);

  return {
    entries,
    clear: () => {
      clear();
      setEntries([]);
    },
  };
}
