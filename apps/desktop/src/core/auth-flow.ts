// 인증 플로우: 로그인 시퀀스(플로우)를 한 번 정해두면 "토큰 갱신"으로 다시 실행해
// 추출된 토큰을 전역 헤더에 자동 주입한다. 순수 로직 + per-spec 영속화.
import { loadJSON, saveJSON } from "./storage";
import type { RequestParam } from "./request-builder";

export interface AuthFlowConfig {
  /** 인증에 사용할 Flow의 id. */
  flowId: string;
  /** runFlow 결과 vars에서 토큰을 담은 변수명. */
  tokenVar: string;
  /** 주입할 헤더 이름. */
  headerName: string;
  /** 토큰 앞에 붙일 접두(예: "Bearer "). 빈 문자열이면 토큰만. */
  scheme: string;
}

export const DEFAULT_AUTH_CONFIG: AuthFlowConfig = {
  flowId: "",
  tokenVar: "token",
  headerName: "Authorization",
  scheme: "Bearer ",
};

const KEY_PREFIX = "swaggerman.authflow.";

export function loadAuthConfig(specUrl: string): AuthFlowConfig {
  return loadJSON(`${KEY_PREFIX}${specUrl}`, DEFAULT_AUTH_CONFIG);
}

export function saveAuthConfig(specUrl: string, cfg: AuthFlowConfig): void {
  saveJSON(`${KEY_PREFIX}${specUrl}`, cfg);
}

/** 설정이 사용 가능한 상태인지(플로우·토큰변수·헤더 지정됨). */
export function isAuthConfigured(cfg: AuthFlowConfig): boolean {
  return Boolean(cfg.flowId && cfg.tokenVar.trim() && cfg.headerName.trim());
}

/** 헤더에 넣을 값(scheme + token). */
export function headerValue(cfg: AuthFlowConfig, token: string): string {
  return `${cfg.scheme}${token}`;
}

/** 전역 헤더에 토큰 헤더를 주입(같은 이름은 대소문자 무시로 교체). */
export function applyTokenHeader(
  headers: RequestParam[],
  cfg: AuthFlowConfig,
  token: string,
): RequestParam[] {
  const name = cfg.headerName.trim();
  const kept = headers.filter((h) => h.key.toLowerCase() !== name.toLowerCase());
  return [...kept, { key: name, value: headerValue(cfg, token), enabled: true }];
}
