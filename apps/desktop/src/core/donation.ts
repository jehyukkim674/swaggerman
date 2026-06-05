// 카카오페이 후원(커피 사주기) — 배너 표시 판단 + 닫은 시각 영속화.
import { loadJSON, saveJSON } from "./storage";

/** 카카오페이 송금 QR 페이지. 브라우저에서 열고 휴대폰으로 스캔하면 송금된다. */
export const DONATION_URL = "https://qr.kakaopay.com/FcUzxPAhE";

/** 배너를 닫아도 이 시간이 지나면 다시 표시한다. (하루 — 후원 요청은 하루 한 번만) */
export const REDISPLAY_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DISMISSED_AT_KEY = "swaggerman.donation.dismissedAt";

/** 닫은 기록이 없거나 REDISPLAY_INTERVAL_MS가 지났으면 true. */
export function shouldShowDonationBanner(dismissedAtMs: number | null, nowMs: number): boolean {
  if (dismissedAtMs === null) return true;
  return nowMs - dismissedAtMs >= REDISPLAY_INTERVAL_MS;
}

export function loadDonationDismissedAt(): number | null {
  return loadJSON<number | null>(DISMISSED_AT_KEY, null);
}

export function saveDonationDismissedAt(nowMs: number): void {
  saveJSON(DISMISSED_AT_KEY, nowMs);
}
