import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProcessingMode = 'cloud' | 'local';
export type ModelDownloadState = 'none' | 'downloading' | 'ready';
export type BackendTarget = 'prod' | 'dev';

const KEYS = {
  processingMode: 'synapse:processingMode',
  modelDownloadState: 'synapse:modelDownloadState',
  backendTarget: 'synapse:backendTarget',
  localInferencePaused: 'synapse:localInferencePaused',
  autoCloudLongTranscripts: 'synapse:autoCloudLongTranscripts',
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

export async function getLocalInferencePaused(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.localInferencePaused);
  return value === 'true';
}

export async function setLocalInferencePaused(paused: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.localInferencePaused, paused ? 'true' : 'false');
}

export async function getAutoCloudLongTranscripts(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.autoCloudLongTranscripts);
  return value == null ? true : value === 'true';
}

export async function setAutoCloudLongTranscripts(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.autoCloudLongTranscripts, enabled ? 'true' : 'false');
}
