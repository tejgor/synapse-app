import { initLlama, type LlamaContext } from 'llama.rn';
import { AppState } from 'react-native';
import { getModelPath, isModelReady } from './modelManager';

let context: LlamaContext | null = null;
let loadingPromise: Promise<LlamaContext> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: { remove(): void } | null = null;
let busy = false;

const IDLE_TIMEOUT_MS = 60_000; // Unload after 60s of inactivity

export function markBusy() {
  busy = true;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

export function markIdle() {
  busy = false;
  resetIdleTimer();
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (busy) return;
    console.log('[llmContext] idle timeout — releasing context');
    releaseContext();
  }, IDLE_TIMEOUT_MS);
}

export async function getContext(): Promise<LlamaContext> {
  if (context) {
    resetIdleTimer();
    return context;
  }

  // If another call is already loading, wait for it instead of starting a duplicate
  if (loadingPromise) {
    console.log('[llmContext] waiting for in-progress model load...');
    return loadingPromise;
  }

  const ready = await isModelReady();
  if (!ready) {
    throw new Error('Model not downloaded');
  }

  console.log('[llmContext] loading local model...');
  const t0 = Date.now();

  loadingPromise = initLlama({
    model: getModelPath(),
    n_ctx: 8192,
    n_batch: 384,
    n_threads: 4,
    n_gpu_layers: 99, // Offload everything to Metal GPU
  });

  try {
    context = await loadingPromise;
  } finally {
    loadingPromise = null;
  }

  console.log(`[llmContext] local model loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Subscribe to app state changes — unload when backgrounded
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && context && !busy) {
        console.log('[llmContext] app backgrounded — releasing context');
        releaseContext();
      }
    });
  }

  resetIdleTimer();
  return context;
}

export async function stopActiveCompletion(): Promise<void> {
  if (!context) return;

  try {
    await context.stopCompletion();
    console.log('[llmContext] stopCompletion requested');
  } catch (err) {
    console.warn('[llmContext] error stopping completion:', err);
  }
}

export async function releaseContext(): Promise<void> {
  loadingPromise = null;

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (context) {
    try {
      await context.release();
    } catch (err) {
      console.warn('[llmContext] error releasing context:', err);
    }
    context = null;
    console.log('[llmContext] context released');
  }
}

export function isContextLoaded(): boolean {
  return context !== null;
}
