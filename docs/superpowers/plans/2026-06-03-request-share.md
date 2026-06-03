# 요청 공유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 요청을 압축 텍스트(`swaggerman:req:<gzip+base64url>`)로 인코딩해 복사하고, 붙여넣어 요청 폼에 적용하는 서버리스 공유 — 민감 헤더는 기본 제외.

**Architecture:** 순수 인코딩 모듈(`core/share.ts`, gzip은 브라우저 내장 CompressionStream)과 공유 모달(`ShareModal.tsx`, 내보내기/가져오기 탭)을 분리한다. 가져오기 적용은 기존 cURL import 경로(`curlToRequest` → `importCurl`)를 재활용해 ad-hoc operation으로 요청 화면에 반영한다.

**Tech Stack:** TypeScript, React 19, vitest(jsdom), 브라우저 내장 CompressionStream/DecompressionStream(라이브러리 0개).

**Spec:** `docs/superpowers/specs/2026-06-03-request-share-design.md`

작업 디렉터리: `/Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop`. 모든 명령은 이 디렉터리에서. 브랜치: `main` 직접 커밋. 한국어 주석/커밋.

**사전 확인됨:** CompressionStream/DecompressionStream은 Node 20(vitest)에서 전역으로 사용 가능 → 폴리필 불필요.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/core/share.ts` (신규) | ShareableRequest/ShareParam 타입, isSecretHeader, encodeShare/decodeShare(gzip+base64url) |
| `src/core/share.test.ts` (신규) | 인코딩 라운드트립·민감 제외·에러 |
| `src/components/ShareModal.tsx` (신규) | 내보내기/가져오기 탭 UI |
| `src/components/ShareModal.test.tsx` (신규) | 모달 동작 |
| `src/App.tsx` (수정) | 상단바 "공유" 버튼 + 모달 연결 + 적용 콜백 |

---

### Task 1: core/share.ts — 민감 헤더 판별 + base64url

**Files:**
- Create: `src/core/share.ts`
- Create: `src/core/share.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/core/share.test.ts
import { describe, it, expect } from "vitest";
import { isSecretHeader, toBase64Url, fromBase64Url } from "./share";

describe("isSecretHeader", () => {
  it("민감 헤더를 식별한다", () => {
    for (const k of ["Authorization", "cookie", "Set-Cookie", "X-Api-Key", "apikey", "X-Auth-Token", "password", "X-Secret"]) {
      expect(isSecretHeader(k)).toBe(true);
    }
  });
  it("일반 헤더는 민감하지 않다", () => {
    for (const k of ["Accept", "Content-Type", "User-Agent", "X-Request-Id", "Accept-Language"]) {
      expect(isSecretHeader(k)).toBe(false);
    }
  });
});

