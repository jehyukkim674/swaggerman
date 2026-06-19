// 자연어 의도 → 스펙 전체에서 알맞은 operationId 선택(라우팅). 순수 로직.

export interface RouteOp {
  id: string; // "METHOD /path"
  method: string;
  path: string;
  summary?: string;
  tags?: string[];
}

export const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    operationId: { type: "string", description: "선택한 엔드포인트의 id(목록의 id와 정확히 일치)" },
    reason: { type: "string", description: "선택 이유(짧게)" },
  },
  required: ["operationId"],
} as const;

/** operation 목록 + 의도로 라우팅 프롬프트를 만든다. */
export function buildRoutePrompt(ops: RouteOp[], intent: string): string {
  const list = ops
    .map((o) => {
      const tags = o.tags?.length ? ` [${o.tags.join(",")}]` : "";
      const sum = o.summary ? ` — ${o.summary}` : "";
      return `- ${o.id}${tags}${sum}`;
    })
    .join("\n");
  return [
    "다음 엔드포인트 목록에서 사용자의 의도에 가장 알맞은 것 하나를 고르세요.",
    "목록에 있는 id를 정확히 그대로 operationId에 넣어 JSON으로만 답하세요.",
    "",
    "## 엔드포인트 목록",
    list,
    "",
    "## 사용자 의도",
    intent,
  ].join("\n");
}

/** AI 출력에서 유효한 operationId를 추출. JSON 우선, 실패 시 본문에서 매칭. 유효하지 않으면 null. */
export function parseRouteId(raw: string, validIds: string[]): string | null {
  const valid = new Set(validIds);
  // 1) JSON 객체 파싱 시도(코드펜스 제거)
  const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as { operationId?: unknown };
      if (typeof obj.operationId === "string" && valid.has(obj.operationId)) return obj.operationId;
    } catch {
      /* 폴백 */
    }
  }
  // 2) 본문에서 유효 id가 그대로 등장하면 사용(가장 긴 것 우선 — "GET /pets/{id}" vs "GET /pets")
  const found = validIds
    .filter((id) => cleaned.includes(id))
    .sort((a, b) => b.length - a.length);
  return found[0] ?? null;
}
