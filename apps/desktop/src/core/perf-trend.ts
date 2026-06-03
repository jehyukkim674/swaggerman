// 히스토리를 operation별로 집계해 응답시간 통계·추이를 만든다. 외부 라이브러리 없음.
import type { HistoryItem } from "./history";

export type PerfTrend = "slower" | "faster" | "stable" | "insufficient";

export interface PerfStat {
  opId: string;
  method: string;
  path: string;
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  series: number[];
  trend: PerfTrend;
}

/** 정렬 안 된 값 배열의 백분위(0~100). 빈 배열은 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

/** 시계열(오래된→최근)에서 추이 판정. 4건 미만은 insufficient. */
export function detectTrend(series: number[]): PerfTrend {
  if (series.length < 4) return "insufficient";
  const mid = Math.floor(series.length / 2);
  const older = series.slice(0, mid);
  const recent = series.slice(mid);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const olderAvg = avg(older);
  const recentAvg = avg(recent);
  if (olderAvg === 0) return "stable";
  const ratio = recentAvg / olderAvg;
  if (ratio > 1.3) return "slower";
  if (ratio < 0.77) return "faster";
  return "stable";
}

/** 히스토리 → operation별 성능 통계. 평균 내림차순 정렬(느린 API 위로). */
export function computePerfTrends(history: HistoryItem[]): PerfStat[] {
  const groups = new Map<string, HistoryItem[]>();
  for (const h of history) {
    if (!groups.has(h.opId)) groups.set(h.opId, []);
    groups.get(h.opId)!.push(h);
  }
  const stats: PerfStat[] = [];
  for (const [opId, items] of groups) {
    const sorted = [...items].sort((a, b) => a.executedAt - b.executedAt);
    const series = sorted.map((i) => i.durationMs);
    const sum = series.reduce((s, x) => s + x, 0);
    stats.push({
      opId,
      method: sorted[0].method,
      path: sorted[0].path,
      count: series.length,
      avgMs: Math.round(sum / series.length),
      minMs: Math.min(...series),
      maxMs: Math.max(...series),
      p50Ms: percentile(series, 50),
      p95Ms: percentile(series, 95),
      series,
      trend: detectTrend(series),
    });
  }
  return stats.sort((a, b) => b.avgMs - a.avgMs);
}
