import { requireNativeModule } from 'expo-modules-core';

interface BackgroundTaskModuleType {
  beginBackgroundTask(): void;
  endBackgroundTask(): void;
}

export default requireNativeModule<BackgroundTaskModuleType>('ExpoBackgroundTask');
