// src/core/proxy-client.ts
// 프록시 녹화 서버 Tauri command 호출 래퍼.
import { invoke } from "@tauri-apps/api/core";

export interface ProxyRecord {
  atMs: number;
  method: string;
  path: string;
  status: number;
  responseBody: string;
  error?: string | null;
}

/** 프록시 시작. 바인딩된 포트 반환. 포트 충돌 시 "PORT_IN_USE: ..." throw */
export async function startProxy(targetBaseUrl: string, port: number): Promise<number> {
  return invoke<number>("proxy_start", { targetBaseUrl, port });
}

export async function stopProxy(): Promise<void> {
  await invoke("proxy_stop");
}

export async function getRecordings(): Promise<ProxyRecord[]> {
  return invoke<ProxyRecord[]>("proxy_recordings");
}
