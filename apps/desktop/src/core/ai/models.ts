// claude CLI는 별칭(alias)을 받는다(예: "opus","sonnet","haiku"). 별칭을 기본값으로.
export interface ModelOption {
  id: string;
  label: string;
}

export const CHAT_MODELS: ModelOption[] = [
  { id: "sonnet", label: "Sonnet (균형)" },
  { id: "opus", label: "Opus (고성능)" },
  { id: "haiku", label: "Haiku (빠름)" },
];

export const DEFAULT_CHAT_MODEL = "sonnet";

/** 요청 작성 도우미/자동완성은 지연 민감 → 빠른 모델. */
export const COMPLETE_MODEL = "haiku";
