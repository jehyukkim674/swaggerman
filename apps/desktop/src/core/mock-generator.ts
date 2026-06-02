// mock 데이터 생성기. OpenAPI ParsedSchema로부터 결정적(시드 기반) 가짜 데이터를 생성한다.
// Rust axum mock 서버가 이 데이터를 HTTP 응답으로 제공한다.

import type { ParsedSchema } from "./types";

// ────────────────────────────────────────────────
// 공개 타입
// ────────────────────────────────────────────────

export interface GenerateOptions {
  seed: number;
  fieldName?: string;
  index?: number;
}

// ────────────────────────────────────────────────
// Task 1: 시드 PRNG + 해시
// ────────────────────────────────────────────────

/**
 * Mulberry32 — 32비트 시드 기반 PRNG.
 * 호출할 때마다 [0, 1) float을 반환하는 함수를 돌려준다.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0; // unsigned 32비트로 정규화
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    t ^= t >>> 14;
    return ((t >>> 0) / 0x100000000);
  };
}

/**
 * 문자열 → 안정적 숫자 해시 (djb2 변형).
 * 같은 입력은 항상 같은 숫자를 반환한다.
 */
export function hashString(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
    hash = hash >>> 0; // unsigned 유지
  }
  return hash;
}

// ────────────────────────────────────────────────
// 내부 유틸
// ────────────────────────────────────────────────

/** 시드 기반으로 배열에서 하나를 선택한다 */
function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 시드 기반 정수 [min, max] 생성 */
function randInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const SAMPLE_WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar"];

/**
 * ParsedSchema에서 결정적으로 mock 값을 생성한다.
 * opts.seed가 같으면 항상 같은 결과를 반환한다.
 */
export function generateFromSchema(
  schema: ParsedSchema | undefined,
  opts: GenerateOptions,
): unknown {
  if (!schema) return null;

  const rng = mulberry32(opts.seed);

  // example 우선 적용
  if (schema.example !== undefined) {
    const raw = schema.example;
    switch (schema.type) {
      case "integer":
      case "number": {
        const n = Number(raw);
        return Number.isNaN(n) ? raw : n;
      }
      case "boolean":
        return raw === "true";
      default:
        return raw;
    }
  }

  // enumValues 처리
  if (schema.enumValues && schema.enumValues.length > 0) {
    return pick(schema.enumValues, rng);
  }

  switch (schema.type) {
    case "string":
      return pick(SAMPLE_WORDS, rng);

    case "integer":
      return randInt(1, 1000, rng);

    case "number":
      return Math.round(rng() * 9999 * 100) / 100;

    case "boolean":
      return rng() < 0.5;

    case "object": {
      const obj: Record<string, unknown> = {};
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const childSeed = (opts.seed * 31 + hashString(key)) >>> 0;
          obj[key] = generateFromSchema(propSchema, {
            seed: childSeed,
            fieldName: key,
            index: opts.index,
          });
        }
      }
      return obj;
    }

    case "array": {
      if (!schema.items) return [];
      return Array.from({ length: 3 }, (_, i) => {
        const childSeed = (opts.seed * 31 + i) >>> 0;
        return generateFromSchema(schema.items, {
          seed: childSeed,
          index: i,
        });
      });
    }

    default:
      return null;
  }
}
