import { useState, useEffect, useCallback, useRef } from 'react';
import { getEntries, getCategoriesWithCounts } from '../db/entries';
import type { CategoryCount } from '../db/entries';
import { onProcessingUpdate } from '../services/processing';
import type { Entry } from '../types';

interface UseEntriesReturn {
  entries: Entry[];
  categories: CategoryCount[];
  isFiltered: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useEntries(search?: string, category?: string): UseEntriesReturn {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [isFiltered, setIsFiltered] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchEntries = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const [result, cats] = await Promise.all([
        getEntries(search, category),
        getCategoriesWithCounts(),
      ]);
      setIsFiltered(!!(search || category));
      setEntries(prev => {
        if (
          prev.length === result.length &&
          prev.every((e, i) => e.id === result[i].id && e.processing_status === result[i].processing_status)
        ) {
          return prev;
        }
        return result;
      });
      setCategories(prev => {
        if (
          prev.length === cats.length &&
          prev.every((c, i) => c.name === cats[i].name && c.count === cats[i].count)
        ) {
          return prev;
        }
        return cats;
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

  return { entries, categories, isFiltered, loading, refresh };
}
