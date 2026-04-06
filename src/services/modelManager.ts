import { File, Directory, Paths } from 'expo-file-system';
import { setModelDownloadState } from './settings';

const MODEL_DIR_NAME = 'models';
const MODEL_FILENAME = 'gemma-4-E2B-it-Q4_K_M.gguf';
const MODEL_URL = 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf';

// Expected file size ~3.04 GB — used for validation after download
const EXPECTED_SIZE_MIN = 2_900_000_000;

function getModelDir(): Directory {
  return new Directory(Paths.document, MODEL_DIR_NAME);
}

function getModelFile(): File {
  return new File(Paths.document, MODEL_DIR_NAME, MODEL_FILENAME);
}

export function getModelPath(): string {
  return getModelFile().uri;
}

export async function isModelReady(): Promise<boolean> {
  const file = getModelFile();
  return file.exists && file.size > EXPECTED_SIZE_MIN;
}

export async function downloadModel(): Promise<void> {
  // Ensure the models directory exists
  const dir = getModelDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }

  await setModelDownloadState('downloading');

  try {
    const downloaded = await File.downloadFileAsync(MODEL_URL, getModelDir(), { idempotent: true });

    // Validate file size
    if (downloaded.size < EXPECTED_SIZE_MIN) {
      downloaded.delete();
      await setModelDownloadState('none');
      throw new Error('Downloaded file is too small — may be corrupted');
    }

    // Rename to expected filename if needed
    const expected = getModelFile();
    if (downloaded.uri !== expected.uri) {
      downloaded.move(expected);
    }

    await setModelDownloadState('ready');
    console.log(`[modelManager] download complete — ${(expected.size / 1e9).toFixed(2)} GB`);
  } catch (err) {
    const ready = await isModelReady();
    await setModelDownloadState(ready ? 'ready' : 'none');
    throw err;
  }
}

export async function cancelDownload(): Promise<void> {
  // File.downloadFileAsync can't be cancelled mid-flight — just reset state
  const ready = await isModelReady();
  await setModelDownloadState(ready ? 'ready' : 'none');
}

export async function deleteModel(): Promise<void> {
  const file = getModelFile();
  if (file.exists) file.delete();
  await setModelDownloadState('none');
  console.log('[modelManager] model deleted');
}
