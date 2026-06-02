// mock 데이터 생성기. OpenAPI ParsedSchema로부터 결정적(시드 기반) 가짜 데이터를 생성한다.
// Rust axum mock 서버가 이 데이터를 HTTP 응답으로 제공한다.

import type { ParsedOperation, ParsedSchema } from "./types";

// ────────────────────────────────────────────────
// 공개 타입
// ────────────────────────────────────────────────

export interface GenerateOptions {
  seed: number;
  fieldName?: string;
  index?: number;
}

export interface ItemSchemaInfo {
  itemSchema: ParsedSchema;
  listWrapper?: string;
  isList: boolean;
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
// 내부 도메인 데이터
// ────────────────────────────────────────────────

const KOREAN_SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "전"];
const KOREAN_GIVEN_NAMES = ["민준", "서준", "도윤", "예준", "시우", "주원", "지우", "준서", "준우", "현우", "서연", "서윤", "지우", "서현", "민서", "하은", "하윤", "윤서", "지유", "채원"];

const EMAIL_USERS = ["user", "admin", "test", "info", "support", "dev", "api", "service", "web", "app"];
const EMAIL_DOMAINS = ["example.com", "test.org", "sample.net", "mock.io", "demo.co.kr"];

const SAMPLE_WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar"];

const DESCRIPTIONS = [
  "샘플 데이터입니다.",
  "테스트용 설명입니다.",
  "이 항목에 대한 간략한 설명입니다.",
  "상세 내용을 여기에 입력합니다.",
  "목 서버가 생성한 예시 설명입니다.",
];

const KOREAN_ADDRESSES = [
  "서울특별시 강남구 테헤란로 123",
  "서울특별시 마포구 홍익로 456",
  "경기도 성남시 분당구 판교로 789",
  "부산광역시 해운대구 센텀중앙로 10",
  "인천광역시 연수구 송도대로 200",
];

const HTTPS_URLS = [
  "https://example.com/image.png",
  "https://sample.org/photo.jpg",
  "https://demo.io/resource/1",
  "https://mock.co.kr/asset/2",
  "https://test.net/file/3",
];

// ────────────────────────────────────────────────
// Task 2: 도메인 인식 생성 함수
// ────────────────────────────────────────────────

/** 시드 기반으로 배열에서 하나를 선택한다 */
function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 시드 기반 정수 [min, max] 생성 */
function randInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 시드 기반 UUID v4 형식 생성 */
function generateUUID(rng: () => number): string {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const seg = (n: number) => Array.from({ length: n }, hex).join("");
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${["8", "9", "a", "b"][Math.floor(rng() * 4)]}${seg(3)}-${seg(12)}`;
}

/** 시드 기반 ISO 날짜-시간 생성 */
function generateDateTime(rng: () => number): string {
  const year = 2024 + Math.floor(rng() * 3); // 2024~2026
  const month = String(randInt(1, 12, rng)).padStart(2, "0");
  const day = String(randInt(1, 28, rng)).padStart(2, "0");
  const hour = String(randInt(0, 23, rng)).padStart(2, "0");
  const min = String(randInt(0, 59, rng)).padStart(2, "0");
  const sec = String(randInt(0, 59, rng)).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`;
}

