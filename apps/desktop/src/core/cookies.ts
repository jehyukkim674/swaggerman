// 쿠키 저장소 조회/삭제 (Rust 커맨드 래퍼).
import { invoke } from "@tauri-apps/api/core";

export interface CookieInfo {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export async function listCookies(): Promise<CookieInfo[]> {
  return invoke<CookieInfo[]>("list_cookies");
}

export async function clearCookies(): Promise<void> {
  await invoke("clear_cookies");
}
