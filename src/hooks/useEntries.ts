import { useState, useEffect, useCallback } from 'react';
import { getEntries } from '../db/entries';
import type { Entry } from '../types';

interface UseEntriesReturn {
  entries: Entry[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useEntries(search?: string, tag?: string): UseEntriesReturn {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getEntries(search, tag);
      setEntries(result);
    } catch (err) {
      console.error('Failed to fetch entries:', err);
    } finally {
      setLoading(false);
    }
  }, [search, tag]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entries, loading, refresh };
}
