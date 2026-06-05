import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldShowDonationBanner,
  loadDonationDismissedAt,
  saveDonationDismissedAt,
  REDISPLAY_INTERVAL_MS,
  DONATION_URL,
} from "./donation";

describe("shouldShowDonationBanner", () => {
  it("닫은 기록이 없으면 표시한다", () => {
    expect(shouldShowDonationBanner(null, Date.now())).toBe(true);
  });

  it("닫은 지 재표시 간격 미만이면 표시하지 않는다", () => {
    const now = 1_000_000_000;
    expect(shouldShowDonationBanner(now - REDISPLAY_INTERVAL_MS + 1, now)).toBe(false);
  });

  it("닫은 지 재표시 간격 이상이면 다시 표시한다", () => {
    const now = 1_000_000_000;
    expect(shouldShowDonationBanner(now - REDISPLAY_INTERVAL_MS, now)).toBe(true);
  });

  it("재표시 간격은 하루(24시간)다 — 후원 요청은 하루 한 번만 노출", () => {
    expect(REDISPLAY_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("닫은 지 23시간 뒤에는 표시하지 않는다", () => {
    const now = 2_000_000_000_000;
    expect(shouldShowDonationBanner(now - 23 * 60 * 60 * 1000, now)).toBe(false);
  });

  it("닫은 지 24시간 뒤에는 다시 표시한다", () => {
    const now = 2_000_000_000_000;
    expect(shouldShowDonationBanner(now - 24 * 60 * 60 * 1000, now)).toBe(true);
  });
});

describe("dismissedAt 영속화", () => {
  beforeEach(() => localStorage.clear());

  it("저장 전에는 null", () => {
    expect(loadDonationDismissedAt()).toBe(null);
  });

  it("저장한 시각을 다시 읽는다", () => {
    saveDonationDismissedAt(12345);
    expect(loadDonationDismissedAt()).toBe(12345);
  });

  it("표시 시각을 기록하면 24시간 내 재실행/리로드에는 다시 표시하지 않는다 (하루 한 번)", () => {
    const shownAt = 2_000_000_000_000;
    expect(shouldShowDonationBanner(loadDonationDismissedAt(), shownAt)).toBe(true); // 첫 표시
    saveDonationDismissedAt(shownAt); // 표시되는 순간 시각 기록(App이 하는 일)
    // 같은 날(12시간 뒤) 재실행 → 닫지 않았어도 표시 안 함
    expect(shouldShowDonationBanner(loadDonationDismissedAt(), shownAt + 12 * 3600_000)).toBe(false);
    // 하루 지난 뒤 → 다시 표시
    expect(shouldShowDonationBanner(loadDonationDismissedAt(), shownAt + 25 * 3600_000)).toBe(true);
  });
});

describe("DONATION_URL", () => {
  it("카카오페이 QR 링크다", () => {
    expect(DONATION_URL).toBe("https://qr.kakaopay.com/FcUzxPAhE");
  });
});
