/** 응답 기반 AI 액션용 사용자 프롬프트(순수). 실제 응답/스펙 컨텍스트는
 *  AiPanel이 buildAiContext로 함께 전달하므로 여기서는 지시문만 만든다. */

export function diagnosePrompt(): string {
  return "직전 응답의 상태코드와 본문을 근거로, 이 요청이 왜 이런 결과(특히 실패라면 그 원인)를 냈는지 진단하고, 어떻게 고치면 되는지 한국어로 구체적으로 설명해 주세요.";
}

export function explainPrompt(): string {
  return "직전 응답 본문을 한국어로 간결히 요약하고, 주요 필드의 의미를 설명해 주세요.";
}

export function fixRequestPrompt(): string {
  return [
    "직전 요청이 실패했습니다. 상태코드·응답 본문·요청·스펙을 근거로 무엇이 잘못됐는지",
    "notes에 한 줄로 원인을 적고, 고친 요청(path/query/header/body)을 제안하세요.",
    "확실하지 않은 값은 비워 두고, 추측으로 채우지 마세요.",
  ].join(" ");
}

export function explainApiPrompt(): string {
  return [
    "지금 선택된 엔드포인트를 이 API를 처음 보는 신입 개발자에게 한국어로 설명해 주세요.",
    "다음 세 가지를 순서대로 포함하세요:",
    "1) 이 API가 무엇을 하는지(언제 쓰는지) 쉬운 말로 설명",
    "2) 주요 파라미터를 채운 현실적인 호출 예시",
    "3) 자주 하는 실수 3가지",
  ].join("\n");
}
