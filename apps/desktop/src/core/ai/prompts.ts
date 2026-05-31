/** 응답 기반 AI 액션용 사용자 프롬프트(순수). 실제 응답/스펙 컨텍스트는
 *  AiPanel이 buildAiContext로 함께 전달하므로 여기서는 지시문만 만든다. */

export function diagnosePrompt(): string {
  return "직전 응답의 상태코드와 본문을 근거로, 이 요청이 왜 이런 결과(특히 실패라면 그 원인)를 냈는지 진단하고, 어떻게 고치면 되는지 한국어로 구체적으로 설명해 주세요.";
}

export function explainPrompt(): string {
  return "직전 응답 본문을 한국어로 간결히 요약하고, 주요 필드의 의미를 설명해 주세요.";
}