describe("base64url", () => {
  it("바이트를 URL-safe base64로 왕복한다", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/); // URL-safe: +/= 없음
    expect(fromBase64Url(encoded)).toEqual(bytes);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/share.test.ts`
Expected: FAIL — `Cannot find module './share'`

- [ ] **Step 3: 구현**

```ts
// src/core/share.ts
// 요청을 압축 텍스트로 인코딩해 복사·붙여넣기로 공유한다(서버 없이).
// gzip은 브라우저 내장 CompressionStream 사용(라이브러리 0).

export interface ShareParam {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ShareableRequest {
  v: 1;
  method: string;
  url: string;
  baseURL?: string;
  pathParams: Record<string, string>;
  queryParams: ShareParam[];
  headers: ShareParam[];
  body: string;
  bodyMode?: string;
  note?: { text: string; status: string };
  excludedSecrets?: string[];
}

export const SHARE_PREFIX = "swaggerman:req:";

// 민감 헤더: 정확 일치(authorization/cookie/set-cookie) + 부분 일치 패턴
const SECRET_EXACT = new Set(["authorization", "cookie", "set-cookie"]);
const SECRET_PARTS = ["token", "api-key", "apikey", "secret", "password", "passwd", "auth"];

/** 헤더 key가 토큰/인증 등 민감 정보인지 판별(대소문자 무시). */
export function isSecretHeader(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (SECRET_EXACT.has(k)) return true;
  return SECRET_PARTS.some((p) => k.includes(p));
}

/** Uint8Array → URL-safe base64(패딩 제거). */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe base64 → Uint8Array. */
export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/share.test.ts`
Expected: PASS (3개)

- [ ] **Step 5: 커밋**

```bash
git add src/core/share.ts src/core/share.test.ts
git commit -m "기능: 요청 공유 코어 — 민감 헤더 판별 + base64url 헬퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: encodeShare / decodeShare (gzip 라운드트립)

**Files:**
- Modify: `src/core/share.ts`
- Modify: `src/core/share.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`share.test.ts` 끝에 추가:

```ts
import { encodeShare, decodeShare, SHARE_PREFIX, type ShareableRequest } from "./share";

function sampleReq(over: Partial<ShareableRequest> = {}): ShareableRequest {
  return {
    v: 1,
    method: "POST",
    url: "https://api.example.com/v1/pets?status=sold",
    baseURL: "https://api.example.com/v1",
    pathParams: { petId: "3" },
    queryParams: [{ key: "status", value: "sold", enabled: true }],
    headers: [
      { key: "Content-Type", value: "application/json", enabled: true },
      { key: "Authorization", value: "Bearer SECRET", enabled: true },
      { key: "X-Api-Key", value: "KEY123", enabled: true },
    ],
    body: '{"name":"코코"}',
    bodyMode: "raw",
    note: { text: "6월 제거 예정", status: "deprecated" },
    ...over,
  };
}

describe("encodeShare / decodeShare", () => {
  it("기본은 민감 헤더를 제외하고 왕복 복원한다", async () => {
    const code = await encodeShare(sampleReq());
    expect(code.startsWith(SHARE_PREFIX)).toBe(true);
    const decoded = await decodeShare(code);
    // 일반 헤더만 남음
    expect(decoded.headers.map((h) => h.key)).toEqual(["Content-Type"]);
    // 제외된 민감 헤더 이름 기록
    expect(decoded.excludedSecrets).toEqual(["Authorization", "X-Api-Key"]);
    // 나머지 필드 보존
    expect(decoded.method).toBe("POST");
    expect(decoded.url).toBe("https://api.example.com/v1/pets?status=sold");
    expect(decoded.body).toBe('{"name":"코코"}');
    expect(decoded.pathParams).toEqual({ petId: "3" });
    expect(decoded.note).toEqual({ text: "6월 제거 예정", status: "deprecated" });
  });

  it("includeSecrets:true면 민감 헤더도 포함하고 excludedSecrets는 비운다", async () => {
    const code = await encodeShare(sampleReq(), { includeSecrets: true });
    const decoded = await decodeShare(code);
    expect(decoded.headers.map((h) => h.key)).toEqual(["Content-Type", "Authorization", "X-Api-Key"]);
    expect(decoded.excludedSecrets ?? []).toEqual([]);
  });

  it("한글·이모지가 포함된 body도 정확히 왕복한다", async () => {
    const code = await encodeShare(sampleReq({ body: "안녕 🐶 {\"x\":1}" }));
    expect((await decodeShare(code)).body).toBe("안녕 🐶 {\"x\":1}");
  });

  it("잘못된 접두어는 에러를 던진다", async () => {
    await expect(decodeShare("not-a-share-code")).rejects.toThrow();
  });

  it("깨진 코드는 에러를 던진다", async () => {
    await expect(decodeShare(SHARE_PREFIX + "!!!깨진!!!")).rejects.toThrow();
  });

  it("지원하지 않는 버전은 에러를 던진다", async () => {
    // v:2 를 강제로 인코딩
    const bad = sampleReq();
    (bad as unknown as { v: number }).v = 2;
    const code = await encodeShare(bad, { includeSecrets: true });
    await expect(decodeShare(code)).rejects.toThrow(/버전/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/share.test.ts`
Expected: FAIL — `encodeShare is not a function`

- [ ] **Step 3: 구현 추가**

`share.ts` 끝에 추가:

```ts
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export interface EncodeOptions {
  includeSecrets?: boolean;
}

/** 요청을 공유 코드 문자열로 인코딩. 기본은 민감 헤더 제외. */
export async function encodeShare(req: ShareableRequest, opts: EncodeOptions = {}): Promise<string> {
  const payload: ShareableRequest = { ...req };
  if (!opts.includeSecrets) {
    const excluded: string[] = [];
    payload.headers = req.headers.filter((h) => {
      if (isSecretHeader(h.key)) {
        excluded.push(h.key);
        return false;
      }
      return true;
    });
    payload.excludedSecrets = excluded;
  } else {
    payload.excludedSecrets = [];
  }
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const compressed = await gzip(bytes);
  return SHARE_PREFIX + toBase64Url(compressed);
}

/** 공유 코드 문자열을 ShareableRequest로 디코딩. 실패 시 throw. */
export async function decodeShare(code: string): Promise<ShareableRequest> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SHARE_PREFIX)) {
    throw new Error("공유 코드 형식이 아닙니다 (swaggerman:req: 로 시작해야 함)");
  }
  let parsed: ShareableRequest;
  try {
    const compressed = fromBase64Url(trimmed.slice(SHARE_PREFIX.length));
    const bytes = await gunzip(compressed);
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("공유 코드를 읽을 수 없습니다 (손상되었거나 형식이 잘못됨)");
  }
  if (parsed.v !== 1) {
    throw new Error(`지원하지 않는 공유 코드 버전입니다 (v${parsed.v})`);
  }
  return parsed;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/share.test.ts`
Expected: PASS (9개)

- [ ] **Step 5: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/core/share.ts src/core/share.test.ts`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/core/share.ts src/core/share.test.ts
git commit -m "기능: 요청 공유 인코딩 — gzip+base64url 왕복, 민감 헤더 제외

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ShareModal — 내보내기 탭

**Files:**
- Create: `src/components/ShareModal.tsx`
- Create: `src/components/ShareModal.test.tsx`

ShareModal은 현재 요청을 받아 코드를 만들거나(내보내기), 코드를 받아 적용한다(가져오기). 이 태스크는 **내보내기 탭만** 구현(가져오기는 Task 4).

Props 설계:
```ts
interface Props {
  /** 내보낼 현재 요청 (없으면 내보내기 탭 비활성) */
  current: ShareableRequest | null;
  /** 가져오기 적용 콜백 (Task 4에서 사용) */
  onApply: (req: ShareableRequest) => void;
  onClose: () => void;
}
```

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/components/ShareModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareModal } from "./ShareModal";
import type { ShareableRequest } from "../core/share";

const writeText = vi.fn();
beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

const current: ShareableRequest = {
  v: 1,
  method: "GET",
  url: "https://api.example.com/pets",
  pathParams: {},
  queryParams: [],
  headers: [
    { key: "Accept", value: "application/json", enabled: true },
    { key: "Authorization", value: "Bearer X", enabled: true },
  ],
  body: "",
};

describe("ShareModal 내보내기", () => {
  it("현재 요청으로 공유 코드를 생성해 표시한다", async () => {
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      const code = screen.getByLabelText("공유 코드") as HTMLTextAreaElement;
      expect(code.value.startsWith("swaggerman:req:")).toBe(true);
    });
  });

  it("민감 헤더 제외 안내를 표시한다", async () => {
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/민감.*제외|Authorization/)).toBeTruthy();
  });

  it("복사 버튼이 클립보드에 코드를 쓴다", async () => {
    writeText.mockClear();
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    await screen.findByLabelText("공유 코드");
    fireEvent.click(screen.getByRole("button", { name: /복사/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("swaggerman:req:"));
  });

  it("'민감정보 포함' 체크 시 코드가 다시 생성된다(민감 헤더 포함)", async () => {
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    const before = (await screen.findByLabelText("공유 코드") as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByLabelText(/민감정보 포함/));
    await waitFor(() => {
      const after = (screen.getByLabelText("공유 코드") as HTMLTextAreaElement).value;
      expect(after).not.toBe(before); // 페이로드가 달라져 코드도 달라짐
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/ShareModal.test.tsx`
Expected: FAIL — `Cannot find module './ShareModal'`

- [ ] **Step 3: 구현 (내보내기 탭 + 모달 골격)**

```tsx
// src/components/ShareModal.tsx
// 요청 공유: 내보내기(코드 생성·복사) / 가져오기(붙여넣기·적용) 모달.
import { useEffect, useState } from "react";
import { encodeShare, decodeShare, type ShareableRequest } from "../core/share";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  current: ShareableRequest | null;
  onApply: (req: ShareableRequest) => void;
  onClose: () => void;
}

export function ShareModal({ current, onApply, onClose }: Props) {
  useEscToClose(onClose);
  const [tab, setTab] = useState<"export" | "import">(current ? "export" : "import");

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal share-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>요청 공유</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>
        <div className="share-tabs">
          <button
            className={tab === "export" ? "active" : ""}
            disabled={!current}
            onClick={() => setTab("export")}
          >
            내보내기
          </button>
          <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>
            가져오기
          </button>
        </div>
        <div className="modal-body">
          {tab === "export" && current && <ExportTab current={current} />}
          {tab === "import" && <ImportTab onApply={onApply} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

function ExportTab({ current }: { current: ShareableRequest }) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [code, setCode] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    encodeShare(current, { includeSecrets }).then(async (c) => {
      if (!alive) return;
      setCode(c);
      // 제외된 민감 헤더 목록은 디코드해서 안내
      const decoded = await decodeShare(c);
      setExcluded(decoded.excludedSecrets ?? []);
    });
    return () => {
      alive = false;
    };
  }, [current, includeSecrets]);

  return (
    <div className="share-export">
      <p className="hint">이 코드를 복사해 동료에게 전달하세요. 받는 쪽은 "가져오기"에 붙여넣습니다.</p>
      <textarea className="share-code" aria-label="공유 코드" readOnly value={code} rows={4} />
      <div className="share-actions">
        <button
          className="btn small primary"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <CopyIcon size={13} /> {copied ? "복사됨" : "복사"}
        </button>
        <label className="share-secret-toggle">
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(e) => setIncludeSecrets(e.target.checked)}
          />
          민감정보 포함
        </label>
      </div>
      {includeSecrets ? (
        <div className="share-warn">⚠️ 토큰·비밀번호 등 민감 헤더가 코드에 포함됩니다. 신뢰하는 사람에게만 전달하세요.</div>
      ) : (
        excluded.length > 0 && (
          <div className="share-note">🔒 민감 헤더 {excluded.length}개 제외됨: {excluded.join(", ")}</div>
        )
      )}
    </div>
  );
}

// ImportTab은 Task 4에서 구현. 우선 stub.
function ImportTab({ onApply, onClose }: { onApply: (req: ShareableRequest) => void; onClose: () => void }) {
  void onApply;
  void onClose;
  return <div className="hint">가져오기는 다음 단계에서 구현됩니다.</div>;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/ShareModal.test.tsx`
Expected: PASS (4개)

- [ ] **Step 5: 커밋**

```bash
git add src/components/ShareModal.tsx src/components/ShareModal.test.tsx
git commit -m "기능: 요청 공유 모달 내보내기 탭 — 코드 생성·복사·민감 토글

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: ShareModal — 가져오기 탭

**Files:**
- Modify: `src/components/ShareModal.tsx` (ImportTab 교체)
- Modify: `src/components/ShareModal.test.tsx` (가져오기 테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`ShareModal.test.tsx` 끝에 추가:

```tsx
import { encodeShare } from "../core/share";

describe("ShareModal 가져오기", () => {
  it("유효한 코드를 붙여넣으면 미리보기를 표시하고 적용 콜백을 호출한다", async () => {
    const onApply = vi.fn();
    const code = await encodeShare(current); // 위 describe의 current 재사용
    render(<ShareModal current={null} onApply={onApply} onClose={vi.fn()} />);
    // current=null이라 가져오기 탭이 기본
    const input = screen.getByLabelText("공유 코드 입력") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: code } });
    // 미리보기에 메서드·URL 표시
    expect(await screen.findByText(/GET/)).toBeTruthy();
    expect(screen.getByText(/api.example.com\/pets/)).toBeTruthy();
    // 적용
    fireEvent.click(screen.getByRole("button", { name: /적용/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ method: "GET" }));
  });

  it("깨진 코드는 에러를 표시하고 적용 버튼이 비활성이다", async () => {
    render(<ShareModal current={null} onApply={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByLabelText("공유 코드 입력");
    fireEvent.change(input, { target: { value: "swaggerman:req:!!!깨짐" } });
    expect(await screen.findByText(/읽을 수 없습니다|형식/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /적용/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/ShareModal.test.tsx`
Expected: FAIL (가져오기 테스트들)

- [ ] **Step 3: ImportTab 구현 (stub 교체)**

`ShareModal.tsx`의 `ImportTab` 함수를 아래로 교체:

```tsx
function ImportTab({
  onApply,
  onClose,
}: {
  onApply: (req: ShareableRequest) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ShareableRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onText = (value: string) => {
    setText(value);
    setError(null);
    setPreview(null);
    if (!value.trim()) return;
    decodeShare(value)
      .then(setPreview)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="share-import">
      <p className="hint">받은 공유 코드를 붙여넣으면 현재 요청 화면에 적용됩니다.</p>
      <textarea
        className="share-code"
        aria-label="공유 코드 입력"
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="swaggerman:req:..."
        rows={4}
        spellCheck={false}
      />
      {error && <div className="share-warn">{error}</div>}
      {preview && (
        <div className="share-preview">
          <div className="share-preview-line">
            <span className="method">{preview.method}</span> {preview.url}
          </div>
          <div className="share-preview-meta">
            헤더 {preview.headers.length}개
            {preview.body ? " · Body 있음" : ""}
            {preview.note ? " · 메모 포함" : ""}
          </div>
          {preview.excludedSecrets && preview.excludedSecrets.length > 0 && (
            <div className="share-note">
              🔒 보낸 사람이 민감 헤더 {preview.excludedSecrets.length}개를 제외함:{" "}
              {preview.excludedSecrets.join(", ")}
            </div>
          )}
        </div>
      )}
      <div className="share-actions">
        <button
          className="btn small primary"
          disabled={!preview}
          onClick={() => {
            if (preview) {
              onApply(preview);
              onClose();
            }
          }}
        >
          적용
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/ShareModal.test.tsx`
Expected: PASS (6개)

- [ ] **Step 5: 커밋**

```bash
git add src/components/ShareModal.tsx src/components/ShareModal.test.tsx
git commit -m "기능: 요청 공유 모달 가져오기 탭 — 붙여넣기·미리보기·적용

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: App.tsx 통합 — 공유 버튼 + 적용 + CSS

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

가져오기 적용은 기존 cURL import 경로(`importCurl`)를 재활용한다. 공유에는 operation이 없으므로 ad-hoc operation을 만든다(curl.ts의 `curlToRequest`와 동일 패턴).

- [ ] **Step 1: import 추가**

`App.tsx` 상단에 추가:

```tsx
import { ShareModal } from "./components/ShareModal";
import type { ShareableRequest } from "./core/share";
import type { HTTPMethod } from "./core/types";
```

(`HTTPMethod`가 이미 import돼 있으면 중복 추가하지 말 것)

- [ ] **Step 2: state 추가**

`const [mockOpen, setMockOpen] = useState(false);` 근처에 추가:

```tsx
  const [shareOpen, setShareOpen] = useState(false);
```

- [ ] **Step 3: 현재 요청 → ShareableRequest 변환 + 적용 함수**

`importCurl` 함수 근처에 추가:

```tsx
  // 현재 화면 요청을 공유 페이로드로 변환(선택된 operation + inputs 기준).
  function currentShareable(): ShareableRequest | null {
    if (!selected || !inputs) return null;
    const url = buildRequestUrl(baseURL, selected, inputs, false, activeVars);
    const note = notes[selected.id];
    return {
      v: 1,
      method: selected.method,
      url,
      baseURL,
      pathParams: inputs.pathParams,
      queryParams: inputs.queryParams.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled })),
      headers: inputs.headers.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled })),
      body: inputs.body,
      bodyMode: inputs.bodyMode,
      note: note ? { text: note.text, status: note.status } : undefined,
    };
  }

  // 공유 코드 적용: ad-hoc operation으로 요청 화면에 반영(cURL import와 동일 경로).
  function applyShared(req: ShareableRequest) {
    let pathname = "/";
    let origin = req.baseURL ?? "";
    try {
      const u = new URL(req.url);
      pathname = u.pathname || "/";
      if (!origin) origin = u.origin;
    } catch {
      /* URL 파싱 실패 시 기본값 유지 */
    }
    const op: ParsedOperation = {
      id: `share:${req.method} ${pathname}`,
      method: req.method as HTTPMethod,
      path: pathname,
      tags: ["공유"],
      summary: "공유받은 요청",
      parameters: [],
      requestBody: req.body ? { required: false, contentType: "application/json" } : undefined,
      responses: [],
    };
    const ins: RequestInputs = {
      pathParams: req.pathParams ?? {},
      queryParams: req.queryParams ?? [],
      headers: req.headers ?? [],
      body: req.body ?? "",
      bodyMode: req.bodyMode as RequestInputs["bodyMode"],
    };
    importCurl(op, ins, origin);
    // 메모가 포함됐으면 해당 operation에 적용
    if (req.note) {
      updateNote(op.id, { text: req.note.text, status: req.note.status as never, updatedAt: Date.now() });
    }
  }
```

참고: `ParsedOperation`, `RequestInputs`, `buildRequestUrl`는 이미 App.tsx에 import돼 있다. `updateNote`/`notes`는 API 메모 기능에서 추가된 것(이미 존재). `note.status as never`는 ApiStatus 타입으로 좁히기 위함 — 실제로는 `as import("./core/notes").ApiStatus`가 더 명확하나, ApiNote 타입을 import해서 캐스팅: 상단 import에 `type ApiNote`가 있으면 `note.status as ApiNote["status"]` 사용.

정확한 캐스팅을 위해 Step 1 import를 다음으로 보강:
```tsx
import { ShareModal } from "./components/ShareModal";
import type { ShareableRequest } from "./core/share";
```
그리고 `applyShared`의 메모 적용 줄을 `notes.ts`의 타입에 맞춰:
```tsx
    if (req.note) {
      updateNote(op.id, { text: req.note.text, status: req.note.status as ApiNote["status"], updatedAt: Date.now() });
    }
```
(`ApiNote`는 이미 API 메모 작업에서 App.tsx에 import됨 — 확인하고 없으면 `import { ..., type ApiNote } from "./core/notes";`에 추가)

- [ ] **Step 4: 상단바 공유 버튼 추가**

"cURL" 버튼 마크업 근처에 추가:

```tsx
        <button
          className="btn"
          title="현재 요청을 공유 코드로 내보내거나, 받은 코드를 가져옵니다"
          onClick={() => setShareOpen(true)}
        >
          공유
        </button>
```

- [ ] **Step 5: 모달 렌더 추가**

`{mockOpen && spec && (<MockServerModal .../>)}` 근처에 추가:

```tsx
      {shareOpen && (
        <ShareModal
          current={currentShareable()}
          onApply={applyShared}
          onClose={() => setShareOpen(false)}
        />
      )}
```

- [ ] **Step 6: CSS 추가 (App.css 끝)**

```css
/* ============================================================
 * 요청 공유 모달
 * ============================================================ */
.modal.share-modal {
  width: 560px;
  max-width: 92vw;
}
.share-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px 0;
}
.share-tabs button {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}
.share-tabs button.active {
  color: var(--text);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.share-tabs button:disabled {
  opacity: 0.4;
  cursor: default;
}
.share-code {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  resize: vertical;
  word-break: break-all;
}
.share-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.share-secret-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--muted);
}
.share-warn {
  margin-top: 8px;
  padding: 6px 10px;
  background: #f8514920;
  border: 1px solid #f85149;
  border-radius: 6px;
  color: #f85149;
  font-size: 12px;
}
.share-note {
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
}
.share-preview {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.share-preview-line {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  word-break: break-all;
}
.share-preview-meta {
  color: var(--muted);
  font-size: 11px;
  margin-top: 4px;
}
```

- [ ] **Step 7: 타입체크 + 전체 테스트 + 빌드**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | tail -2`
Expected: 타입 에러 없음, 전체 PASS, 빌드 성공

- [ ] **Step 8: 커밋**

```bash
git add src/App.tsx src/App.css
git commit -m "기능: 상단바 공유 버튼 + 공유 코드 적용(ad-hoc operation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 검증 + 브라우저 모드 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 자동 검증**

```bash
npx eslint . && npx tsc --noEmit && npx vitest run && npm run build
```
Expected: 모두 PASS (기존 AiPanel react-refresh 경고 1건은 무관)

- [ ] **Step 2: 브라우저 모드 수동 확인**

```bash
npm run dev
```
Chrome DevTools MCP로 `http://localhost:1420`:
1. Petstore 로드 → API 선택 → 헤더에 `Authorization: Bearer x` 추가
2. 상단바 "공유" → 내보내기 탭: 코드 생성 확인, "🔒 민감 헤더 1개 제외됨: Authorization" 표시 확인
3. 코드 복사 → 가져오기 탭에 붙여넣기 → 미리보기(메서드/URL/제외 안내) 확인
4. "적용" → 요청 화면이 공유 요청으로 채워지는지 확인(Authorization 없음 확인)
5. "민감정보 포함" 체크 → 코드 바뀌고 경고 표시 → 적용 시 Authorization 포함 확인

- [ ] **Step 3: 발견된 문제 수정 후 커밋** (있을 때만)

---

## Self-Review 체크

- **스펙 커버리지**: 페이로드 타입(Task1,2) ✓ / gzip+base64url 인코딩(Task2) ✓ / 민감 헤더 제외+기록(Task1,2) ✓ / includeSecrets 옵션(Task2,3) ✓ / 내보내기 UI·복사·안내(Task3) ✓ / 가져오기 미리보기·적용(Task4) ✓ / 상단바 버튼·적용 경로(Task5) ✓ / 에러 처리(Task2 decode, Task4 인라인) ✓ / note·baseURL 포함(Task1,5) ✓
- **CompressionStream 테스트**: Node 20 전역 제공 확인됨 → 폴리필 불필요(사전 검증). share.test.ts는 node 환경, ShareModal.test.tsx는 jsdom이나 Node 글로벌 유지됨.
- **타입 일관성**: ShareableRequest/ShareParam/EncodeOptions가 share.ts에서 정의, ShareModal·App에서 동일 import ✓. encodeShare(req, opts)/decodeShare(code) 시그니처 일관 ✓. applyShared의 ApiNote["status"] 캐스팅은 notes.ts 타입 기준 ✓
- **플레이스홀더 없음** ✓ (Task3의 ImportTab stub은 Task4에서 교체하도록 명시 — 의도된 점진 구현)
