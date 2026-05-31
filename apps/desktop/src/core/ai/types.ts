// AI 어시스턴트 공유 타입. Rust(ai.rs)의 serde(camelCase) 출력과 1:1로 맞춘다.

/** Rust ai_chat이 Channel로 보내는 스트리밍 이벤트. */
export type AiEvent =
  | { kind: "delta"; text: string }
  | { kind: "done"; sessionId?: string }
  | { kind: "error"; message: string };

/** ai_chat 호출 인자(프론트 → Rust). */
export interface AiChatRequest {
  reqId: number; // 취소(ai_cancel)에 쓰는 요청 식별자
  prompt: string; // 컨텍스트 + 사용자 질문(stdin으로 전달됨)
  system: string; // 짧은 역할 지시(--append-system-prompt)
  model: string;
  sessionId?: string; // 있으면 --resume, 없으면 새 세션
  claudePath?: string; // 설정에서 수동 지정한 실행파일 경로
}

/** ai_complete 호출 인자(프론트 → Rust). 단발 구조화 출력. */
export interface AiCompleteRequest {
  prompt: string;
  system: string;
  model: string;
  schema: string; // JSON Schema 문자열(--json-schema)
  claudePath?: string;
}

/** 요청 작성 도우미가 생성하는 폼 제안(스키마로 강제되는 형태). */
export interface RequestSuggestion {
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  notes?: string;
}

export interface CliInfo {
  path: string;
  version: string;
}

/** ai_detect 반환: 사용 가능한 CLI 정보. */
export interface AiDetect {
  claude?: CliInfo;
  codex?: CliInfo;
}
