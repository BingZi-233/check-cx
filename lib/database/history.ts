import { getHistoryRetentionDays } from "@/lib/backend/config/runtime-config";
import {
  historyRepository,
  MAX_POINTS_PER_PROVIDER,
  type HistoryQueryOptions,
} from "@/lib/backend/repositories/history-repository";
import type { CheckResult, HistorySnapshot } from "@/lib/types";

export { MAX_POINTS_PER_PROVIDER, type HistoryQueryOptions };

export const HISTORY_RETENTION_DAYS = getHistoryRetentionDays();

export const historySnapshotStore = historyRepository;

export async function loadHistory(
  options?: HistoryQueryOptions
): Promise<HistorySnapshot> {
  return historyRepository.fetch(options);
}

export async function appendHistory(
  results: CheckResult[]
): Promise<HistorySnapshot> {
  await historyRepository.append(results);
  return historyRepository.fetch();
}
