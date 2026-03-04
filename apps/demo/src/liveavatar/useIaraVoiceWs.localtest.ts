import { drainContiguousSentenceOrder } from "./useIaraVoiceWs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Minimal local sanity test for WS playback ordering.
 * Run by calling runIaraVoiceWsLocalTest() from a dev-only context.
 */
export function runIaraVoiceWsLocalTest() {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([5, 6, 7, 8]);
  const c = new Uint8Array([9, 10, 11, 12]);

  const bucket = new Map<number, Uint8Array[]>();
  bucket.set(2, [c]);
  bucket.set(1, [b]);
  bucket.set(0, [a]);

  const first = drainContiguousSentenceOrder(bucket, 0);
  assert(first.drained.length === 3, "expected 3 drained chunks");
  assert(
    first.drained[0]?.sentenceIndex === 0,
    "first sentence index should be 0",
  );
  assert(
    first.drained[1]?.sentenceIndex === 1,
    "second sentence index should be 1",
  );
  assert(
    first.drained[2]?.sentenceIndex === 2,
    "third sentence index should be 2",
  );
  assert(first.next === 3, "next index should move to 3");
  assert(bucket.size === 0, "bucket should be empty after full drain");

  const sparse = new Map<number, Uint8Array[]>();
  sparse.set(4, [new Uint8Array([1, 1])]);
  const second = drainContiguousSentenceOrder(sparse, 3);
  assert(second.drained.length === 0, "should not drain non-contiguous chunk");
  assert(second.next === 3, "next index should remain unchanged");

  return { ok: true as const };
}
