import type { HTTPResponse, ParsedOperation, ParsedSchema } from "../types";
import type { RequestInputs } from "../request-builder";

interface ContextArgs {
  op: ParsedOperation;
  inputs: RequestInputs | null;
  response: HTTPResponse | null;
  envVarNames: string[];
  baseURL: string;
  /** 성공 응답 스키마 개요 포함 여부. 폼 채우기는 요청만 필요하므로 false로 토큰을 줄인다. 기본 true. */
  includeResponseSchema?: boolean;
}

const MAX_BODY = 2000;

function schemaOutline(schema: ParsedSchema | undefined, depth = 0): string {
  if (!schema || depth > 4) return "";
  if (schema.type === "object" && schema.properties) {
    const req = new Set(schema.required ?? []);
    const lines = Object.entries(schema.properties).map(([k, sub]) => {
      const mark = req.has(k) ? "*" : "";
      const indent = "  ".repeat(depth + 1);
      if ((sub.type === "object" && sub.properties) || sub.type === "array") {
        const nested = schemaOutline(sub, depth + 1);
        const header = `${indent}- ${k}${mark}: ${sub.type}`;
        return nested ? `${header}\n${nested}` : header;
      }
      const t = sub.type ?? "unknown";
      return `${indent}- ${k}${mark}: ${t}`;
    });
    return lines.join("\n");
  }
  if (schema.type === "array") return `${"  ".repeat(depth + 1)}- [array of ${schema.items?.type ?? "unknown"}]`;
  return "";
}

/** 현재 엔드포인트/폼/환경/직전 응답을 claude용 컨텍스트 블록으로 조립한다(순수). */
export function buildAiContext(args: ContextArgs): string {
  const { op, inputs, response, envVarNames, baseURL, includeResponseSchema } = args;
  const parts: string[] = [];

  parts.push("## 현재 엔드포인트");
  parts.push(`${op.method} ${op.path}`);
  if (op.summary) parts.push(`요약: ${op.summary}`);
  if (op.description) parts.push(`설명: ${op.description}`);
  if (baseURL) parts.push(`Base URL: ${baseURL}`);

  if (op.parameters.length > 0) {
    parts.push("\n## 파라미터");
    for (const p of op.parameters) {
      const mark = p.required ? "*" : "";
      const extras: string[] = [];
      if (p.schema?.enumValues?.length) extras.push(`enum: ${p.schema.enumValues.join("|")}`);
      if (p.schema?.example != null && p.schema.example !== "") extras.push(`예: ${p.schema.example}`);
      else if (p.schema?.defaultValue != null && p.schema.defaultValue !== "")
        extras.push(`기본: ${p.schema.defaultValue}`);
      const suffix = extras.length ? ` (${extras.join(", ")})` : "";
      parts.push(`- (${p.location}) ${p.name}${mark}: ${p.schema?.type ?? "string"}${suffix}`);
    }
  }

  if (op.requestBody?.schema) {
    parts.push(`\n## 요청 본문(${op.requestBody.contentType})`);
    const outline = schemaOutline(op.requestBody.schema);
    if (outline) parts.push(outline);
  }

  if (includeResponseSchema !== false) {
    const okResp = op.responses.find((r) => /^2\d\d$/.test(r.statusCode));
    if (okResp?.schema) {
      parts.push(`\n## 성공 응답(${okResp.statusCode}) 스키마`);
      const outline = schemaOutline(okResp.schema);
      if (outline) parts.push(outline);
    }
  }

  if (inputs) {
    parts.push("\n## 현재 폼 상태");
    parts.push(`pathParams: ${JSON.stringify(inputs.pathParams)}`);
    // query/header 값은 비밀(api_key, token 등)일 수 있어 이름만 전달한다.
    const q = inputs.queryParams.filter((x) => x.enabled && x.key).map((x) => x.key);
    if (q.length) parts.push(`query 키: ${q.join(", ")}`);
    // inputs.headers는 의도적으로 제외: Authorization, API 키 등 인증 토큰이 포함될 수 있어 보안상 LLM에 전달하지 않는다.
    if (inputs.body) parts.push(`body:\n${inputs.body.slice(0, MAX_BODY)}`);
  }

  if (envVarNames.length > 0) {
    parts.push("\n## 사용 가능한 환경 변수(이름만, 값은 비공개)");
    parts.push(envVarNames.map((n) => `{{${n}}}`).join(", "));
  }

  if (response) {
    parts.push("\n## 직전 응답");
    parts.push(`status: ${response.statusCode} (${response.durationMs}ms)`);
    const body = response.body.slice(0, MAX_BODY);
    parts.push(`body:\n${body}${response.body.length > MAX_BODY ? "\n…(생략)" : ""}`);
  }

  return parts.join("\n");
}
