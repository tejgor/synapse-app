import { useState, useEffect, useCallback, useRef } from 'react';
import { getEntries } from '../db/entries';
import { onProcessingUpdate } from '../services/processing';
import type { Entry } from '../types';

interface UseEntriesReturn {
  entries: Entry[];
  isFiltered: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useEntries(search?: string, category?: string): UseEntriesReturn {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isFiltered, setIsFiltered] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchEntries = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const result = await getEntries(search, category);
      // Batch both state updates — React commits them in one render,
      // so isFiltered and entries are always in sync.
      setIsFiltered(!!(search || category));
      setEntries(prev => {
        if (
          prev.length === result.length &&
          prev.every((e, i) => e.id === result[i].id)
        ) {
          return prev;
        }
        return result;
      });
    } catch (err) {
      console.error('Failed to fetch entries:', err);
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  // Auto-refresh on search/category change — spinner only on first load
  useEffect(() => {
    const isFirst = !hasFetched.current;
    hasFetched.current = true;
    fetchEntries(isFirst);
  }, [fetchEntries]);

  // Manual pull-to-refresh — always shows spinner
  const refresh = useCallback(() => fetchEntries(true), [fetchEntries]);

  // Silent refresh when processing completes
  useEffect(() => {
    return onProcessingUpdate(() => fetchEntries(false));
  }, [fetchEntries]);

  return { entries, isFiltered, loading, refresh };
}
