# Mock 서버 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로드한 OpenAPI 스펙으로 외부 클라이언트가 호출 가능한 로컬 Mock HTTP 서버를 제공한다 — 응답 데이터는 스키마 자동 생성(시드)/AI/히스토리 3가지 소스로 다양하게 생성.

**Architecture:** 하이브리드 — TS가 "데이터셋"(아이템 배열)을 생성해 Tauri command로 Rust에 전달, Rust(axum)가 실제 HTTP 서빙(경로 매칭·페이징·단건 조회·지연·CORS)을 담당.

**Tech Stack:** Rust(axum 0.8, tokio), TypeScript(React 19), vitest, 기존 AI 인프라(Claude CLI `complete`).

**Spec:** `docs/superpowers/specs/2026-06-03-mock-server-design.md`

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `apps/desktop/src/core/mock-generator.ts` (신규) | 스키마 → fake 데이터 생성 (시드 PRNG, 필드명/포맷 인식) |
| `apps/desktop/src/core/mock-config.ts` (신규) | mock 설정 타입, localStorage 영속화, Rust 전송용 라우트 변환 |
| `apps/desktop/src/core/mock-client.ts` (신규) | Tauri command 호출 래퍼 (start/stop/logs) |
| `apps/desktop/src/core/ai/mock-prompt.ts` (신규) | AI 데이터셋 생성 (프롬프트 + 파싱) |
| `apps/desktop/src/components/MockServerModal.tsx` (신규) | Mock 서버 관리 UI |
| `apps/desktop/src-tauri/src/mock_server.rs` (신규) | axum HTTP 서버 + 서빙 규칙 |
| `apps/desktop/src-tauri/src/lib.rs` (수정) | mock command 등록 |
| `apps/desktop/src-tauri/Cargo.toml` (수정) | axum 의존성 추가 |
| `apps/desktop/src/App.tsx` (수정) | 상단바 Mock 버튼 + 모달 연결 |
| `apps/desktop/src/App.css` (수정) | mock 모달 스타일 |
| `apps/desktop/public/tauri-mock.js` (수정) | 브라우저 모드에서 mock command no-op 처리 |

모든 명령은 `apps/desktop/` 디렉터리에서 실행한다.

---

### Task 1: mock-generator — 시드 PRNG + 기본 타입 생성

**Files:**
- Create: `apps/desktop/src/core/mock-generator.ts`
- Test: `apps/desktop/src/core/mock-generator.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/desktop/src/core/mock-generator.test.ts
import { describe, it, expect } from "vitest";
import { generateFromSchema } from "./mock-generator";
import type { ParsedSchema } from "./types";

describe("generateFromSchema 기본 타입", () => {
  it("string 스키마는 문자열을 생성한다", () => {
    const schema: ParsedSchema = { type: "string" };
    expect(typeof generateFromSchema(schema, { seed: 1 })).toBe("string");
  });

  it("integer 스키마는 정수를 생성한다", () => {
    const v = generateFromSchema({ type: "integer" }, { seed: 1 });
    expect(Number.isInteger(v)).toBe(true);
  });

  it("number 스키마는 숫자를 생성한다", () => {
    expect(typeof generateFromSchema({ type: "number" }, { seed: 1 })).toBe("number");
  });

  it("boolean 스키마는 불리언을 생성한다", () => {
    expect(typeof generateFromSchema({ type: "boolean" }, { seed: 1 })).toBe("boolean");
  });

  it("enum이 있으면 그중 하나를 반환한다", () => {
    const schema: ParsedSchema = { type: "string", enumValues: ["A", "B", "C"] };
    expect(["A", "B", "C"]).toContain(generateFromSchema(schema, { seed: 1 }));
  });

  it("example이 있으면 example을 우선 사용한다", () => {
    const schema: ParsedSchema = { type: "string", example: "고정값" };
    expect(generateFromSchema(schema, { seed: 1 })).toBe("고정값");
  });

  it("object 스키마는 properties를 채운 객체를 생성한다", () => {
    const schema: ParsedSchema = {
      type: "object",
      properties: { age: { type: "integer" }, active: { type: "boolean" } },
    };
    const v = generateFromSchema(schema, { seed: 1 }) as Record<string, unknown>;
    expect(Number.isInteger(v.age)).toBe(true);
    expect(typeof v.active).toBe("boolean");
  });

  it("array 스키마는 items 타입의 배열을 생성한다", () => {
    const schema: ParsedSchema = { type: "array", items: { type: "integer" } };
    const v = generateFromSchema(schema, { seed: 1 }) as unknown[];
    expect(Array.isArray(v)).toBe(true);
    expect(v.length).toBeGreaterThan(0);
    expect(Number.isInteger(v[0])).toBe(true);
  });

  it("같은 시드면 같은 결과를 생성한다 (결정적)", () => {
    const schema: ParsedSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "integer" } },
    };
    expect(generateFromSchema(schema, { seed: 42 })).toEqual(
      generateFromSchema(schema, { seed: 42 }),
    );
  });

  it("다른 시드면 다른 결과를 생성한다", () => {
    const schema: ParsedSchema = { type: "object", properties: { a: { type: "integer" } } };
    expect(generateFromSchema(schema, { seed: 1 })).not.toEqual(
      generateFromSchema(schema, { seed: 2 }),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/mock-generator.test.ts`
Expected: FAIL — `Cannot find module './mock-generator'`

- [ ] **Step 3: 최소 구현**

```ts
// apps/desktop/src/core/mock-generator.ts
// 스키마 기반 mock 데이터 생성기. 시드 PRNG로 결정적(같은 시드 = 같은 데이터).
import type { ParsedSchema } from "./types";

export interface GenerateOptions {
  seed: number;
  /** 필드명(도메인 추론용). 재귀 호출 시 부모가 전달 */
  fieldName?: string;
  /** 배열/순번 생성 시 아이템 인덱스 */
  index?: number;
}

/** mulberry32 — 단순·빠른 시드 PRNG (0~1 float 반환) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "lima", "nova"];

/** ParsedSchema에서 mock 값 하나를 생성한다. */
export function generateFromSchema(schema: ParsedSchema | undefined, opts: GenerateOptions): unknown {
  if (!schema) return null;
  // example 최우선 (스펙 작성자가 의도한 값)
  if (schema.example !== undefined) return coerceExample(schema.example, schema.type);
  if (schema.enumValues && schema.enumValues.length > 0) {
    const rand = mulberry32(opts.seed);
    return schema.enumValues[Math.floor(rand() * schema.enumValues.length)];
  }

  const rand = mulberry32(opts.seed);
  switch (schema.type) {
    case "string":
      return generateString(schema, opts, rand);
    case "integer":
      return Math.floor(rand() * 1000) + 1;
    case "number":
      return Math.round(rand() * 10000) / 100;
    case "boolean":
      return rand() > 0.5;
    case "array": {
      const len = 3;
      return Array.from({ length: len }, (_, i) =>
        generateFromSchema(schema.items, { ...opts, seed: opts.seed * 31 + i, index: i }),
      );
    }
    case "object": {
      const out: Record<string, unknown> = {};
      const props = schema.properties ?? {};
      let i = 0;
      for (const [key, propSchema] of Object.entries(props)) {
        out[key] = generateFromSchema(propSchema, {
          ...opts,
          seed: opts.seed * 31 + hashString(key),
          fieldName: key,
        });
        i++;
      }
      void i;
      return out;
    }
    default:
      return null;
  }
}

/** Task 2에서 필드명/포맷 인식으로 확장. 지금은 단순 단어 생성 */
function generateString(schema: ParsedSchema, opts: GenerateOptions, rand: () => number): string {
  void schema;
  void opts;
  return SAMPLE_WORDS[Math.floor(rand() * SAMPLE_WORDS.length)];
}

/** example 값을 스키마 타입에 맞게 변환 (파서가 string으로 저장하므로) */
function coerceExample(example: string, type: ParsedSchema["type"]): unknown {
  if (type === "integer" || type === "number") {
    const n = Number(example);
    return Number.isNaN(n) ? example : n;
  }
  if (type === "boolean") return example === "true";
  return example;
}

/** 문자열 → 안정적 숫자 해시 (시드 분기를 위해) */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/mock-generator.test.ts`
Expected: PASS (9개)

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop/src/core/mock-generator.ts apps/desktop/src/core/mock-generator.test.ts
git commit -m "기능: mock 데이터 생성기 — 시드 PRNG 기반 스키마 타입별 생성

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: mock-generator — 필드명/포맷 도메인 인식

**Files:**
- Modify: `apps/desktop/src/core/mock-generator.ts` (generateString 교체)
- Test: `apps/desktop/src/core/mock-generator.test.ts` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

기존 테스트 파일 끝에 추가:

