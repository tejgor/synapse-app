import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProcessingMode = 'cloud' | 'local';
export type ModelDownloadState = 'none' | 'downloading' | 'ready';
export type BackendTarget = 'prod' | 'dev';

const KEYS = {
  processingMode: 'synapse:processingMode',
  modelDownloadState: 'synapse:modelDownloadState',
  backendTarget: 'synapse:backendTarget',
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

export async function getBackendTarget(): Promise<BackendTarget> {
  const value = await AsyncStorage.getItem(KEYS.backendTarget);
  return (value as BackendTarget) || 'prod';
}

export async function setBackendTarget(target: BackendTarget): Promise<void> {
  await AsyncStorage.setItem(KEYS.backendTarget, target);
}
