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

export type UpdateCheck =
  | { kind: "available"; update: AvailableUpdate }
  | { kind: "latest" }
  | { kind: "error"; message: string };

/** 업데이트 확인에 적용할 네트워크 설정(사내망/프록시 환경 대응). */
export interface UpdaterNetOptions {
  /** 프록시 URL(예: http://proxy.corp:8080). 비우면 직접 연결. */
  proxy?: string;
  timeoutMs?: number;
}

/** 업데이트 상태를 구분해 반환(수동 확인 버튼용).
 *  앱의 네트워크 설정(프록시/타임아웃)을 업데이터에도 적용한다 — 회사망 윈도우처럼
 *  외부 연결에 프록시가 필요한 환경에서 GitHub 릴리스 확인이 가능해진다. */
export async function checkUpdateStatus(net?: UpdaterNetOptions): Promise<UpdateCheck> {
  try {
    const update = await check({
      proxy: net?.proxy || undefined,
      timeout: net?.timeoutMs ?? 30_000,
    });
    if (!update) {
      log.info("updater", "최신 버전입니다(업데이트 없음)");
      return { kind: "latest" };
    }
    log.info("updater", `업데이트 발견: v${update.version}`);
    return {
      kind: "available",
      update: {
        version: update.version,
        notes: update.body,
        install: async () => {
          log.info("updater", `설치 시작: v${update.version}`);
          await update.downloadAndInstall();
          log.info("updater", "설치 완료, 재시작");
          await relaunch();
        },
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn("updater", "업데이트 확인 실패", message);
    // 네트워크 단계 실패(reqwest)는 대부분 사내망/프록시 환경 → 해결 방법 안내
    const hint = message.includes("error sending request")
      ? " — 사내망이면 설정(⚙) → 네트워크 → 프록시를 지정한 뒤 다시 시도하세요"
      : "";
    return { kind: "error", message: message + hint };
  }
}

/** 업데이트가 있으면 정보를 반환, 없거나 확인 실패 시 null(시작 시 자동 확인용). */
export async function checkForUpdate(net?: UpdaterNetOptions): Promise<AvailableUpdate | null> {
  const result = await checkUpdateStatus(net);
  return result.kind === "available" ? result.update : null;
}
