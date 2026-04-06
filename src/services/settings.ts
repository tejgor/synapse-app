import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProcessingMode = 'cloud' | 'local';
export type ModelDownloadState = 'none' | 'downloading' | 'ready';

const KEYS = {
  processingMode: 'synapse:processingMode',
  modelDownloadState: 'synapse:modelDownloadState',
} as const;

export async function getProcessingMode(): Promise<ProcessingMode> {
  const value = await AsyncStorage.getItem(KEYS.processingMode);
  return (value as ProcessingMode) || 'cloud';
}

export async function setProcessingMode(mode: ProcessingMode): Promise<void> {
  await AsyncStorage.setItem(KEYS.processingMode, mode);
}

export async function getModelDownloadState(): Promise<ModelDownloadState> {
  const value = await AsyncStorage.getItem(KEYS.modelDownloadState);
  return (value as ModelDownloadState) || 'none';
}

export async function setModelDownloadState(state: ModelDownloadState): Promise<void> {
  await AsyncStorage.setItem(KEYS.modelDownloadState, state);
}
