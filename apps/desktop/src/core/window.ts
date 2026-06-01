// 멀티윈도우: 새 SwaggerMan 창 열기. 창마다 독립된 앱 인스턴스가 떠서
// 서로 다른 프로젝트를 동시에 볼 수 있다. (localStorage는 공유하지만 프로젝트별 키로 분리됨)
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

let seq = 0;

/** 새 SwaggerMan 창을 연다(⌘N / 상단바 "새 창"). */
export function openNewWindow(): void {
  // 고유 label: 같은 ms에 연속 호출돼도 충돌하지 않도록 시퀀스를 붙인다.
  const label = `main-${Date.now().toString(36)}-${seq++}`;
  new WebviewWindow(label, {
    url: "index.html",
    title: "SwaggerMan",
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
  });
}
