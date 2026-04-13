import { File, Directory, Paths } from 'expo-file-system';
import { setModelDownloadState } from './settings';

const MODEL_DIR_NAME = 'models';
const MODEL_FILENAME = 'Qwen3-4B-Q4_K_M.gguf';
const MODEL_URL = 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf';

// Expected file size ~2.50 GB — used for validation after download
const EXPECTED_SIZE_MIN = 2_300_000_000;

export const LOCAL_MODEL_INFO = {
  id: 'qwen3-4b-q4_k_m',
  name: 'Qwen3 4B',
  quant: 'Q4_K_M',
  parameterLabel: '4B params',
  approxSizeLabel: '~2.5 GB',
  recommendedDeviceLabel: 'Recent iPhone recommended (6 GB RAM)',
  speedLabel: 'Better quality target than 3B with moderate on-device cost',
} as const;

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
    console.log(`[modelManager] ${LOCAL_MODEL_INFO.name} download complete — ${(expected.size / 1e9).toFixed(2)} GB`);
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
  console.log(`[modelManager] ${LOCAL_MODEL_INFO.name} deleted`);
}
