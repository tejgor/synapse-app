import { initLlama, type LlamaContext } from 'llama.rn';
import { AppState } from 'react-native';
import { getModelPath, isModelReady } from './modelManager';

let context: LlamaContext | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: { remove(): void } | null = null;

const IDLE_TIMEOUT_MS = 60_000; // Unload after 60s of inactivity

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log('[llmContext] idle timeout — releasing context');
    releaseContext();
  }, IDLE_TIMEOUT_MS);
}

export async function getContext(): Promise<LlamaContext> {
  if (context) {
    resetIdleTimer();
    return context;
  }

  const ready = await isModelReady();
  if (!ready) {
    throw new Error('Model not downloaded');
  }

  console.log('[llmContext] loading model...');
  const t0 = Date.now();

  context = await initLlama({
    model: getModelPath(),
    n_ctx: 4096,
    n_batch: 512,
    n_threads: 4,
    n_gpu_layers: 99, // Offload everything to Metal GPU
  });

  console.log(`[llmContext] model loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Subscribe to app state changes — unload when backgrounded
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && context) {
        console.log('[llmContext] app backgrounded — releasing context');
        releaseContext();
      }
    });
  }

  resetIdleTimer();
  return context;
}

export async function releaseContext(): Promise<void> {
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
