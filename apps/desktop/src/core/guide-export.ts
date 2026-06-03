// 스펙 + 히스토리 실제 예시 → Markdown 연동 가이드. 순수 함수.
import type { ParsedOperation, ParsedSpec } from "./types";
import type { HistoryItem } from "./history";
import { buildRequest, defaultInputs, type RequestInputs } from "./request-builder";
import { buildCurl } from "./curl-builder";
import { isSecretHeader } from "./share";

const REQUIRED_LABEL = "필수";
const OPTIONAL_LABEL = "선택";

/** 해당 opId의 최근 히스토리(executedAt 최대). 없으면 null. */
function latestHistory(history: HistoryItem[], opId: string): HistoryItem | null {
  const items = history.filter((h) => h.opId === opId);
  if (items.length === 0) return null;
  return items.reduce((a, b) => (b.executedAt > a.executedAt ? b : a));
}

/** 해당 opId의 최근 2xx 히스토리. */
function latestSuccess(history: HistoryItem[], opId: string): HistoryItem | null {
  const ok = history.filter((h) => h.opId === opId && h.status >= 200 && h.status < 300);
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (b.executedAt > a.executedAt ? b : a));
}

/** 민감 헤더를 제거한 inputs(헤더만 필터). */
function stripSecretHeaders(inputs: RequestInputs): RequestInputs {
  return { ...inputs, headers: inputs.headers.filter((h) => !isSecretHeader(h.key)) };
}

function paramTable(op: ParsedOperation): string {
  if (op.parameters.length === 0) return "";
  const rows = op.parameters
    .map((p) => `| ${p.name} | ${p.location} | ${p.required ? REQUIRED_LABEL : OPTIONAL_LABEL} | ${p.schema?.type ?? "-"} |`)
    .join("\n");
  return `**파라미터**\n\n| 이름 | 위치 | 필수 | 타입 |\n|---|---|---|---|\n${rows}\n\n`;
}

function requestExample(op: ParsedOperation, history: HistoryItem[], baseURL: string): string {
  const h = latestHistory(history, op.id);
  const inputs = h ? stripSecretHeaders(h.inputs) : defaultInputs(op);
  const req = buildRequest(baseURL, op, inputs, {}, [], {});
  return `**요청 예시**\n\n\`\`\`bash\n${buildCurl(req)}\n\`\`\`\n\n`;
}

function responseExample(op: ParsedOperation, history: HistoryItem[]): string {
  const h = latestSuccess(history, op.id);
  let body: string | undefined;
  let status = "";
  if (h) {
    status = ` (${h.status})`;
    try {
      body = JSON.stringify(JSON.parse(h.responseBody), null, 2);
    } catch {
      body = h.responseBody;
    }
  } else {
    // ParsedResponse.statusCode (not .status)
    const ok = op.responses.find((r) => r.statusCode.startsWith("2"));
    if (ok && (ok as { example?: unknown }).example !== undefined) {
      status = ` (${ok.statusCode})`;
      const ex = (ok as { example?: unknown }).example;
      body = typeof ex === "string" ? ex : JSON.stringify(ex, null, 2);
    }
  }
  if (body === undefined) return "";
  const lang = body.trimStart().startsWith("{") || body.trimStart().startsWith("[") ? "json" : "";
  return `**응답 예시**${status}\n\n\`\`\`${lang}\n${body}\n\`\`\`\n\n`;
}

/** operation들의 연동 가이드 Markdown 생성. */
export function buildGuideMarkdown(
  spec: ParsedSpec,
  opIds: string[],
  history: HistoryItem[],
  baseURL: string,
): string {
  const parts: string[] = [
    `# ${spec.info.title} 연동 가이드\n`,
    `> 생성: SwaggerMan · Base URL: ${baseURL}\n`,
  ];
  for (const opId of opIds) {
    const op = spec.operations.find((o) => o.id === opId);
    if (!op) continue;
    const title = op.summary ? `${op.method} ${op.path} — ${op.summary}` : `${op.method} ${op.path}`;
    parts.push(`\n## ${title}\n`);
    const desc = op.description ?? "";
    if (desc) parts.push(`${desc}\n`);
    parts.push(paramTable(op));
    parts.push(requestExample(op, history, baseURL));
    parts.push(responseExample(op, history));
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
