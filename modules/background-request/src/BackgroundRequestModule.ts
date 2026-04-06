import { requireNativeModule, EventEmitter } from 'expo-modules-core';

export interface BackgroundRequestResult {
  entryId: string;
  response?: string;
  error?: string;
  statusCode?: number;
}

const mod = requireNativeModule('ExpoBackgroundRequest') as {
  startRequest(entryId: string, url: string, bodyJson: string, headersJson: string): void;
  getPendingResults(): BackgroundRequestResult[];
  clearResult(entryId: string): void;
  getInFlightEntryIds(): string[];
};
export const emitter = new EventEmitter(mod as any);
export default mod;
