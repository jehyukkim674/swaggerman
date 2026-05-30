import type { RequestInputs } from "./request-builder";

export interface HistoryItem {
  id: string;
  opId: string;
  method: string;
  path: string;
  url: string;
  status: number;
  durationMs: number;
  size: number;
  executedAt: number;
  inputs: RequestInputs;
  responseHeaders: Record<string, string>;
  responseBody: string;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 경과 시간을 "~전"으로(초 생략). */
export function relativeTime(timestamp: number): string {
  const elapsed = (Date.now() - timestamp) / 1000;
  if (elapsed < 60) return "방금 전";
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes % 60;
    return rem > 0 ? `${hours}시간 ${rem}분 전` : `${hours}시간 전`;
  }
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
