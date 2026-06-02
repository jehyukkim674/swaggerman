// AI mock 데이터셋 생성 프롬프트 빌더 + 파서.
// buildMockDatasetPrompt: ParsedOperation과 개수를 받아 LLM 지시문을 생성한다.
// parseMockDatasetResponse: LLM 출력을 JSON 배열로 파싱한다.

import type { ParsedOperation, ParsedSchema } from "../types";
import { extractItemSchema } from "../mock-generator";

// ────────────────────────────────────────────────
// 시스템 프롬프트 상수
// ────────────────────────────────────────────────

/** AI mock 데이터 생성기용 시스템 프롬프트. */
export const MOCK_DATASET_SYSTEM =
  "너는 API mock 데이터 생성기다. 요청된 스키마에 맞는 JSON 배열만 출력한다. " +
  "설명, 코멘트, 마크다운 없이 순수 JSON 배열([...])만 응답한다.";

// ────────────────────────────────────────────────
// 내부 헬퍼: 스키마 → 사람이 읽을 수 있는 텍스트
// ────────────────────────────────────────────────

/** ParsedSchema의 필드 목록을 "필드명: 타입 (enum: a, b, c)" 형태로 변환한다. */
function schemaToText(schema: ParsedSchema | undefined, indent = ""): string {
  if (!schema) return `${indent}(스키마 없음)`;

  if (schema.type === "object" && schema.properties) {
    const lines: string[] = [];
    for (const [field, prop] of Object.entries(schema.properties)) {
      if (prop.enumValues && prop.enumValues.length > 0) {
        lines.push(`${indent}- ${field}: ${prop.type} (enum: ${prop.enumValues.join(", ")})`);
      } else if (prop.format) {
        lines.push(`${indent}- ${field}: ${prop.type} (format: ${prop.format})`);
      } else {
        lines.push(`${indent}- ${field}: ${prop.type}`);
      }
    }
    return lines.length > 0 ? lines.join("\n") : `${indent}(빈 object)`;
  }

  if (schema.type === "array" && schema.items) {
    return schemaToText(schema.items, indent);
  }

  if (schema.enumValues && schema.enumValues.length > 0) {
    return `${indent}${schema.type} (enum: ${schema.enumValues.join(", ")})`;
  }

  return `${indent}${schema.type}`;
}

// ────────────────────────────────────────────────
// 공개 함수
// ────────────────────────────────────────────────

/**
 * AI에게 보낼 mock 데이터셋 생성 지시 프롬프트를 빌드한다.
 *
 * 포함 내용:
 * - API 메서드 + 경로
 * - summary (있을 때만)
 * - 아이템 스키마의 필드 목록 (타입, enum 값 포함)
 * - 현실적인 한국어 데이터 N개 요구사항
 */
export function buildMockDatasetPrompt(operation: ParsedOperation, count: number): string {
  const lines: string[] = [];

  lines.push(`API: ${operation.method} ${operation.path}`);

  if (operation.summary) {
    lines.push(`설명: ${operation.summary}`);
  }

  // 2xx 응답 스키마에서 아이템 스키마 추출
  const twoxxResponse = operation.responses.find((r) => r.statusCode.startsWith("2"));
  const itemInfo = extractItemSchema(twoxxResponse?.schema);

  if (itemInfo) {
    lines.push("");
    lines.push("응답 아이템 스키마:");
    lines.push(schemaToText(itemInfo.itemSchema));
  }

  lines.push("");
  lines.push(`요구사항:`);
  lines.push(`- 위 스키마에 맞는 현실적인 한국어 데이터를 ${count}개 생성한다.`);
  lines.push(`- 도메인 맥락에 맞는 자연스러운 값을 사용한다 (예: 이름은 한국어 이름, 주소는 한국 주소).`);
  lines.push(`- enum이 정의된 필드는 반드시 정의된 enum 값만 사용한다.`);
  lines.push(`- id, userId, productId 등 식별자 필드는 서로 다른 값(1, 2, 3...)을 사용한다.`);
  lines.push(`- JSON 배열([...])만 출력한다. 설명이나 마크다운 없이 순수 JSON만.`);

  return lines.join("\n");
}

// ────────────────────────────────────────────────
// 응답 파서
// ────────────────────────────────────────────────

/**
 * AI 응답 텍스트에서 JSON 배열을 추출·파싱한다.
 *
 * 처리 순서:
 * 1. 마크다운 코드블록(```json ... ```) 안의 JSON 파싱 시도
 * 2. 텍스트 전체를 JSON으로 직접 파싱 시도
 * 3. 객체 래핑({"items": [...]}) → 첫 배열 속성 반환
 * 4. 텍스트 중간 배열([...]) 추출 시도
 * 5. 모두 실패 → Error throw
 */
export function parseMockDatasetResponse(text: string): unknown[] {
  // 1. 마크다운 코드블록 제거 후 파싱
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeFenceMatch) {
    const inner = codeFenceMatch[1].trim();
    try {
      const parsed = JSON.parse(inner);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "object" && parsed !== null) {
        const arr = findFirstArray(parsed as Record<string, unknown>);
        if (arr !== null) return arr;
      }
    } catch {
      // 코드블록 내 파싱 실패 → 다음 단계로
    }
  }

  // 2. 전체 텍스트를 JSON으로 직접 파싱
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
    // 3. 객체 래핑 처리
    if (typeof parsed === "object" && parsed !== null) {
      const arr = findFirstArray(parsed as Record<string, unknown>);
      if (arr !== null) return arr;
    }
  } catch {
    // JSON 파싱 실패 → 다음 단계로
  }

  // 4. 텍스트 중간에 있는 JSON 배열 추출 시도
  const arrayMatch = text.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[1]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 추출 실패 → throw
    }
  }

  throw new Error(`AI 응답을 JSON 배열로 파싱할 수 없습니다.\n응답: ${text.slice(0, 200)}`);
}

/** 객체의 값 중 첫 번째 배열 속성을 반환한다. 없으면 null. */
function findFirstArray(obj: Record<string, unknown>): unknown[] | null {
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) return value;
  }
  return null;
}
