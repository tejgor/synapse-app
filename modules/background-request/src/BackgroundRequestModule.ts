import { requireNativeModule, EventEmitter } from 'expo-modules-core';

export interface BackgroundRequestResult {
  entryId: string;
  response?: string;
  error?: string;
  statusCode?: number;
}

interface BackgroundRequestModuleType {
  startRequest(entryId: string, url: string, bodyJson: string): void;
  getPendingResults(): BackgroundRequestResult[];
  clearResult(entryId: string): void;
  getInFlightEntryIds(): string[];
}

const mod = requireNativeModule<BackgroundRequestModuleType>('ExpoBackgroundRequest');
export const emitter = new EventEmitter(mod);
export default mod;
