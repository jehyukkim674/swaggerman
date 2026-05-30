// 자동 업데이트: 릴리스의 서명된 업데이터 아티팩트를 확인하고 설치한다.
// Tauri 런타임이 아닌 환경(브라우저/테스트)에서는 조용히 무시한다.
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { log } from "./log";

export interface AvailableUpdate {
  version: string;
  notes?: string;
  /** 다운로드·설치 후 앱을 재시작한다. */
  install: () => Promise<void>;
}

/** 업데이트가 있으면 정보를 반환, 없거나 확인 실패 시 null. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  try {
    const update = await check();
    if (!update) {
      log.info("updater", "최신 버전입니다(업데이트 없음)");
      return null;
    }
    log.info("updater", `업데이트 발견: v${update.version}`);
    return {
      version: update.version,
      notes: update.body,
      install: async () => {
        log.info("updater", `설치 시작: v${update.version}`);
        await update.downloadAndInstall();
        log.info("updater", "설치 완료, 재시작");
        await relaunch();
      },
    };
  } catch (e) {
    log.warn("updater", "업데이트 확인 실패(무시)", e);
    return null;
  }
}
