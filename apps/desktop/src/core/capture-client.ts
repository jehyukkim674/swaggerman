// src/core/capture-client.ts
// 브라우저(CDP) 캡처 Tauri command 호출 래퍼. proxy-client.ts와 동일 패턴.
import { invoke } from "@tauri-apps/api/core";
import type { ProxyRecord } from "./proxy-client";

/** 전용 Chrome 기동 + CDP 캡처 시작. Chrome 미발견/기동 실패 시 메시지와 함께 throw. */
export async function startCapture(startUrl: string): Promise<void> {
  await invoke("capture_start", { startUrl });
}

export async function stopCapture(): Promise<void> {
  await invoke("capture_stop");
}

export async function getCaptureRecordings(): Promise<ProxyRecord[]> {
  return invoke<ProxyRecord[]>("capture_recordings");
}

/** 사용자가 Chrome 창을 직접 닫으면 백엔드가 자동 중지하므로 UI 재동기화에 사용. */
export async function getCaptureStatus(): Promise<boolean> {
  return invoke<boolean>("capture_status");
}