```ts
describe("generateFromSchema 필드명/포맷 인식", () => {
  const gen = (fieldName: string, format?: string) =>
    generateFromSchema({ type: "string", format } as ParsedSchema, { seed: 7, fieldName, index: 0 });

  it("email 필드는 이메일 형식", () => {
    expect(String(gen("email"))).toMatch(/^[\w.]+@[\w.]+\.[a-z]+$/);
    expect(String(gen("userEmail"))).toMatch(/@/);
  });

  it("name 필드는 한국어 이름", () => {
    expect(String(gen("userName"))).toMatch(/^[가-힣]{2,4}$/);
  });

  it("날짜 필드(…At/date)는 ISO 8601 형식", () => {
    expect(String(gen("createdAt"))).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(String(gen("birthDate"))).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("format=date-time이면 필드명과 무관하게 ISO 날짜", () => {
    expect(String(gen("anything", "date-time"))).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("format=uuid면 UUID 형식", () => {
    expect(String(gen("anything", "uuid"))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("phone 필드는 010 전화번호", () => {
    expect(String(gen("phoneNumber"))).toMatch(/^010-\d{4}-\d{4}$/);
  });

  it("url/image 필드는 URL", () => {
    expect(String(gen("imageUrl"))).toMatch(/^https:\/\//);
  });

  it("id 필드(integer)는 index+1 순번", () => {
    const v = generateFromSchema({ type: "integer" } as ParsedSchema, {
      seed: 7, fieldName: "id", index: 4,
    });
    expect(v).toBe(5);
  });

  it("price/amount 필드는 1000 단위 금액", () => {
    const v = generateFromSchema({ type: "integer" } as ParsedSchema, {
      seed: 7, fieldName: "price", index: 0,
    });
    expect((v as number) % 100).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/mock-generator.test.ts`
Expected: FAIL (새 테스트들)

- [ ] **Step 3: 구현 — generateString 교체 + integer 필드명 처리**

`mock-generator.ts`에서 `generateString` 함수를 아래로 교체하고, `case "integer":`를 수정:

```ts
const KOREAN_FAMILY = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
const KOREAN_GIVEN = ["민준", "서연", "지호", "수진", "예은", "도윤", "하은", "지우", "현우", "서준"];
const DOMAINS = ["example.com", "test.co.kr", "mock.dev"];

function generateString(schema: ParsedSchema, opts: GenerateOptions, rand: () => number): string {
  const field = (opts.fieldName ?? "").toLowerCase();
  const format = (schema as { format?: string }).format ?? "";
  const idx = opts.index ?? 0;

  // format 우선
  if (format === "date-time") return isoDate(rand, false);
  if (format === "date") return isoDate(rand, true);
  if (format === "email") return email(rand, idx);
  if (format === "uuid") return uuid(rand);
  if (format === "uri" || format === "url") return `https://example.com/items/${idx + 1}`;

  // 필드명 추론
  if (/email/.test(field)) return email(rand, idx);
  if (/(^|_)name$|username|이름/.test(field)) return koreanName(rand);
  if (/at$|date|time/.test(field)) return isoDate(rand, /date$/.test(field));
  if (/phone|mobile|tel/.test(field)) return phone(rand);
  if (/url|image|href|link|photo/.test(field)) return `https://example.com/img/${idx + 1}.png`;
  if (/address|주소/.test(field)) return `서울시 강남구 테헤란로 ${Math.floor(rand() * 500) + 1}`;
  if (/description|desc|summary|메모|비고/.test(field)) return "mock 데이터 설명입니다";
  if (/(^|_)id$/.test(field)) return uuid(rand);

  return SAMPLE_WORDS[Math.floor(rand() * SAMPLE_WORDS.length)];
}

