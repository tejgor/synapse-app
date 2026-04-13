import { getBackendTarget, type BackendTarget } from './settings';

const PROD_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();
const PROD_API_SECRET = (process.env.EXPO_PUBLIC_API_SECRET || '').trim();
const DEV_BASE_URL = (process.env.EXPO_PUBLIC_DEV_API_URL || '').trim();
const DEV_API_SECRET = (process.env.EXPO_PUBLIC_DEV_API_SECRET || '').trim();

export interface BackendConfig {
  target: BackendTarget;
  label: string;
  baseUrl: string;
  apiSecret: string;
}

export function getBackendConfigForTarget(target: BackendTarget): BackendConfig {
  return target === 'dev'
    ? {
        target,
        label: 'Development',
        baseUrl: DEV_BASE_URL,
        apiSecret: DEV_API_SECRET,
      }
    : {
        target,
        label: 'Production',
        baseUrl: PROD_BASE_URL,
        apiSecret: PROD_API_SECRET,
      };
}

export async function getBackendConfig(): Promise<BackendConfig> {
  const target = await getBackendTarget();
  if (target === 'dev' && !hasDevBackendConfigured()) {
    return getBackendConfigForTarget('prod');
  }
  return getBackendConfigForTarget(target);
}

export function hasDevBackendConfigured(): boolean {
  return DEV_BASE_URL.length > 0;
}

export function getBackendUrlPreview(target: BackendTarget): string {
  const { baseUrl } = getBackendConfigForTarget(target);
  return baseUrl || 'Not configured';
}