/** 시드 기반 YYYY-MM-DD 생성 */
function generateDate(rng: () => number): string {
  const year = 2024 + Math.floor(rng() * 3);
  const month = String(randInt(1, 12, rng)).padStart(2, "0");
  const day = String(randInt(1, 28, rng)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 시드 기반 이메일 생성 */
function generateEmail(rng: () => number): string {
  const num = randInt(1, 99, rng);
  const user = pick(EMAIL_USERS, rng);
  const domain = pick(EMAIL_DOMAINS, rng);
  return `${user}${num}.${pick(["alpha", "beta", "gamma"], rng)}@${domain}`;
}

/** 시드 기반 한국 전화번호 생성 */
function generatePhone(rng: () => number): string {
  const mid = String(randInt(1000, 9999, rng));
  const end = String(randInt(1000, 9999, rng));
  return `010-${mid}-${end}`;
}

/** format 기반 문자열 생성 (최우선) */
function generateStringByFormat(format: string, rng: () => number): string | null {
  switch (format) {
    case "date-time":
      return generateDateTime(rng);
    case "date":
      return generateDate(rng);
    case "email":
      return generateEmail(rng);
    case "uuid":
      return generateUUID(rng);
    case "uri":
    case "url":
      return pick(HTTPS_URLS, rng);
    default:
      return null;
  }
}

/** 필드명 패턴 기반 문자열 생성 */
function generateStringByFieldName(fieldName: string, rng: () => number): string | null {
  const lower = fieldName.toLowerCase();

  if (/email/.test(lower)) {
    return generateEmail(rng);
  }
  // name/username/이름 패턴 (fileName 같은 복합어는 "file"이 앞에 붙으므로 name으로 끝나거나 ^name이거나 username 등)
  if (/(?:^|[^a-z])name$|^name$|username|이름/.test(lower)) {
    return pick(KOREAN_SURNAMES, rng) + pick(KOREAN_GIVEN_NAMES, rng);
  }
  if (/at$|date|time/.test(lower)) {
    return generateDateTime(rng);
  }
  if (/phone|mobile|tel/.test(lower)) {
    return generatePhone(rng);
  }
  if (/url|image|href|link|photo/.test(lower)) {
    return pick(HTTPS_URLS, rng);
  }
  if (/address|주소/.test(lower)) {
    return pick(KOREAN_ADDRESSES, rng);
  }
  if (/description|desc|summary|메모|비고/.test(lower)) {
    return pick(DESCRIPTIONS, rng);
  }

  return null;
}

/** 필드명 패턴 기반 정수 생성 */
function generateIntegerByFieldName(
  fieldName: string,
  index: number | undefined,
  rng: () => number,
): number | null {
  const lower = fieldName.toLowerCase();

  // id로 끝나는 필드 → 순번
  if (/id$/.test(lower)) {
    return (index ?? 0) + 1;
  }
  if (/price|amount|cost|금액|가격/.test(lower)) {
    return (randInt(1, 100, rng)) * 1000;
  }
  if (/count|total|size|개수/.test(lower)) {
    return randInt(0, 99, rng);
  }
  if (/age|나이/.test(lower)) {
    return randInt(20, 69, rng);
  }

  return null;
}

// ────────────────────────────────────────────────
// Task 1 + 2: 핵심 생성 함수
// ────────────────────────────────────────────────

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
    case "string": {
      // format 우선
      if (schema.format) {
        const fromFormat = generateStringByFormat(schema.format, rng);
        if (fromFormat !== null) return fromFormat;
      }
      // 필드명 도메인 인식
      if (opts.fieldName) {
        const fromField = generateStringByFieldName(opts.fieldName, rng);
        if (fromField !== null) return fromField;
      }
      // 기본: 샘플 단어
      return pick(SAMPLE_WORDS, rng);
    }

    case "integer": {
      if (opts.fieldName) {
        const fromField = generateIntegerByFieldName(opts.fieldName, opts.index, rng);
        if (fromField !== null) return fromField;
      }
      return randInt(1, 1000, rng);
    }

    case "number": {
      return Math.round(rng() * 9999 * 100) / 100;
    }

    case "boolean": {
      return rng() < 0.5;
    }

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

// ────────────────────────────────────────────────
// Task 3: extractItemSchema + generateDataset
// ────────────────────────────────────────────────

/** 페이징 래퍼로 인식하는 배열 속성 키 */
const PAGING_KEYS = ["content", "data", "items", "list", "results", "rows"] as const;

/**
 * 응답 스키마에서 아이템 스키마 정보를 추출한다.
 * - 배열 스키마 → isList=true
 * - 페이징 래퍼 object → isList=true, listWrapper 지정
 * - 일반 object → isList=false (단건)
 * - undefined → null
 */
export function extractItemSchema(schema: ParsedSchema | undefined): ItemSchemaInfo | null {
  if (!schema) return null;

  if (schema.type === "array") {
    return {
      itemSchema: schema.items ?? { type: "unknown" },
      isList: true,
    };
  }

  if (schema.type === "object" && schema.properties) {
    for (const key of PAGING_KEYS) {
      const prop = schema.properties[key];
      if (prop && prop.type === "array") {
        return {
          itemSchema: prop.items ?? { type: "unknown" },
          listWrapper: key,
          isList: true,
        };
      }
    }
  }

  // 단건 object (또는 기타 타입)
  return {
    itemSchema: schema,
    isList: false,
  };
}

/**
 * ParsedOperation의 2xx 응답 스키마로부터 mock 데이터셋을 생성한다.
 * - isList면 count개, 단건이면 1개
 * - 각 아이템의 시드: seed * 7919 + i (id 필드가 1,2,3... 순번이 됨)
 */
export function generateDataset(
  operation: ParsedOperation,
  count: number,
  seed: number,
): unknown[] {
  // 2xx 응답 중 스키마가 있는 첫 번째 응답 사용
  const twoxxResponse = operation.responses.find(
    (r) => r.statusCode.startsWith("2") && r.schema,
  );
  if (!twoxxResponse?.schema) return [];

  const info = extractItemSchema(twoxxResponse.schema);
  if (!info) return [];

  const itemCount = info.isList ? count : 1;

  return Array.from({ length: itemCount }, (_, i) => {
    const itemSeed = ((seed * 7919 + i) >>> 0);
    return generateFromSchema(info.itemSchema, { seed: itemSeed, index: i });
  });
}