function isoDate(rand: () => number, dateOnly: boolean): string {
  const daysAgo = Math.floor(rand() * 365);
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return dateOnly ? d.toISOString().slice(0, 10) : d.toISOString();
}
function email(rand: () => number, idx: number): string {
  return `user${idx + 1}.${SAMPLE_WORDS[Math.floor(rand() * SAMPLE_WORDS.length)]}@${DOMAINS[Math.floor(rand() * DOMAINS.length)]}`;
}
function koreanName(rand: () => number): string {
  return KOREAN_FAMILY[Math.floor(rand() * KOREAN_FAMILY.length)] + KOREAN_GIVEN[Math.floor(rand() * KOREAN_GIVEN.length)];
}
function phone(rand: () => number): string {
  const mid = String(Math.floor(rand() * 9000) + 1000);
  const last = String(Math.floor(rand() * 9000) + 1000);
  return `010-${mid}-${last}`;
}
function uuid(rand: () => number): string {
  const hex = () => Math.floor(rand() * 16).toString(16);
  return `${Array.from({ length: 8 }, hex).join("")}-${Array.from({ length: 4 }, hex).join("")}-4${Array.from({ length: 3 }, hex).join("")}-${Array.from({ length: 4 }, hex).join("")}-${Array.from({ length: 12 }, hex).join("")}`;
}
```

`case "integer":`를 아래로 교체:

```ts
    case "integer": {
      const field = (opts.fieldName ?? "").toLowerCase();
      if (/(^|_)id$|Id$/.test(opts.fieldName ?? "")) return (opts.index ?? 0) + 1;
      if (/price|amount|cost|금액|가격/.test(field)) return (Math.floor(rand() * 100) + 1) * 1000;
      if (/count|total|size|개수/.test(field)) return Math.floor(rand() * 100);
      if (/age|나이/.test(field)) return Math.floor(rand() * 50) + 20;
      return Math.floor(rand() * 1000) + 1;
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/mock-generator.test.ts`
Expected: PASS (18개)

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop/src/core/mock-generator.ts apps/desktop/src/core/mock-generator.test.ts
git commit -m "기능: mock 생성기 필드명/포맷 도메인 인식 — 이메일·한국 이름·날짜·전화·금액

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: mock-generator — generateDataset (목록 스키마 인식)

**Files:**
- Modify: `apps/desktop/src/core/mock-generator.ts`
- Test: `apps/desktop/src/core/mock-generator.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
import { generateDataset, extractItemSchema } from "./mock-generator";
import type { ParsedOperation } from "./types";

function op(responseSchema: ParsedSchema): ParsedOperation {
  return {
    id: "GET /items",
    method: "GET",
    path: "/items",
    tags: [],
    parameters: [],
    responses: [{ status: "200", schema: responseSchema }],
  };
}

describe("generateDataset", () => {
  const itemSchema: ParsedSchema = {
    type: "object",
    properties: { id: { type: "integer" }, name: { type: "string" } },
  };

  it("응답이 배열이면 items 스키마로 N개 생성", () => {
    const ds = generateDataset(op({ type: "array", items: itemSchema }), 5, 1);
    expect(ds).toHaveLength(5);
    expect((ds[0] as Record<string, unknown>).id).toBe(1);
    expect((ds[4] as Record<string, unknown>).id).toBe(5); // id는 index+1 순번
  });

  it("응답이 페이징 래퍼(content 배열 속성)면 래퍼 안 items로 생성", () => {
    const wrapper: ParsedSchema = {
      type: "object",
      properties: {
        content: { type: "array", items: itemSchema },
        totalElements: { type: "integer" },
      },
    };
    const ds = generateDataset(op(wrapper), 3, 1);
    expect(ds).toHaveLength(3);
    expect((ds[0] as Record<string, unknown>).name).toBeDefined();
  });

  it("응답이 단건 object면 1개 생성", () => {
    const ds = generateDataset(op(itemSchema), 10, 1);
    expect(ds).toHaveLength(1);
  });

  it("같은 시드로 두 번 생성하면 동일", () => {
    const o = op({ type: "array", items: itemSchema });
    expect(generateDataset(o, 3, 9)).toEqual(generateDataset(o, 3, 9));
  });
});

describe("extractItemSchema", () => {
  it("배열 응답 → items, 래퍼 키 반환 없음", () => {
    const r = extractItemSchema({ type: "array", items: { type: "string" } });
    expect(r?.itemSchema.type).toBe("string");
    expect(r?.listWrapper).toBeUndefined();
  });

  it("페이징 래퍼 → 배열 속성명을 listWrapper로 반환 (content/data/items/list/results)", () => {
    const r = extractItemSchema({
      type: "object",
      properties: { data: { type: "array", items: { type: "integer" } } },
    });
    expect(r?.listWrapper).toBe("data");
    expect(r?.itemSchema.type).toBe("integer");
  });

  it("단건 object → 자기 자신, 래퍼 없음", () => {
    const r = extractItemSchema({ type: "object", properties: {} });
    expect(r?.listWrapper).toBeUndefined();
    expect(r?.itemSchema.type).toBe("object");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/mock-generator.test.ts`
Expected: FAIL — `generateDataset is not a function`

- [ ] **Step 3: 구현 추가**

`mock-generator.ts` 끝에 추가:

```ts
import type { ParsedOperation } from "./types"; // 파일 상단 import에 합치기

const LIST_WRAPPER_KEYS = ["content", "data", "items", "list", "results", "rows"];

export interface ItemSchemaInfo {
  itemSchema: ParsedSchema;
  /** 목록이 래퍼 객체 안에 있으면 그 속성명 (예: "content") */
  listWrapper?: string;
  /** 응답이 목록인지 (false면 단건) */
  isList: boolean;
}

/** 200 응답 스키마에서 "아이템" 스키마와 목록 래퍼 구조를 추출한다. */
export function extractItemSchema(schema: ParsedSchema | undefined): ItemSchemaInfo | null {
  if (!schema) return null;
  if (schema.type === "array" && schema.items) {
    return { itemSchema: schema.items, isList: true };
  }
  if (schema.type === "object" && schema.properties) {
    for (const key of LIST_WRAPPER_KEYS) {
      const prop = schema.properties[key];
      if (prop?.type === "array" && prop.items) {
        return { itemSchema: prop.items, listWrapper: key, isList: true };
      }
    }
    return { itemSchema: schema, isList: false };
  }
  return { itemSchema: schema, isList: false };
}

/** operation의 2xx 응답 스키마 기준으로 데이터셋(아이템 배열)을 생성한다.
 *  단건 응답이면 길이 1 배열. */
export function generateDataset(operation: ParsedOperation, count: number, seed: number): unknown[] {
  const ok = operation.responses.find((r) => r.status.startsWith("2"));
  const info = extractItemSchema(ok?.schema);
  if (!info) return [];
  const n = info.isList ? count : 1;
  return Array.from({ length: n }, (_, i) =>
    generateFromSchema(info.itemSchema, { seed: seed * 7919 + i, index: i }),
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/mock-generator.test.ts`
Expected: PASS (25개)

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop/src/core/mock-generator.ts apps/desktop/src/core/mock-generator.test.ts
git commit -m "기능: mock 데이터셋 생성 — 배열/페이징 래퍼/단건 응답 스키마 인식

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: mock-config — 설정 관리 + Rust 라우트 변환

**Files:**
- Create: `apps/desktop/src/core/mock-config.ts`
- Test: `apps/desktop/src/core/mock-config.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/desktop/src/core/mock-config.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultMockConfig,
  loadMockConfig,
  saveMockConfig,
  buildMockRoutes,
  type MockServerConfig,
} from "./mock-config";
import type { ParsedSpec, ParsedOperation } from "./types";

const listOp: ParsedOperation = {
  id: "GET /pets", method: "GET", path: "/pets", tags: ["pet"], parameters: [],
  responses: [{
    status: "200",
    schema: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } } },
  }],
};
const getOneOp: ParsedOperation = {
  id: "GET /pets/{petId}", method: "GET", path: "/pets/{petId}", tags: ["pet"],
  parameters: [{ id: "p1", name: "petId", location: "path", required: true }],
  responses: [{ status: "200", schema: { type: "object", properties: { id: { type: "integer" } } } }],
};
const postOp: ParsedOperation = {
  id: "POST /pets", method: "POST", path: "/pets", tags: ["pet"], parameters: [],
  responses: [{ status: "201", example: { id: 1, name: "코코" } }],
};
const spec = {
  info: { title: "t", version: "1" },
  operations: [listOp, getOneOp, postOp],
  securitySchemes: [],
} as unknown as ParsedSpec;

beforeEach(() => localStorage.clear());

describe("mock-config 저장/복원", () => {
  it("기본 설정: 모든 operation enabled, source=schema, port=9090", () => {
    const cfg = defaultMockConfig(spec);
    expect(cfg.port).toBe(9090);
    expect(cfg.operations).toHaveLength(3);
    expect(cfg.operations[0]).toMatchObject({ enabled: true, source: "schema", itemCount: 20 });
  });

  it("저장 후 로드하면 동일 설정 복원", () => {
    const cfg = defaultMockConfig(spec);
    cfg.port = 9999;
    cfg.operations[0].itemCount = 5;
    saveMockConfig("https://api.test/spec.json", cfg);
    const loaded = loadMockConfig("https://api.test/spec.json", spec);
    expect(loaded.port).toBe(9999);
    expect(loaded.operations[0].itemCount).toBe(5);
  });

  it("저장된 설정에 없는 새 operation은 기본값으로 채워진다", () => {
    const cfg: MockServerConfig = { port: 9090, operations: [] };
    saveMockConfig("https://api.test/spec.json", cfg);
    const loaded = loadMockConfig("https://api.test/spec.json", spec);
    expect(loaded.operations).toHaveLength(3);
  });
});

describe("buildMockRoutes", () => {
  it("목록 GET operation은 dataset 라우트로 변환", () => {
    const cfg = defaultMockConfig(spec);
    cfg.operations.find((o) => o.opId === "GET /pets")!.dataset = [{ id: 1, name: "a" }];
    const routes = buildMockRoutes(spec, cfg);
    const r = routes.find((x) => x.path === "/pets" && x.method === "GET")!;
    expect(r.dataset).toEqual([{ id: 1, name: "a" }]);
    expect(r.status).toBe(200);
  });

  it("path param GET operation은 같은 dataset을 공유하고 idField를 갖는다", () => {
    const cfg = defaultMockConfig(spec);
    cfg.operations.find((o) => o.opId === "GET /pets")!.dataset = [{ id: 1 }];
    const routes = buildMockRoutes(spec, cfg);
    const r = routes.find((x) => x.path === "/pets/{petId}")!;
    expect(r.dataset).toEqual([{ id: 1 }]); // 목록 라우트의 dataset 공유
    expect(r.idField).toBe("id");
  });

  it("POST operation은 스펙 example을 body로 사용, 상태코드는 응답 정의를 따름", () => {
    const cfg = defaultMockConfig(spec);
    const routes = buildMockRoutes(spec, cfg);
    const r = routes.find((x) => x.method === "POST")!;
    expect(r.body).toEqual({ id: 1, name: "코코" });
    expect(r.status).toBe(201);
  });

  it("enabled=false인 operation은 라우트에서 제외", () => {
    const cfg = defaultMockConfig(spec);
    cfg.operations.forEach((o) => (o.enabled = false));
    expect(buildMockRoutes(spec, cfg)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/mock-config.test.ts`
Expected: FAIL — `Cannot find module './mock-config'`

- [ ] **Step 3: 구현**

```ts
// apps/desktop/src/core/mock-config.ts
// Mock 서버 설정: operation별 응답 소스/데이터셋 관리 + Rust 전송용 라우트 변환.
import type { ParsedOperation, ParsedSpec } from "./types";
import { loadJSON, saveJSON } from "./storage";
import { generateDataset, extractItemSchema } from "./mock-generator";

export type MockSource = "schema" | "ai" | "history" | "manual";

export interface MockOperationConfig {
  opId: string;
  enabled: boolean;
  source: MockSource;
  /** 목록 operation용 데이터셋 (생성/편집 결과) */
  dataset?: unknown[];
  /** 단건/비-GET operation용 고정 응답 */
  body?: unknown;
  status: number;
  delayMs: number;
  itemCount: number;
  seed: number;
}

export interface MockServerConfig {
  port: number;
  operations: MockOperationConfig[];
}

/** Rust mock_start로 보내는 라우트 (serde camelCase와 일치) */
export interface MockRoute {
  method: string;
  path: string;
  status: number;
  dataset?: unknown[];
  body?: unknown;
  delayMs: number;
  idField?: string;
  /** 목록 응답을 감싸는 래퍼 속성명 (예: "content"). 없으면 배열 그대로 */
  listWrapper?: string;
}

export const DEFAULT_MOCK_PORT = 9090;

function storageKey(specUrl: string): string {
  return `swaggerman.mock.${specUrl}`;
}

function defaultOperationConfig(op: ParsedOperation): MockOperationConfig {
  const ok = op.responses.find((r) => r.status.startsWith("2"));
  return {
    opId: op.id,
    enabled: true,
    source: "schema",
    status: ok ? Number(ok.status) || 200 : 200,
    delayMs: 0,
    itemCount: 20,
    seed: 1,
  };
}

export function defaultMockConfig(spec: ParsedSpec): MockServerConfig {
  return {
    port: DEFAULT_MOCK_PORT,
    operations: spec.operations.map(defaultOperationConfig),
  };
}

export function loadMockConfig(specUrl: string, spec: ParsedSpec): MockServerConfig {
  const stored = loadJSON<MockServerConfig | null>(storageKey(specUrl), null);
  if (!stored) return defaultMockConfig(spec);
  // 스펙에 새로 생긴 operation은 기본값으로 채움
  const byId = new Map(stored.operations.map((o) => [o.opId, o]));
  return {
    port: stored.port || DEFAULT_MOCK_PORT,
    operations: spec.operations.map((op) => byId.get(op.id) ?? defaultOperationConfig(op)),
  };
}

export function saveMockConfig(specUrl: string, config: MockServerConfig): void {
  saveJSON(storageKey(specUrl), config);
}

/** GET이고 path param이 없는 operation = "목록" 후보 */
function isListOperation(op: ParsedOperation): boolean {
  return op.method === "GET" && !op.path.includes("{");
}

/** path param GET이 공유할 목록 operation 찾기: /pets/{petId} → /pets */
function findParentListPath(op: ParsedOperation): string {
  return op.path.replace(/\/\{[^}]+\}.*$/, "");
}

/** 설정 + 스펙 → Rust로 보낼 라우트 목록. 데이터셋이 없는 schema 소스는 여기서 생성한다. */
export function buildMockRoutes(spec: ParsedSpec, config: MockServerConfig): MockRoute[] {
  const cfgById = new Map(config.operations.map((o) => [o.opId, o]));
  const routes: MockRoute[] = [];

  // 1패스: 목록 operation의 데이터셋 확보 (path param 라우트가 공유)
  const datasetByPath = new Map<string, unknown[]>();
  for (const op of spec.operations) {
    const cfg = cfgById.get(op.id);
    if (!cfg?.enabled || !isListOperation(op)) continue;
    const dataset =
      cfg.dataset ?? generateDataset(op, cfg.itemCount, cfg.seed);
    datasetByPath.set(op.path, dataset);
  }

  for (const op of spec.operations) {
    const cfg = cfgById.get(op.id);
    if (!cfg?.enabled) continue;

    const ok = op.responses.find((r) => r.status.startsWith("2"));
    const info = extractItemSchema(ok?.schema);

    if (isListOperation(op)) {
      routes.push({
        method: op.method,
        path: op.path,
        status: cfg.status,
        dataset: datasetByPath.get(op.path),
        delayMs: cfg.delayMs,
        listWrapper: info?.listWrapper,
      });
    } else if (op.method === "GET" && op.path.includes("{")) {
      // 단건 조회: 부모 목록의 dataset 공유 (없으면 자체 생성 1건)
      const parentDataset = datasetByPath.get(findParentListPath(op));
      routes.push({
        method: op.method,
        path: op.path,
        status: cfg.status,
        dataset: parentDataset ?? (cfg.dataset ?? generateDataset(op, 1, cfg.seed)),
        delayMs: cfg.delayMs,
        idField: "id",
      });
    } else {
      // POST/PUT/PATCH/DELETE 또는 기타: 고정 body (스펙 example > 설정 body > 스키마 생성)
      const body =
        cfg.body ?? ok?.example ?? (info ? generateDataset(op, 1, cfg.seed)[0] : { ok: true });
      routes.push({
        method: op.method,
        path: op.path,
        status: cfg.status,
        body,
        delayMs: cfg.delayMs,
      });
    }
  }
  return routes;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/mock-config.test.ts`
Expected: PASS (7개)

참고: `ParsedResponse.example`이 `unknown` 타입이라 POST 테스트의 `example: { id: 1, name: "코코" }`가 그대로 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop/src/core/mock-config.ts apps/desktop/src/core/mock-config.test.ts
git commit -m "기능: mock 설정 관리 — operation별 소스/데이터셋, localStorage 영속화, Rust 라우트 변환

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Rust mock_server — axum 서버 + 라우트 매칭 + 서빙 규칙

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml` (axum 추가)
- Create: `apps/desktop/src-tauri/src/mock_server.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (mod 선언 + command 등록)

- [ ] **Step 1: Cargo.toml에 axum 추가**

`[dependencies]` 섹션에 추가:

```toml
axum = "0.8"
```

- [ ] **Step 2: 실패하는 Rust 테스트 작성 (mock_server.rs 파일에 함께)**

`apps/desktop/src-tauri/src/mock_server.rs` 생성 — 타입/시그니처 + 테스트 먼저:

```rust
// Mock HTTP 서버: TS에서 받은 라우트 설정으로 axum 서버를 띄워 외부 클라이언트에 응답한다.
// 데이터 "생성"은 TS 담당, 여기는 "서빙"(경로 매칭·페이징·단건 조회·지연·CORS)만 담당.
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRoute {
    pub method: String,
    pub path: String,
    pub status: u16,
    #[serde(default)]
    pub dataset: Option<Vec<Value>>,
    #[serde(default)]
    pub body: Option<Value>,
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default)]
    pub id_field: Option<String>,
    #[serde(default)]
    pub list_wrapper: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockConfig {
    pub port: u16,
    pub routes: Vec<MockRoute>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockLogEntry {
    pub at_ms: u64,
    pub method: String,
    pub path: String,
    pub status: u16,
}

/// 경로 템플릿(`/pets/{petId}`)과 실제 경로(`/pets/3`)를 매칭.
/// 매칭되면 path param 값들을 반환, 아니면 None.
fn match_path(template: &str, actual: &str) -> Option<Vec<String>> {
    let t: Vec<&str> = template.trim_matches('/').split('/').collect();
    let a: Vec<&str> = actual.trim_matches('/').split('/').collect();
    if t.len() != a.len() {
        return None;
    }
    let mut params = Vec::new();
    for (ts, as_) in t.iter().zip(a.iter()) {
        if ts.starts_with('{') && ts.ends_with('}') {
            params.push((*as_).to_string());
        } else if ts != as_ {
            return None;
        }
    }
    Some(params)
}

/// 페이징 파라미터 해석: page/size 또는 offset/limit. (page는 0-base)
fn paginate(dataset: &[Value], query: &HashMap<String, String>) -> Option<(Vec<Value>, usize, usize)> {
    let total = dataset.len();
    if let (Some(page), Some(size)) = (query.get("page"), query.get("size")) {
        let page: usize = page.parse().ok()?;
        let size: usize = size.parse().unwrap_or(20).max(1);
        let start = page * size;
        let items = dataset.iter().skip(start).take(size).cloned().collect();
        return Some((items, page, size));
    }
    if let (Some(offset), Some(limit)) = (query.get("offset"), query.get("limit")) {
        let offset: usize = offset.parse().ok()?;
        let limit: usize = limit.parse().unwrap_or(20).max(1);
        let items = dataset.iter().skip(offset).take(limit).cloned().collect();
        return Some((items, offset / limit, limit));
    }
    let _ = total;
    None
}

/// 라우트 + 요청 → (상태코드, 응답 JSON). 서빙 규칙의 핵심 (HTTP와 무관한 순수 함수 = 테스트 대상).
fn build_response(
    route: &MockRoute,
    path_params: &[String],
    query: &HashMap<String, String>,
) -> (u16, Value) {
    // 단건 조회: dataset + idField + path param
    if let (Some(dataset), Some(id_field), Some(id_value)) =
        (&route.dataset, &route.id_field, path_params.last())
    {
        let found = dataset.iter().find(|item| {
            item.get(id_field)
                .map(|v| match v {
                    Value::String(s) => s == id_value,
                    other => other.to_string() == *id_value,
                })
                .unwrap_or(false)
        });
        return match found {
            Some(item) => (route.status, item.clone()),
            None => (404, serde_json::json!({"error": "not found", "id": id_value})),
        };
    }
    // 목록: dataset (+페이징, +래퍼)
    if let Some(dataset) = &route.dataset {
        let total = dataset.len();
        let (items, page, size) = match paginate(dataset, query) {
            Some(p) => p,
            None => (dataset.clone(), 0, total.max(1)),
        };
        let body = match &route.list_wrapper {
            Some(key) => serde_json::json!({
                key.as_str(): items,
                "totalElements": total,
                "totalPages": total.div_ceil(size),
                "page": page,
                "size": size,
            }),
            None => Value::Array(items),
        };
        return (route.status, body);
    }
    // 고정 body
    (
        route.status,
        route.body.clone().unwrap_or(serde_json::json!({"ok": true})),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn match_path_exact_and_params() {
        assert_eq!(match_path("/pets", "/pets"), Some(vec![]));
        assert_eq!(match_path("/pets/{id}", "/pets/3"), Some(vec!["3".to_string()]));
        assert_eq!(match_path("/a/{x}/b/{y}", "/a/1/b/2"), Some(vec!["1".into(), "2".into()]));
        assert_eq!(match_path("/pets", "/users"), None);
        assert_eq!(match_path("/pets/{id}", "/pets"), None);
    }

    fn list_route(dataset: Vec<Value>, wrapper: Option<&str>) -> MockRoute {
        MockRoute {
            method: "GET".into(), path: "/items".into(), status: 200,
            dataset: Some(dataset), body: None, delay_ms: 0,
            id_field: None, list_wrapper: wrapper.map(String::from),
        }
    }

    #[test]
    fn list_returns_full_array_without_paging() {
        let ds = vec![serde_json::json!({"id":1}), serde_json::json!({"id":2})];
        let (status, body) = build_response(&list_route(ds, None), &[], &q(&[]));
        assert_eq!(status, 200);
        assert_eq!(body.as_array().unwrap().len(), 2);
    }

    #[test]
    fn list_paginates_with_page_size() {
        let ds: Vec<Value> = (1..=10).map(|i| serde_json::json!({"id": i})).collect();
        let (_, body) = build_response(&list_route(ds, None), &[], &q(&[("page", "1"), ("size", "3")]));
        let arr = body.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0]["id"], 4); // page 1(0-base) × size 3 → 4번째부터
    }

    #[test]
    fn list_wrapper_includes_total() {
        let ds: Vec<Value> = (1..=5).map(|i| serde_json::json!({"id": i})).collect();
        let (_, body) = build_response(&list_route(ds, Some("content")), &[], &q(&[("page", "0"), ("size", "2")]));
        assert_eq!(body["content"].as_array().unwrap().len(), 2);
        assert_eq!(body["totalElements"], 5);
        assert_eq!(body["totalPages"], 3);
    }

    #[test]
    fn single_item_lookup_by_id() {
        let ds = vec![serde_json::json!({"id": 1, "name": "a"}), serde_json::json!({"id": 2, "name": "b"})];
        let route = MockRoute {
            method: "GET".into(), path: "/items/{id}".into(), status: 200,
            dataset: Some(ds), body: None, delay_ms: 0,
            id_field: Some("id".into()), list_wrapper: None,
        };
        let (status, body) = build_response(&route, &["2".to_string()], &q(&[]));
        assert_eq!(status, 200);
        assert_eq!(body["name"], "b");

        let (status404, _) = build_response(&route, &["99".to_string()], &q(&[]));
        assert_eq!(status404, 404);
    }

    #[test]
    fn fixed_body_route() {
        let route = MockRoute {
            method: "POST".into(), path: "/items".into(), status: 201,
            dataset: None, body: Some(serde_json::json!({"created": true})), delay_ms: 0,
            id_field: None, list_wrapper: None,
        };
        let (status, body) = build_response(&route, &[], &q(&[]));
        assert_eq!(status, 201);
        assert_eq!(body["created"], true);
    }
}
```

- [ ] **Step 3: lib.rs에 mod 선언만 추가하고 Rust 테스트 실행**

`lib.rs` 1행 `mod ai;` 아래에 추가:

```rust
mod mock_server;
```

Run: `cd src-tauri && cargo test mock_server 2>&1 | tail -20`
Expected: PASS (6개) — 순수 함수 테스트라 서버 없이 통과

- [ ] **Step 4: axum 서버 본체 구현**

`mock_server.rs`의 테스트 모듈 위에 추가:

```rust
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;

/// 실행 중 서버 핸들 (중지용 shutdown 채널 + 로그 버퍼)
struct RunningServer {
    shutdown: Option<oneshot::Sender<()>>,
    logs: Arc<Mutex<Vec<MockLogEntry>>>,
    port: u16,
}

static SERVER: OnceLock<Mutex<Option<RunningServer>>> = OnceLock::new();

fn server_slot() -> &'static Mutex<Option<RunningServer>> {
    SERVER.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// axum 핸들러: 모든 요청을 받아 라우트 테이블에서 매칭.
async fn handle_request(
    routes: Arc<Vec<MockRoute>>,
    logs: Arc<Mutex<Vec<MockLogEntry>>>,
    method: axum::http::Method,
    uri: axum::http::Uri,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    let path = uri.path().to_string();
    let query: HashMap<String, String> = uri
        .query()
        .map(|q| {
            url_query_pairs(q)
        })
        .unwrap_or_default();

    // OPTIONS preflight → CORS 허용
    if method == axum::http::Method::OPTIONS {
        return cors_response(204, Value::Null);
    }

    let mut response = (404, serde_json::json!({"error": "no mock route", "path": path}));
    let mut delay = 0u64;
    for route in routes.iter() {
        if route.method != method.as_str() {
            continue;
        }
        if let Some(params) = match_path(&route.path, &path) {
            response = build_response(route, &params, &query);
            delay = route.delay_ms;
            break;
        }
    }

    if delay > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
    }

    // 로그 기록 (최근 200개 유지)
    {
        let mut l = logs.lock().unwrap();
        l.push(MockLogEntry { at_ms: now_ms(), method: method.to_string(), path, status: response.0 });
        let overflow = l.len().saturating_sub(200);
        if overflow > 0 {
            l.drain(0..overflow);
        }
    }

    cors_response(response.0, response.1).into_response()
}

fn url_query_pairs(q: &str) -> HashMap<String, String> {
    q.split('&')
        .filter_map(|pair| {
            let mut it = pair.splitn(2, '=');
            Some((it.next()?.to_string(), it.next().unwrap_or("").to_string()))
        })
        .collect()
}

fn cors_response(status: u16, body: Value) -> axum::response::Response {
    use axum::response::IntoResponse;
    let mut resp = (
        axum::http::StatusCode::from_u16(status).unwrap_or(axum::http::StatusCode::OK),
        axum::Json(body),
    )
        .into_response();
    let headers = resp.headers_mut();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert("Access-Control-Allow-Methods", "*".parse().unwrap());
    headers.insert("Access-Control-Allow-Headers", "*".parse().unwrap());
    resp
}

/// Mock 서버 시작. 성공 시 바인딩된 포트 반환.
#[tauri::command]
pub async fn mock_start(config: MockConfig) -> Result<u16, String> {
    // 이미 실행 중이면 먼저 중지
    mock_stop().await?;

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", config.port))
        .await
        .map_err(|e| format!("PORT_IN_USE: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let routes = Arc::new(config.routes);
    let logs: Arc<Mutex<Vec<MockLogEntry>>> = Arc::new(Mutex::new(Vec::new()));
    let (tx, rx) = oneshot::channel::<()>();

    let routes_for_app = routes.clone();
    let logs_for_app = logs.clone();
    let app = axum::Router::new().fallback(move |method: axum::http::Method, uri: axum::http::Uri| {
        let routes = routes_for_app.clone();
        let logs = logs_for_app.clone();
        async move { handle_request(routes, logs, method, uri).await }
    });

    tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });

    *server_slot().lock().unwrap() = Some(RunningServer { shutdown: Some(tx), logs, port });
    Ok(port)
}

/// Mock 서버 중지 (실행 중이 아니어도 OK).
#[tauri::command]
pub async fn mock_stop() -> Result<(), String> {
    if let Some(mut running) = server_slot().lock().unwrap().take() {
        if let Some(tx) = running.shutdown.take() {
            let _ = tx.send(());
        }
    }
    Ok(())
}

/// 누적 요청 로그 + 실행 상태 조회 (UI 폴링용).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockStatus {
    pub running: bool,
    pub port: u16,
    pub logs: Vec<MockLogEntry>,
}

#[tauri::command]
pub fn mock_status() -> MockStatus {
    let slot = server_slot().lock().unwrap();
    match slot.as_ref() {
        Some(s) => MockStatus { running: true, port: s.port, logs: s.logs.lock().unwrap().clone() },
        None => MockStatus { running: false, port: 0, logs: vec![] },
    }
}
```

- [ ] **Step 5: lib.rs command 등록**

`generate_handler!` 목록에 추가:

```rust
            mock_server::mock_start,
            mock_server::mock_stop,
            mock_server::mock_status,
```

- [ ] **Step 6: Rust 테스트 + 컴파일 확인**

Run: `cd src-tauri && cargo test 2>&1 | tail -15`
Expected: 기존 테스트 + mock_server 테스트 6개 모두 PASS

Run: `cd src-tauri && cargo clippy --all-targets 2>&1 | tail -10`
Expected: mock_server 관련 error 없음 (warning은 기존 수준 유지)

- [ ] **Step 7: 커밋**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/mock_server.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "기능: Rust mock 서버 — axum 기반 경로 매칭·페이징·단건 조회·CORS·요청 로그

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: mock-client — Tauri command 호출 래퍼

**Files:**
- Create: `apps/desktop/src/core/mock-client.ts`
- Test: 없음 (invoke 호출만 — 통합 테스트는 Task 10에서 수동)

- [ ] **Step 1: 구현**

```ts
// apps/desktop/src/core/mock-client.ts
// Rust mock 서버 command 호출 래퍼.
import { invoke } from "@tauri-apps/api/core";
import type { MockRoute } from "./mock-config";

export interface MockLogEntry {
  atMs: number;
  method: string;
  path: string;
  status: number;
}

export interface MockStatus {
  running: boolean;
  port: number;
  logs: MockLogEntry[];
}

/** mock 서버 시작. 실제 바인딩된 포트 반환. 포트 충돌 시 "PORT_IN_USE: ..." 에러 throw */
export async function startMockServer(port: number, routes: MockRoute[]): Promise<number> {
  return invoke<number>("mock_start", { config: { port, routes } });
}

export async function stopMockServer(): Promise<void> {
  await invoke("mock_stop");
}

export async function getMockStatus(): Promise<MockStatus> {
  return invoke<MockStatus>("mock_status");
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add apps/desktop/src/core/mock-client.ts
git commit -m "기능: mock 서버 Tauri command 호출 래퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: AI 데이터셋 생성 (mock-prompt)

**Files:**
- Create: `apps/desktop/src/core/ai/mock-prompt.ts`
- Test: `apps/desktop/src/core/ai/mock-prompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/desktop/src/core/ai/mock-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildMockDatasetPrompt, parseMockDatasetResponse } from "./mock-prompt";
import type { ParsedOperation } from "../types";

const op: ParsedOperation = {
  id: "GET /api/v1/cmdb/app",
  method: "GET",
  path: "/api/v1/cmdb/app",
  summary: "앱 목록 조회",
  tags: ["app"],
  parameters: [],
  responses: [{
    status: "200",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          appId: { type: "string" },
          appName: { type: "string" },
          status: { type: "string", enumValues: ["RUNNING", "STOPPED"] },
        },
      },
    },
  }],
};

describe("buildMockDatasetPrompt", () => {
  it("경로·요약·아이템 스키마·개수가 프롬프트에 포함된다", () => {
    const p = buildMockDatasetPrompt(op, 10);
    expect(p).toContain("/api/v1/cmdb/app");
    expect(p).toContain("앱 목록 조회");
    expect(p).toContain("appName");
    expect(p).toContain("RUNNING");
    expect(p).toContain("10개");
  });
});

describe("parseMockDatasetResponse", () => {
  it("JSON 배열 응답을 파싱한다", () => {
    const out = parseMockDatasetResponse('[{"appId":"A-1"},{"appId":"A-2"}]');
    expect(out).toHaveLength(2);
  });

  it("마크다운 코드블록에 싸인 응답도 파싱한다", () => {
    const out = parseMockDatasetResponse('```json\n[{"a":1}]\n```');
    expect(out).toEqual([{ a: 1 }]);
  });

  it("객체로 감싼 응답({items: [...]})도 배열을 찾아 반환한다", () => {
    const out = parseMockDatasetResponse('{"items": [{"a":1},{"a":2}]}');
    expect(out).toHaveLength(2);
  });

  it("파싱 불가하면 에러를 던진다", () => {
    expect(() => parseMockDatasetResponse("배열이 아닌 텍스트")).toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/ai/mock-prompt.test.ts`
Expected: FAIL — `Cannot find module './mock-prompt'`

- [ ] **Step 3: 구현**

```ts
// apps/desktop/src/core/ai/mock-prompt.ts
// AI(Claude)로 "현실적인" mock 데이터셋을 생성하는 프롬프트/파서.
// 사용처: MockServerModal에서 source="ai" 선택 시 provider.complete() 호출.
import type { ParsedOperation, ParsedSchema } from "../types";
import { extractItemSchema } from "../mock-generator";

function schemaToText(schema: ParsedSchema | undefined, depth = 0): string {
  if (!schema || depth > 4) return "unknown";
  if (schema.type === "object" && schema.properties) {
    const fields = Object.entries(schema.properties)
      .map(([k, v]) => {
        const enums = v.enumValues ? ` (값: ${v.enumValues.join("|")})` : "";
        return `${"  ".repeat(depth + 1)}${k}: ${v.type}${enums}`;
      })
      .join("\n");
    return `object {\n${fields}\n${"  ".repeat(depth)}}`;
  }
  if (schema.type === "array") return `array of ${schemaToText(schema.items, depth + 1)}`;
  return schema.type;
}

/** AI에게 보낼 데이터셋 생성 프롬프트. */
export function buildMockDatasetPrompt(operation: ParsedOperation, count: number): string {
  const ok = operation.responses.find((r) => r.status.startsWith("2"));
  const info = extractItemSchema(ok?.schema);
  return [
    `다음 REST API의 mock 응답 데이터를 만들어줘.`,
    ``,
    `API: ${operation.method} ${operation.path}`,
    operation.summary ? `설명: ${operation.summary}` : "",
    ``,
    `아이템 스키마:`,
    schemaToText(info?.itemSchema),
    ``,
    `요구사항:`,
    `- 현실적이고 다양한 한국어 데이터 ${count}개`,
    `- API 경로와 설명의 도메인 맥락에 맞는 값 (예: CMDB면 실제 있을 법한 서버/앱 이름)`,
    `- enum 필드는 정의된 값만 사용`,
    `- id류 필드는 서로 다른 값`,
    `- JSON 배열만 출력 (다른 텍스트 없이)`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** AI 시스템 프롬프트 (complete 호출 시 system으로 전달) */
export const MOCK_DATASET_SYSTEM = "너는 API mock 데이터 생성기다. 요청된 스키마에 맞는 JSON 배열만 출력한다.";

/** AI 응답 텍스트 → 데이터셋 배열. 코드블록/객체 래핑도 허용. */
export function parseMockDatasetResponse(text: string): unknown[] {
  // 마크다운 코드블록 제거
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 텍스트 중간의 첫 배열 추출 시도
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("AI 응답에서 JSON 배열을 찾지 못했습니다");
    parsed = JSON.parse(m[0]);
  }
  if (Array.isArray(parsed)) return parsed;
  // {items: [...]} 형태면 첫 배열 속성 사용
  if (parsed && typeof parsed === "object") {
    const arr = Object.values(parsed).find(Array.isArray);
    if (arr) return arr as unknown[];
  }
  throw new Error("AI 응답이 JSON 배열 형태가 아닙니다");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/ai/mock-prompt.test.ts`
Expected: PASS (5개)

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop/src/core/ai/mock-prompt.ts apps/desktop/src/core/ai/mock-prompt.test.ts
git commit -m "기능: AI mock 데이터셋 생성 프롬프트·파서 — 도메인 맥락 반영 현실적 데이터

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: MockServerModal UI + CSS

**Files:**
- Create: `apps/desktop/src/components/MockServerModal.tsx`
- Test: `apps/desktop/src/components/MockServerModal.test.tsx`
- Modify: `apps/desktop/src/App.css` (끝에 스타일 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// apps/desktop/src/components/MockServerModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ParsedSpec, ParsedOperation } from "../core/types";

// Tauri invoke mock (서버 시작/중지/상태)
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import { MockServerModal } from "./MockServerModal";

const listOp: ParsedOperation = {
  id: "GET /pets", method: "GET", path: "/pets", tags: ["pet"], parameters: [],
  summary: "펫 목록",
  responses: [{
    status: "200",
    schema: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } } },
  }],
};
const spec = {
  info: { title: "t", version: "1" }, operations: [listOp], securitySchemes: [],
} as unknown as ParsedSpec;

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: unknown) => {
    if (cmd === "mock_start") return 9090;
    if (cmd === "mock_status") return { running: false, port: 0, logs: [] };
    return undefined;
  });
});

