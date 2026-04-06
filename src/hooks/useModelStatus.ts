import { useState, useEffect, useCallback } from 'react';
import { getModelDownloadState, type ModelDownloadState } from '../services/settings';
import { isModelReady, downloadModel, cancelDownload, deleteModel } from '../services/modelManager';

export function useModelStatus() {
  const [state, setState] = useState<ModelDownloadState>('none');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const ready = await isModelReady();
    if (ready) {
      setState('ready');
    } else {
      const stored = await getModelDownloadState();
      setState(stored === 'ready' ? 'none' : stored);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const startDownload = useCallback(async () => {
    setState('downloading');
    try {
      await downloadModel();
      setState('ready');
    } catch (err) {
      const ready = await isModelReady();
      setState(ready ? 'ready' : 'none');
      throw err;
    }
  }, []);

  const cancel = useCallback(async () => {
    await cancelDownload();
    setState('none');
  }, []);

  const remove = useCallback(async () => {
    await deleteModel();
    setState('none');
  }, []);

  return { state, loading, startDownload, cancel, remove, refresh };
}
