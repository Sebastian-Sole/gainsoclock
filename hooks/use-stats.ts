import { useMemo } from 'react';
import { useHistoryStore } from '@/stores/history-store';
import { computeAllStats, filterLogsByDateRange, type AllStats, type DateRangeFilter } from '@/lib/stats';

export function useStats(filter: DateRangeFilter): AllStats {
  const logs = useHistoryStore((s) => s.logs);

  return useMemo(() => {
    const filtered = filterLogsByDateRange(logs, filter);
    return computeAllStats(filtered, new Date());
  }, [logs, filter]);
}
