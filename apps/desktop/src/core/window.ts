// 멀티윈도우: 새 SwaggerMan 창 열기. 창마다 독립된 앱 인스턴스가 떠서
// 서로 다른 프로젝트를 동시에 볼 수 있다. (localStorage는 공유하지만 프로젝트별 키로 분리됨)
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { log } from "./log";

let seq = 0;

/** 새 SwaggerMan 창을 연다(⌘N / 상단바 "새 창").
 *  실패하면 onError로 원인 메시지를 전달한다(권한/환경 문제 진단용). */
export function openNewWindow(onError?: (message: string) => void): void {
  // 고유 label: 같은 ms에 연속 호출돼도 충돌하지 않도록 시퀀스를 붙인다.
  const label = `main-${Date.now().toString(36)}-${seq++}`;
  const win = new WebviewWindow(label, {
    url: "index.html",
    title: "SwaggerMan",
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
  });
  win.once("tauri://created", () => {
    log.info("window", `새 창 생성됨: ${label}`);
  });
  win.once("tauri://error", (e) => {
    const message =
      typeof e?.payload === "string" ? e.payload : JSON.stringify(e?.payload ?? e ?? "알 수 없는 오류");
    log.error("window", `새 창 생성 실패: ${message}`);
    onError?.(message);
  });
}
