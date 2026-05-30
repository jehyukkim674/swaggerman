// 텍스트 파일 읽기/쓰기 (Rust 커맨드 래퍼) — 컬렉션 import/export 용.
import { invoke } from "@tauri-apps/api/core";

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke("write_text_file", { path, contents });
}