function renderModal() {
  return render(
    <MockServerModal
      spec={spec}
      specUrl="https://api.test/spec.json"
      history={[]}
      onClose={() => {}}
    />,
  );
}

describe("MockServerModal", () => {
  it("operation 목록과 서버 시작 버튼을 표시한다", () => {
    renderModal();
    expect(screen.getByText("/pets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "서버 시작" })).toBeTruthy();
  });

  it("서버 시작 클릭 시 mock_start를 호출하고 실행 중 상태를 표시한다", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "서버 시작" }));
    // invoke("mock_start", ...)가 호출됨
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("mock_start", expect.anything());
    });
    expect(await screen.findByText(/실행 중/)).toBeTruthy();
  });

  it("operation 행 클릭 시 데이터셋 미리보기가 표시된다", () => {
    renderModal();
    fireEvent.click(screen.getByText("/pets"));
    // 자동 생성된 dataset JSON이 미리보기에 표시됨
    expect(document.querySelector(".mock-preview")).toBeTruthy();
    expect(document.querySelector(".mock-preview")!.textContent).toContain('"id"');
  });

  it("포트 충돌 에러 시 메시지를 표시한다", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "mock_start") throw new Error("PORT_IN_USE: address in use");
      if (cmd === "mock_status") return { running: false, port: 0, logs: [] };
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "서버 시작" }));
    expect(await screen.findByText(/포트.*사용 중/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/MockServerModal.test.tsx`
Expected: FAIL — `Cannot find module './MockServerModal'`

- [ ] **Step 3: 컴포넌트 구현**

```tsx
// apps/desktop/src/components/MockServerModal.tsx
// Mock 서버 관리 모달: 서버 on/off, operation별 응답 데이터 설정, 실시간 요청 로그.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedSpec } from "../core/types";
import type { HistoryItem } from "../core/history";
import {
  loadMockConfig,
  saveMockConfig,
  buildMockRoutes,
  type MockServerConfig,
  type MockOperationConfig,
  type MockSource,
} from "../core/mock-config";
import { generateDataset } from "../core/mock-generator";
import { startMockServer, stopMockServer, getMockStatus, type MockLogEntry } from "../core/mock-client";
import { buildMockDatasetPrompt, parseMockDatasetResponse, MOCK_DATASET_SYSTEM } from "../core/ai/mock-prompt";
import { getProvider } from "../core/ai/provider";
import { COMPLETE_MODEL } from "../core/ai/models";
import { methodColor } from "./method";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import { Select } from "./Select";

interface Props {
  spec: ParsedSpec;
  specUrl: string;
  history: HistoryItem[];
  onClose: () => void;
}

const SOURCE_OPTIONS = [
  { value: "schema", label: "자동 생성 (스키마)" },
  { value: "ai", label: "AI 생성 (Claude)" },
  { value: "history", label: "히스토리에서 가져오기" },
  { value: "manual", label: "직접 편집" },
];

export function MockServerModal({ spec, specUrl, history, onClose }: Props) {
  useEscToClose(onClose);

  const [config, setConfig] = useState<MockServerConfig>(() => loadMockConfig(specUrl, spec));
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState<number>(config.port);
  const [logs, setLogs] = useState<MockLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 설정 변경 시 자동 저장
  useEffect(() => {
    saveMockConfig(specUrl, config);
  }, [specUrl, config]);

  // 실행 중이면 1초 간격 로그 폴링
  useEffect(() => {
    if (!running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const status = await getMockStatus();
        setLogs(status.logs);
        if (!status.running) setRunning(false);
      } catch {
        /* 폴링 실패 무시 */
      }
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running]);

  const selectedOp = spec.operations.find((o) => o.id === selectedOpId) ?? null;
  const selectedCfg = config.operations.find((o) => o.opId === selectedOpId) ?? null;

  // 미리보기용 데이터 (dataset이 없으면 즉석 생성)
  const previewData = useMemo(() => {
    if (!selectedOp || !selectedCfg) return null;
    if (selectedCfg.dataset) return selectedCfg.dataset;
    if (selectedCfg.body !== undefined) return selectedCfg.body;
    return generateDataset(selectedOp, selectedCfg.itemCount, selectedCfg.seed);
  }, [selectedOp, selectedCfg]);

  const patchOp = (opId: string, patch: Partial<MockOperationConfig>) => {
    setConfig((prev) => ({
      ...prev,
      operations: prev.operations.map((o) => (o.opId === opId ? { ...o, ...patch } : o)),
    }));
  };

  const toggleServer = async () => {
    setError(null);
    if (running) {
      await stopMockServer();
      setRunning(false);
      return;
    }
    try {
      const routes = buildMockRoutes(spec, { ...config, port });
      const boundPort = await startMockServer(port, routes);
      setPort(boundPort);
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("PORT_IN_USE")) {
        setError(`포트 ${port}이(가) 사용 중입니다. 다른 포트를 입력하세요 (예: ${port + 1})`);
      } else {
        setError(`서버 시작 실패: ${msg}`);
      }
    }
  };

  const regenerate = (source: MockSource) => {
    if (!selectedOp || !selectedCfg) return;
    setPreviewError(null);
    if (source === "schema") {
      const ds = generateDataset(selectedOp, selectedCfg.itemCount, Date.now() % 100000);
      patchOp(selectedOp.id, { source, dataset: ds, seed: Date.now() % 100000 });
    } else if (source === "ai") {
      runAiGenerate();
    } else if (source === "history") {
      // 해당 operation의 가장 최근 히스토리 응답 사용
      const item = history.find((h) => h.opId === selectedOp.id && h.status >= 200 && h.status < 300);
      if (!item) {
        setPreviewError("이 API의 성공 히스토리가 없습니다. 먼저 실제 요청을 보내보세요.");
        return;
      }
      try {
        const parsed = JSON.parse(item.responseBody ?? "null");
        if (Array.isArray(parsed)) patchOp(selectedOp.id, { source, dataset: parsed });
        else patchOp(selectedOp.id, { source, body: parsed, dataset: undefined });
      } catch {
        setPreviewError("히스토리 응답이 JSON이 아닙니다.");
      }
    } else {
      patchOp(selectedOp.id, { source });
    }
  };

  const runAiGenerate = async () => {
    if (!selectedOp || !selectedCfg) return;
    setAiLoading(true);
    setPreviewError(null);
    try {
      const provider = getProvider("claude");
      const raw = await provider.complete({
        prompt: buildMockDatasetPrompt(selectedOp, selectedCfg.itemCount),
        system: MOCK_DATASET_SYSTEM,
        model: COMPLETE_MODEL,
        schema: "", // 자유 형식 JSON 배열 (스키마 강제 없음)
      });
      const dataset = parseMockDatasetResponse(raw);
      patchOp(selectedOp.id, { source: "ai", dataset });
    } catch (e) {
      setPreviewError(
        `AI 생성 실패: ${e instanceof Error ? e.message : String(e)} — 자동 생성으로 대체하세요`,
      );
    } finally {
      setAiLoading(false);
    }
  };

  const onPreviewEdit = (text: string) => {
    if (!selectedOp) return;
    try {
      const parsed = JSON.parse(text);
      setPreviewError(null);
      if (Array.isArray(parsed)) patchOp(selectedOp.id, { source: "manual", dataset: parsed });
      else patchOp(selectedOp.id, { source: "manual", body: parsed, dataset: undefined });
    } catch {
      setPreviewError("JSON 파싱 오류 — 저장되지 않습니다");
    }
  };

  const baseUrl = `http://localhost:${port}`;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal mock-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            Mock 서버
            {running && <span className="mock-running-badge">실행 중 — {baseUrl}</span>}
          </h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body mock-body">
          {/* 서버 제어 바 */}
          <div className="mock-control-bar">
            <label className="mock-port-field">
              <span>포트</span>
              <input
                type="number"
                value={port}
                disabled={running}
                onChange={(e) => setPort(Number(e.target.value) || 9090)}
              />
            </label>
            <button className={running ? "btn small" : "btn small primary"} onClick={toggleServer}>
              {running ? "서버 중지" : "서버 시작"}
            </button>
            {running && (
              <button
                className="btn small"
                title="Base URL 복사"
                onClick={() => navigator.clipboard.writeText(baseUrl)}
              >
                <CopyIcon size={13} /> {baseUrl}
              </button>
            )}
            {error && <span className="mock-error">{error}</span>}
          </div>

          <div className="mock-columns">
            {/* 좌: operation 목록 */}
            <div className="mock-op-list">
              {spec.operations.map((op) => {
                const cfg = config.operations.find((o) => o.opId === op.id);
                return (
                  <div
                    key={op.id}
                    className={`mock-op-row${op.id === selectedOpId ? " selected" : ""}`}
                    onClick={() => setSelectedOpId(op.id)}
                  >
                    <input
                      type="checkbox"
                      checked={cfg?.enabled ?? true}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => patchOp(op.id, { enabled: e.target.checked })}
                      title="이 API를 mock에 포함"
                    />
                    <span className="method" style={{ color: methodColor(op.method) }}>
                      {op.method}
                    </span>
                    <span className="mock-op-path">{op.path}</span>
                  </div>
                );
              })}
            </div>

            {/* 우: 선택된 operation 설정 + 미리보기 */}
            <div className="mock-op-detail">
              {!selectedOp || !selectedCfg ? (
                <div className="hint center">왼쪽에서 API를 선택하세요</div>
              ) : (
                <>
                  <div className="mock-detail-controls">
                    <Select
                      value={selectedCfg.source}
                      onChange={(v) => regenerate(v as MockSource)}
                      options={SOURCE_OPTIONS}
                    />
                    <label className="mock-num-field">
                      <span>개수</span>
                      <input
                        type="number"
                        value={selectedCfg.itemCount}
                        onChange={(e) =>
                          patchOp(selectedOp.id, { itemCount: Number(e.target.value) || 20 })
                        }
                      />
                    </label>
                    <label className="mock-num-field">
                      <span>지연(ms)</span>
                      <input
                        type="number"
                        value={selectedCfg.delayMs}
                        onChange={(e) =>
                          patchOp(selectedOp.id, { delayMs: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label className="mock-num-field">
                      <span>상태</span>
                      <input
                        type="number"
                        value={selectedCfg.status}
                        onChange={(e) =>
                          patchOp(selectedOp.id, { status: Number(e.target.value) || 200 })
                        }
                      />
                    </label>
                    <button
                      className="btn small"
                      disabled={aiLoading}
                      onClick={() => regenerate(selectedCfg.source)}
                      title="현재 소스로 데이터 다시 생성"
                    >
                      {aiLoading ? "AI 생성 중…" : "↻ 재생성"}
                    </button>
                  </div>
                  {previewError && <div className="mock-error">{previewError}</div>}
                  <textarea
                    className="mock-preview"
                    value={JSON.stringify(previewData, null, 2)}
                    onChange={(e) => onPreviewEdit(e.target.value)}
                    spellCheck={false}
                  />
                </>
              )}
            </div>
          </div>

          {/* 하단: 요청 로그 */}
          {running && (
            <div className="mock-log-section">
              <div className="mock-log-head">요청 로그 ({logs.length})</div>
              <div className="mock-log-list">
                {logs.length === 0 && <div className="hint">아직 요청이 없습니다 — {baseUrl} 로 호출해보세요</div>}
                {[...logs].reverse().map((log, i) => (
                  <div className="mock-log-row" key={`${log.atMs}-${i}`}>
                    <span className="method" style={{ color: methodColor(log.method) }}>{log.method}</span>
                    <span className="mock-op-path">{log.path}</span>
                    <span className="mock-log-status">{log.status}</span>
                    <span className="mock-log-time">{new Date(log.atMs).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

참고: `HistoryItem`에 `responseBody` 필드가 있는지 `core/history.ts`에서 확인하고, 없으면 그 파일의 실제 응답 본문 필드명(예: `body`)으로 맞춘다.

- [ ] **Step 4: CSS 추가 (App.css 끝)**

```css
/* ============================================================
 * Mock 서버 모달
 * ============================================================ */
.modal.mock-modal {
  width: 980px;
  max-width: 95vw;
  height: 80vh;
}
.mock-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}
.mock-running-badge {
  margin-left: 10px;
  font-size: 11px;
  color: #3fb950;
  font-weight: 600;
}
.mock-control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mock-port-field,
.mock-num-field {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}
.mock-port-field input,
.mock-num-field input {
  width: 70px;
}
.mock-error {
  color: #f85149;
  font-size: 12px;
}
.mock-columns {
  display: flex;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.mock-op-list {
  width: 340px;
  flex: none;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.mock-op-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 12px;
}
.mock-op-row:hover {
  background: var(--bg-3);
}
.mock-op-row.selected {
  background: var(--accent);
  color: #fff;
}
.mock-op-row.selected .method {
  color: #fff !important;
}
.mock-op-path {
  font-family: ui-monospace, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mock-op-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.mock-detail-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mock-preview {
  flex: 1;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  resize: none;
}
.mock-log-section {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  max-height: 160px;
  display: flex;
  flex-direction: column;
}
.mock-log-head {
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
  margin-bottom: 4px;
}
.mock-log-list {
  overflow: auto;
}
.mock-log-row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 2px 0;
  font-family: ui-monospace, monospace;
}
.mock-log-status {
  color: #3fb950;
}
.mock-log-time {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/components/MockServerModal.test.tsx`
Expected: PASS (4개). 실패 시 HistoryItem 필드명/AI provider mock 등을 실제 코드에 맞게 조정.

- [ ] **Step 6: 커밋**

```bash
git add apps/desktop/src/components/MockServerModal.tsx apps/desktop/src/components/MockServerModal.test.tsx apps/desktop/src/App.css
git commit -m "기능: Mock 서버 모달 — 서버 제어·소스별 데이터 생성·미리보기 편집·요청 로그

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: App.tsx 통합 + 브라우저 모드 지원

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/public/tauri-mock.js`

- [ ] **Step 1: App.tsx에 Mock 버튼 + 모달 연결**

import 추가:

```tsx
import { MockServerModal } from "./components/MockServerModal";
```

state 추가 (`runnerOpen` 근처):

```tsx
  const [mockOpen, setMockOpen] = useState(false);
```

상단바 "러너" 버튼 다음에 버튼 추가:

```tsx
        <button
          className="btn"
          title="Mock 서버 — 스펙 기반 가짜 API 서버를 로컬에 띄웁니다"
          onClick={() => setMockOpen(true)}
          disabled={!spec}
        >
          Mock
        </button>
```

모달 렌더 블록 (`{runnerOpen && ...}` 근처)에 추가:

```tsx
      {mockOpen && spec && (
        <MockServerModal
          spec={spec}
          specUrl={activeSpecUrl || specUrl}
          history={history}
          onClose={() => setMockOpen(false)}
        />
      )}
```

참고: App.tsx의 히스토리 상태 변수명을 확인해서 (`history`) 그대로 전달한다.

- [ ] **Step 2: tauri-mock.js에 mock command 케이스 추가**

invoke 라우터의 switch에 케이스 추가 (브라우저 모드에서는 실서버를 못 띄우므로 안내만):

```js
      case "mock_start":
        return Promise.reject(new Error("브라우저 모드에서는 Mock 서버를 사용할 수 없습니다 (데스크톱 앱 전용)"));
      case "mock_stop":
        return Promise.resolve();
      case "mock_status":
        return Promise.resolve({ running: false, port: 0, logs: [] });
```

- [ ] **Step 3: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -5`
Expected: 타입 에러 없음, 전체 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/desktop/src/App.tsx apps/desktop/public/tauri-mock.js
git commit -m "기능: 상단바 Mock 버튼 + Mock 서버 모달 연결 (브라우저 모드는 안내 메시지)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: 전체 검증 + 수동 통합 테스트

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 자동 검증**

```bash
npx eslint . && npx tsc --noEmit && npx vitest run && npm run build
cd src-tauri && cargo test && cargo clippy --all-targets
```

Expected: 모두 PASS / 에러 없음

- [ ] **Step 2: Tauri 앱 빌드 + 수동 통합 테스트**

```bash
npm run tauri dev
```

수동 확인 체크리스트:
1. Petstore 스펙(`https://petstore3.swagger.io/api/v3/openapi.json`) 로드
2. Mock 버튼 → 모달 열림, operation 목록 표시
3. `GET /pet/findByStatus` 선택 → 자동 생성 데이터 미리보기 표시
4. AI 생성 선택 (claude CLI 설치 환경) → 현실적인 데이터 생성 확인
5. 서버 시작 → "실행 중 — http://localhost:9090" 표시
6. 터미널에서 검증:
   ```bash
   curl http://localhost:9090/pet/findByStatus          # 목록 (자동 생성 데이터)
   curl "http://localhost:9090/pet/findByStatus?page=0&size=5"  # 페이징
   curl http://localhost:9090/pet/1                     # 단건 (id=1)
   curl http://localhost:9090/pet/99999                 # 404
   curl -X POST http://localhost:9090/pet               # 고정 body
   curl -i http://localhost:9090/pet/1                  # CORS 헤더 확인
   ```
7. 모달의 요청 로그에 위 호출들이 표시되는지
8. 서버 중지 → curl 연결 실패 확인
9. 모달 닫고 다시 열기 → 설정 유지 확인

- [ ] **Step 3: 발견된 문제 수정 후 커밋**

문제가 있으면 수정 → 해당 테스트 추가 → 커밋. 없으면 다음으로.

- [ ] **Step 4: 버전 범프 + CHANGELOG**

`package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`의 버전을 0.4.0으로 (마이너 기능 추가).

`CHANGELOG.md` 맨 위 버전 섹션 추가:

```markdown
## v0.4.0

- 기능: **Mock 서버** — 로드한 스펙으로 로컬 가짜 API 서버를 띄워 외부 클라이언트(브라우저/앱)가 호출 가능 (`http://localhost:9090`)
  - 응답 데이터 3가지 소스: 스키마 자동 생성(한국어 이름·이메일·날짜 등 필드 인식) / **AI 생성**(도메인 맥락 반영) / 히스토리 실제 응답
  - 진짜 백엔드처럼: 목록↔단건 일관성, page/size 페이징 자동 처리, 응답 지연 시뮬레이션
  - 실시간 요청 로그로 어떤 클라이언트가 뭘 호출했는지 확인
```

```bash
git add apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/tauri.conf.json apps/desktop/CHANGELOG.md
git commit -m "문서: v0.4.0 버전 범프 + CHANGELOG(Mock 서버)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: 배포**

배포 절차 (memory: public-repo-distribution):

```bash
git push origin main && git push personal main
git tag SwaggerMan-v0.4.0 && git push personal SwaggerMan-v0.4.0
# CI 완료 대기 후:
gh release edit SwaggerMan-v0.4.0 -R jehyukkim674/swaggerman --draft=false --latest --notes-file <노트파일>
```

---

## Self-Review 체크

- **스펙 커버리지**: 스키마 자동 생성(Task 1-3) ✓ / AI(Task 7) ✓ / 히스토리(Task 8 regenerate) ✓ / 시드 일관성(Task 1) ✓ / 페이징(Task 5) ✓ / 단건 조회(Task 5) ✓ / 지연(Task 5) ✓ / CORS(Task 5) ✓ / 요청 로그(Task 5, 8) ✓ / 포트 충돌 처리(Task 5, 8) ✓ / localStorage 영속화(Task 4) ✓ / UI(Task 8-9) ✓
- **타입 일관성**: `MockRoute`(TS mock-config.ts)와 Rust `MockRoute`의 serde camelCase 필드 일치(method/path/status/dataset/body/delayMs/idField/listWrapper) ✓ / `MockStatus`(TS mock-client.ts)와 Rust `MockStatus`(running/port/logs) ✓
- **플레이스홀더 없음** ✓
