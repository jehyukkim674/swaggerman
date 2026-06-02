// Rust mock 서버 command 호출 래퍼.
import { invoke } from "@tauri-apps/api/core";
import type { MockRoute } from "./mock-config";

export interface MockLogEntry {
  atMs: number;
  method: string;
  path: string;
  status: number;
}

export interface MockStatus {
  running: boolean;
  port: number;
  logs: MockLogEntry[];
}

/** mock 서버 시작. 실제 바인딩된 포트 반환. 포트 충돌 시 "PORT_IN_USE: ..." 에러 throw */
export async function startMockServer(port: number, routes: MockRoute[]): Promise<number> {
  return invoke<number>("mock_start", { config: { port, routes } });
}

export async function stopMockServer(): Promise<void> {
  await invoke("mock_stop");
}

export async function getMockStatus(): Promise<MockStatus> {
  return invoke<MockStatus>("mock_status");
}
