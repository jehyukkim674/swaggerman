// src/core/proxy-client.ts
// 프록시 녹화 서버 Tauri command 호출 래퍼.
import { invoke } from "@tauri-apps/api/core";
import type { NetworkSettings } from "./types";

export interface ProxyRecord {
  atMs: number;
  method: string;
  path: string;
  status: number;
  responseBody: string;
  error?: string | null;
}

/** 프록시 시작. 바인딩된 포트 반환. 포트 충돌 시 "PORT_IN_USE: ..." throw.
 *  net: 앱 네트워크 설정 — 포워딩 클라이언트의 TLS 검증/아웃바운드 프록시/타임아웃에 적용. */
export async function startProxy(
  targetBaseUrl: string,
  port: number,
  net?: Partial<NetworkSettings>,
): Promise<number> {
  return invoke<number>("proxy_start", {
    targetBaseUrl,
    port,
    insecure: net?.insecure ?? false,
    proxy: net?.proxy || undefined,
    timeoutMs: net?.timeoutMs ?? 30_000,
  });
}

export async function stopProxy(): Promise<void> {
  await invoke("proxy_stop");
}

export async function getRecordings(): Promise<ProxyRecord[]> {
  return invoke<ProxyRecord[]>("proxy_recordings");
}
