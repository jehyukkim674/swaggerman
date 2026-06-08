# 파일에서 프로젝트 가져오기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 OpenAPI 스펙 파일(JSON/YAML)을 OS 다이얼로그로 골라 스냅샷으로 복사해 프로젝트로 가져온다.

**Architecture:** 합성 키 `swaggerman:file:<id>`를 `Project.url`로 써서 기존 URL-키 모델을 그대로 재사용한다. 스펙 원본 텍스트는 전용 IndexedDB DB(`swaggerman-imports`)에 저장하고, `loadSpec`은 합성 키일 때 네트워크 대신 스냅샷에서 읽어 재파싱한다.

**Tech Stack:** React + TypeScript, Vite, Vitest(+fake-indexeddb), Tauri(`@tauri-apps/plugin-dialog`의 `open`, `core/fs`의 `readTextFile`), IndexedDB, js-yaml.

작업 디렉터리: `apps/desktop`. 모든 경로는 그 기준이다.

---

## File Structure

- **신규** `src/core/imported-spec-store.ts` — 파일 스냅샷 IndexedDB 저장소 + 합성 키 상수/판별자(`FILE_PROJECT_PREFIX`, `isFileProject`). 단일 책임: 가져온 스펙 텍스트의 영속화.
- **신규** `src/core/imported-spec-store.test.ts` — 위 모듈 테스트.
- **수정** `src/core/request-builder.ts` — `pickFileBaseURL(servers)` 순수 함수 추가(`deriveBaseURL` 옆).
- **수정** `src/core/request-builder.test.ts` — `pickFileBaseURL` 테스트 추가.
- **수정** `src/components/ProjectsModal.tsx` — `fileName` 필드, `onImportFile`/`onReimportFile` props, "파일에서 가져오기" 버튼, 파일 프로젝트 행 렌더.
- **수정** `src/components/ProjectsModal.test.tsx` — import 버튼·파일 행 테스트 추가.
- **수정** `src/App.tsx` — import/reimport 핸들러, `loadSpec` 파일 분기, `removeProject` 스냅샷 정리, 부팅·specUrl sanitize, 타입 필드, props 배선.

---

## Task 1: 스냅샷 저장소 모듈 (`imported-spec-store.ts`)

**Files:**
- Create: `src/core/imported-spec-store.ts`
- Test: `src/core/imported-spec-store.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/core/imported-spec-store.test.ts`:

```ts
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  saveImportedSpec,
  loadImportedSpec,
  deleteImportedSpec,
  isFileProject,
  FILE_PROJECT_PREFIX,
} from "./imported-spec-store";

const rec = (over: Partial<Parameters<typeof saveImportedSpec>[0]> = {}) => ({
  url: `${FILE_PROJECT_PREFIX}abc`,
  fileName: "api.yaml",
  content: "openapi: 3.0.0",
  importedAt: 123,
  ...over,
});

describe("imported-spec-store", () => {
  it("저장 후 같은 키로 로드하면 레코드가 보존된다", async () => {
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}rt` }));
    const got = await loadImportedSpec(`${FILE_PROJECT_PREFIX}rt`);
    expect(got?.fileName).toBe("api.yaml");
    expect(got?.content).toBe("openapi: 3.0.0");
    expect(got?.importedAt).toBe(123);
  });

  it("같은 키 저장은 덮어쓴다", async () => {
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}ov`, content: "v1" }));
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}ov`, content: "v2" }));
    const got = await loadImportedSpec(`${FILE_PROJECT_PREFIX}ov`);
    expect(got?.content).toBe("v2");
  });

  it("없는 키는 null", async () => {
    expect(await loadImportedSpec(`${FILE_PROJECT_PREFIX}none`)).toBeNull();
  });

  it("삭제 후 로드하면 null", async () => {
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}del` }));
    await deleteImportedSpec(`${FILE_PROJECT_PREFIX}del`);
    expect(await loadImportedSpec(`${FILE_PROJECT_PREFIX}del`)).toBeNull();
  });

  it("isFileProject는 접두사로 판별", () => {
    expect(isFileProject(`${FILE_PROJECT_PREFIX}x`)).toBe(true);
    expect(isFileProject("https://a.com/api-docs")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/imported-spec-store.test.ts`
Expected: FAIL — `Failed to resolve import "./imported-spec-store"` (모듈 없음).

- [ ] **Step 3: 모듈 구현**

Create `src/core/imported-spec-store.ts`:

```ts
// 파일에서 가져온(import) OpenAPI 스펙의 원본 텍스트를 IndexedDB에 보관한다.
// spec-cache(네트워크 캐시)와 분리된 전용 저장소 — 사용자 데이터라 캐시 정리 대상이 아니고,
// 저장 실패는 throw해서 import 실패를 호출처가 알 수 있게 한다.

export const FILE_PROJECT_PREFIX = "swaggerman:file:";
export const isFileProject = (url: string): boolean => url.startsWith(FILE_PROJECT_PREFIX);

const DB_NAME = "swaggerman-imports";
const STORE = "specs";

export interface ImportedSpecRecord {
  url: string; // 합성 키 swaggerman:file:<id>
  fileName: string; // 표시용 원본 파일명(basename)
  content: string; // 원본 스펙 텍스트(JSON/YAML 그대로)
  importedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "url" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** 스냅샷 저장(덮어쓰기). 실패 시 throw(= import 실패를 호출처에 전파). */
export async function saveImportedSpec(rec: ImportedSpecRecord): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 합성 키로 스냅샷 조회. 없거나 오류면 null. */
export async function loadImportedSpec(url: string): Promise<ImportedSpecRecord | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(url);
      req.onsuccess = () => resolve((req.result as ImportedSpecRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 합성 키 스냅샷 삭제. 실패는 무시(no-op). */
export async function deleteImportedSpec(url: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* no-op */
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/imported-spec-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/core/imported-spec-store.ts src/core/imported-spec-store.test.ts
git commit -m "기능: 파일 스냅샷 IndexedDB 저장소 추가(imported-spec-store)"
```

---

## Task 2: 파일 프로젝트 baseURL 헬퍼 (`pickFileBaseURL`)

합성 키로 `deriveBaseURL`을 호출하면 `new URL("swaggerman:file:..").origin === "null"`이 되어
baseURL이 `"null"` 문자열로 오염된다. 파일 프로젝트는 `servers`의 첫 절대 URL만 쓰는 별도 헬퍼로 처리한다.

**Files:**
- Modify: `src/core/request-builder.ts` (`deriveBaseURL` 함수 정의 바로 뒤, 현재 250행 부근)
- Test: `src/core/request-builder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/core/request-builder.test.ts` 파일 끝에 추가(파일 상단 import에 `pickFileBaseURL`가 포함되도록, 기존 `from "./request-builder"` import 구문에 이름 추가):

```ts
import { pickFileBaseURL } from "./request-builder";

describe("pickFileBaseURL", () => {
  it("servers 중 첫 절대(http/https) URL을 반환", () => {
    expect(pickFileBaseURL(["/v1", "https://api.x.com"])).toBe("https://api.x.com");
    expect(pickFileBaseURL(["http://a.com", "https://b.com"])).toBe("http://a.com");
  });
  it("절대 서버가 없으면 빈 문자열", () => {
    expect(pickFileBaseURL([])).toBe("");
    expect(pickFileBaseURL(["/rel", "{var}/api"])).toBe("");
  });
});
```

> 참고: `request-builder.test.ts`에 이미 `import { ... } from "./request-builder";` 구문이 있으면 거기에 `pickFileBaseURL`만 추가하고, 위 `import` 줄은 생략한다(중복 import 금지). `describe` 블록만 파일 끝에 추가하면 된다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/request-builder.test.ts -t pickFileBaseURL`
Expected: FAIL — `pickFileBaseURL is not a function` / import 해결 실패.

- [ ] **Step 3: 구현**

`src/core/request-builder.ts`에서 `deriveBaseURL` 함수가 끝나는 `}` 바로 다음 줄에 추가:

```ts
/** 파일 프로젝트용 baseURL: servers 중 첫 절대(http/https) URL, 없으면 "". */
export function pickFileBaseURL(specServers: string[]): string {
  return specServers.find((s) => /^https?:\/\//.test(s)) ?? "";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/request-builder.test.ts`
Expected: PASS (기존 + 신규 2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/core/request-builder.ts src/core/request-builder.test.ts
git commit -m "기능: 파일 프로젝트 baseURL 헬퍼 pickFileBaseURL 추가"
```

---

## Task 3: ProjectsModal UI (가져오기 버튼 + 파일 행)

**Files:**
- Modify: `src/components/ProjectsModal.tsx`
- Test: `src/components/ProjectsModal.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`src/components/ProjectsModal.test.tsx` 수정.

(1) import 줄에 `waitFor` 추가:

```ts
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
```

(2) `setup()` 기본 props에 두 핸들러 추가(기존 props 객체에 아래 2줄 삽입):

```ts
    onImportFile: vi.fn().mockResolvedValue(""),
    onReimportFile: vi.fn().mockResolvedValue(""),
```

(3) `describe("ProjectsModal", ...)` 안에 테스트 2개 추가:

```ts
  it("'파일에서 가져오기' 클릭 시 onImportFile 호출 후 메시지 표시", async () => {
    const onImportFile = vi.fn().mockResolvedValue("'api.yaml'을(를) 가져왔습니다.");
    setup({ onImportFile });
    fireEvent.click(screen.getByText("파일에서 가져오기"));
    await waitFor(() => expect(onImportFile).toHaveBeenCalled());
    expect(screen.getByText(/가져왔습니다/)).toBeTruthy();
  });

  it("파일 프로젝트 행은 파일명을 읽기전용 표시 + '다시 가져오기' 버튼, URL 입력 없음", () => {
    setup({
      projects: [{ url: "swaggerman:file:abc", title: "내 파일 API", fileName: "petstore.yaml" }],
      activeUrl: "swaggerman:file:abc",
    });
    expect(screen.getByText(/petstore\.yaml/)).toBeTruthy();
    expect(screen.getByText("다시 가져오기")).toBeTruthy();
    expect(screen.queryByDisplayValue("swaggerman:file:abc")).toBeNull();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/ProjectsModal.test.tsx`
Expected: FAIL — "파일에서 가져오기" 텍스트/`다시 가져오기` 없음, 타입상 `onImportFile` 미정 prop.

- [ ] **Step 3: 구현 — props/타입 확장**

`src/components/ProjectsModal.tsx` 상단 import에 추가:

```ts
import { isFileProject } from "../core/imported-spec-store";
```

`ProjectEntry` 인터페이스에 `fileName` 추가:

```ts
export interface ProjectEntry {
  url: string;
  title: string;
  fileName?: string;
}
```

`Props` 인터페이스에 두 prop 추가(`onAdd` 다음 줄):

```ts
  /** 파일에서 새 프로젝트 가져오기(성공 메시지 반환, 취소 시 ""). */
  onImportFile: () => Promise<string>;
  /** 파일 프로젝트 스냅샷을 새 파일로 갱신(성공 메시지 반환, 취소 시 ""). */
  onReimportFile: (url: string) => Promise<string>;
```

함수 시그니처 구조분해에 두 핸들러 추가:

```ts
export function ProjectsModal({
  projects,
  activeUrl,
  onUpdate,
  onLoad,
  onDelete,
  onAdd,
  onImportFile,
  onReimportFile,
  onClose,
}: Props) {
```

- [ ] **Step 4: 구현 — 상태/핸들러 + 파일 행 + 가져오기 버튼**

`useEscToClose(onClose);` 다음, 기존 `const [newTitle...]`/`const [newUrl...]` 옆에 상태/핸들러 추가:

```ts
  const [msg, setMsg] = useState("");

  const runImport = async () => {
    try {
      const m = await onImportFile();
      if (m) setMsg(m);
    } catch (e) {
      setMsg(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const runReimport = async (url: string) => {
    try {
      const m = await onReimportFile(url);
      if (m) setMsg(m);
    } catch (e) {
      setMsg(`다시 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
```

`projects.map(...)` 행 렌더를 아래로 교체(파일/URL 분기):

```tsx
          {projects.map((p, i) => {
            const file = isFileProject(p.url);
            return (
              <div className={p.url === activeUrl ? "proj-row active" : "proj-row"} key={p.url + i}>
                <input
                  className="proj-name"
                  value={p.title}
                  onChange={(e) => patch(i, { title: e.target.value })}
                  placeholder="이름"
                  spellCheck={false}
                  title="프로젝트 이름"
                />
                {file ? (
                  <span className="proj-file" title="가져온 파일">
                    📄 {p.fileName || "(파일)"}
                  </span>
                ) : (
                  <input
                    className="proj-url"
                    value={p.url}
                    onChange={(e) => patch(i, { url: e.target.value })}
                    placeholder="스펙 URL"
                    spellCheck={false}
                    title="OpenAPI 스펙 URL"
                  />
                )}
                <button className="btn small" onClick={() => onLoad(p.url)} title="이 스펙을 불러오기">
                  열기
                </button>
                {file && (
                  <button
                    className="btn small"
                    onClick={() => runReimport(p.url)}
                    title="파일에서 다시 가져오기(히스토리 보존)"
                  >
                    다시 가져오기
                  </button>
                )}
                <button
                  className="btn small icon danger"
                  onClick={() => onDelete(p.url)}
                  title="삭제(히스토리·즐겨찾기 포함)"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
```

"새 프로젝트 추가" 블록(`<div className="proj-add">`)의 `<div className="field-label">새 프로젝트 추가</div>` 다음 줄에 가져오기 버튼 + 메시지 추가:

```tsx
            <div className="proj-import-row">
              <button className="btn small" onClick={runImport} title="OpenAPI 스펙 파일(JSON/YAML)에서 가져오기">
                파일에서 가져오기
              </button>
              {msg && <span className="hint">{msg}</span>}
            </div>
```

마지막으로 `src/App.css`의 `.proj-add` 규칙(현재 2498행) 다음에 새 클래스 스타일 추가
(`.proj-file`은 `.proj-url`과 같은 슬롯을 채우고, `.proj-import-row`는 정렬용):

```css
.proj-file {
  flex: 1;
  min-width: 0;
  color: var(--muted, #888);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-import-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0 10px;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/components/ProjectsModal.test.tsx`
Expected: PASS (기존 + 신규 2 tests).

- [ ] **Step 6: 커밋**

```bash
git add src/components/ProjectsModal.tsx src/components/ProjectsModal.test.tsx src/App.css
git commit -m "기능: ProjectsModal에 파일 가져오기/다시 가져오기 UI"
```

---

## Task 4: App.tsx 배선 (핸들러 · loadSpec 분기 · 정리)

App은 최상위 단위 테스트가 없으므로 검증은 `typecheck` + 전체 `test` + `build` + 수동 스모크로 한다.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: import 추가/수정**

(1) 81–82행 교체:

```ts
import { save, open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "./core/fs";
```

(2) request-builder import 블록(10–20행)의 `deriveBaseURL,` 다음 줄에 추가:

```ts
  pickFileBaseURL,
```

(3) import 영역 아무 곳(예: `./core/spec-cache` import 부근)에 추가:

```ts
import { parseSpecText } from "./core/openapi-parser";
import {
  FILE_PROJECT_PREFIX,
  isFileProject,
  saveImportedSpec,
  loadImportedSpec,
  deleteImportedSpec,
} from "./core/imported-spec-store";
```

- [ ] **Step 2: 타입 + 초기화 sanitize**

(1) `Project` 인터페이스(101–104행)에 `fileName` 추가:

```ts
interface Project {
  url: string;
  title: string;
  fileName?: string;
}
```

(2) `specUrl` useState(118–120행) 교체(부팅 시 합성 키 노출 차단):

```ts
  const [specUrl, setSpecUrl] = useState(() => {
    const last = loadJSON("swaggerman.lastSpecUrl", DEFAULT_SPEC_URL);
    return isFileProject(last) ? "" : last;
  });
```

(3) 부팅 자동 로드 effect(528–532행) 교체(저장된 키로 로드 — 파일이면 스냅샷):

```ts
  // 시작 시 마지막으로 사용한 spec 자동 로드(파일 프로젝트면 합성 키로 스냅샷 로드)
  useEffect(() => {
    const last = loadJSON("swaggerman.lastSpecUrl", DEFAULT_SPEC_URL);
    if (last) loadSpec(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: `loadSpec` 파일 분기**

`loadSpec` 함수 전체(594–677행)를 아래로 교체:

```ts
  async function loadSpec(targetUrl: string = specUrl) {
    setSpecUrl(isFileProject(targetUrl) ? "" : targetUrl);
    setLoading(true);
    setLoadError(null);
    setStaleSpec(null);
    log.info("spec", `로딩 시작: ${targetUrl}`);
    try {
      let parsed: ParsedSpec;
      if (isFileProject(targetUrl)) {
        // 파일 프로젝트: 네트워크/캐시폴백 없이 IndexedDB 스냅샷에서 읽어 재파싱.
        const rec = await loadImportedSpec(targetUrl);
        if (!rec) {
          log.error("spec", "가져온 스펙 스냅샷을 찾을 수 없음");
          setLoadError("가져온 스펙을 찾을 수 없습니다. 다시 가져오세요.");
          setSpec(null);
          return;
        }
        try {
          parsed = parseSpecText(rec.content);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log.error("spec", `가져온 스펙 파싱 실패: ${msg}`);
          setLoadError(`스펙 파싱 실패: ${msg}`);
          setSpec(null);
          return;
        }
        log.info(
          "spec",
          `파일 스펙 로드: "${parsed.info.title}" (오퍼레이션 ${parsed.operations.length}개)`,
        );
      } else {
        try {
          parsed = await loadSpecFromUrl(targetUrl, netSettings.insecure);
          log.info(
            "spec",
            `로딩 성공: "${parsed.info.title}" (오퍼레이션 ${parsed.operations.length}개)`,
          );
          void saveSpecCache(targetUrl, parsed); // 성공 결과 캐시(실패는 모듈이 흡수)
        } catch (e) {
          // 로딩 실패: 같은 URL의 직전 성공 스펙이 캐시에 있으면 그것으로 폴백한다.
          const msg = e instanceof Error ? e.message : String(e);
          const cached = await loadSpecCache(targetUrl);
          if (!cached) {
            log.error("spec", `로딩 실패: ${msg}`);
            setLoadError(msg);
            setSpec(null);
            return;
          }
          log.warn("spec", `로딩 실패(${msg}) → 캐시된 스펙으로 폴백`);
          parsed = cached.spec;
          setStaleSpec({ savedAt: cached.savedAt, error: msg });
        }
      }
      // ---- 성공/캐시 폴백 공용 적용: 스펙과 URL별 상태를 복원 ----
      setSpec(parsed);
      setBaseURL(
        isFileProject(targetUrl)
          ? pickFileBaseURL(parsed.servers)
          : deriveBaseURL(targetUrl, parsed.servers),
      );
      setActiveSpecUrl(targetUrl);
      saveJSON("swaggerman.lastSpecUrl", targetUrl);
      // 프로젝트 목록에 upsert(최근 것을 맨 앞으로). 기존 사용자 지정 이름/fileName은 보존.
      setProjects((prev) => {
        const existing = prev.find((p) => p.url === targetUrl);
        return [
          {
            ...existing,
            url: targetUrl,
            title: existing?.title || parsed.info.title || existing?.fileName || targetUrl,
          },
          ...prev.filter((p) => p.url !== targetUrl),
        ];
      });
      setFavorites(loadJSON(`swaggerman.fav.${targetUrl}`, [] as string[]));
      setNotes(loadNotes(targetUrl));
      setHistory(loadJSON(`swaggerman.hist.${targetUrl}`, [] as HistoryItem[]));
      setAuthValues(loadJSON(`swaggerman.auth.${targetUrl}`, {} as Record<string, string>));
      setEnvs(loadJSON(`swaggerman.envs.${targetUrl}`, [] as Env[]));
      setActiveEnvName(loadJSON(`swaggerman.activeEnv.${targetUrl}`, ""));
      setChainVars({});
      setExtractRules(
        loadJSON(`swaggerman.extract.${targetUrl}`, {} as Record<string, ExtractRule[]>),
      );
      setAssertions(loadJSON(`swaggerman.assert.${targetUrl}`, {} as Record<string, Assertion[]>));
      setAssertResults([]);
      setSchemaIssues([]);
      setOauth2Config(loadJSON(`swaggerman.oauth2.${targetUrl}`, emptyOAuth2Config()));
      setBodySamples(
        loadJSON(`swaggerman.samples.${targetUrl}`, {} as Record<string, RequestSample[]>),
      );
      setGlobalHeaders(loadJSON(`swaggerman.headers.${targetUrl}`, [] as RequestParam[]));
      setSnapshots(loadSnapshots(targetUrl));
      opCacheRef.current.clear();
      // 마지막 위치·요청 정보 복원
      const savedIns = loadJSON(
        `swaggerman.inputs.${targetUrl}`,
        {} as Record<string, RequestInputs>,
      );
      setSavedInputs(savedIns);
      const lastOpId = loadJSON(`swaggerman.lastOp.${targetUrl}`, "");
      const lastOp = parsed.operations.find((o) => o.id === lastOpId);
      if (lastOp) {
        setSelected(lastOp);
        setInputs(restoreInputs(savedIns, lastOp));
        log.info("ui", `마지막 위치 복원: ${lastOp.method} ${lastOp.path}`);
      } else {
        setSelected(null);
        setInputs(null);
      }
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 4: import/reimport 핸들러 + removeProject 정리**

`addProject` 함수(788–794행) 바로 다음에 추가:

```ts
  async function importProjectFromFile(): Promise<string> {
    const path = await open({
      multiple: false,
      title: "OpenAPI 스펙 파일 가져오기",
      filters: [{ name: "OpenAPI (JSON/YAML)", extensions: ["json", "yaml", "yml"] }],
    });
    if (typeof path !== "string") return ""; // 취소
    const content = await readTextFile(path);
    const parsed = parseSpecText(content); // 검증 + title 추출(실패 시 throw → 모달이 표시)
    const fileName = path.split(/[\\/]/).pop() || path;
    const url = `${FILE_PROJECT_PREFIX}${newId()}`;
    await saveImportedSpec({ url, fileName, content, importedAt: Date.now() });
    setProjects((prev) => [
      { url, title: parsed.info.title || fileName, fileName },
      ...prev.filter((p) => p.url !== url),
    ]);
    await loadSpec(url); // 모달은 닫지 않음 — 성공 메시지를 보여주고 사용자가 닫는다
    return `'${fileName}'을(를) 가져왔습니다.`;
  }

  async function reimportProjectFromFile(url: string): Promise<string> {
    const path = await open({
      multiple: false,
      title: "파일에서 다시 가져오기",
      filters: [{ name: "OpenAPI (JSON/YAML)", extensions: ["json", "yaml", "yml"] }],
    });
    if (typeof path !== "string") return ""; // 취소
    const content = await readTextFile(path);
    parseSpecText(content); // 검증만(실패 시 throw)
    const fileName = path.split(/[\\/]/).pop() || path;
    await saveImportedSpec({ url, fileName, content, importedAt: Date.now() });
    setProjects((prev) => prev.map((p) => (p.url === url ? { ...p, fileName } : p)));
    if (activeSpecUrl === url) await loadSpec(url);
    return `'${fileName}'(으)로 갱신했습니다.`;
  }
```

`removeProject` 함수(679–686행)의 마지막 `localStorage.removeItem(...)` 다음, 닫는 `}` 앞에 추가:

```ts
    if (isFileProject(url)) void deleteImportedSpec(url);
```

- [ ] **Step 5: ProjectsModal에 props 배선**

`<ProjectsModal ... />` 사용처(1559–1572행)의 `onAdd={addProject}` 다음에 추가:

```tsx
          onImportFile={importProjectFromFile}
          onReimportFile={reimportProjectFromFile}
```

- [ ] **Step 6: 타입체크 / 전체 테스트 / 빌드 통과 확인**

```bash
npm run typecheck
npx vitest run
npm run build
```
Expected: 모두 통과(타입 에러 0, 전체 테스트 green, 빌드 성공).

> `FILE_PROJECT_PREFIX`를 import만 하고 안 쓰면 lint(unused) 경고가 날 수 있다. Step 4의
> `importProjectFromFile`에서 `${FILE_PROJECT_PREFIX}${newId()}`로 사용하므로 정상이다.
> `save`(plugin-dialog)·`writeTextFile`은 기존 가이드 저장 기능에서 계속 쓰이므로 유지한다.

- [ ] **Step 7: 수동 스모크(권장, tauri dev)**

`npm run tauri dev`로 실행 후:
1. ✏️(프로젝트 관리) → "파일에서 가져오기" → 로컬 `.json`/`.yaml` OpenAPI 파일 선택 → "가져왔습니다" 메시지 + 좌측 오퍼레이션 목록 채워짐 확인.
2. 앱 재실행 → 마지막 파일 프로젝트가 자동 로드되고 URL 입력란에 `swaggerman:file:` 안 보임 확인.
3. 프로젝트 관리에서 파일 행이 `📄 파일명`(읽기전용) + "다시 가져오기" 표시, 삭제 시 목록에서 사라짐 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/App.tsx
git commit -m "기능: 파일에서 프로젝트 가져오기 App 배선(import/reimport·loadSpec 분기·정리)"
```

---

## 완료 기준

- [ ] `npx vitest run` 전체 green (신규 store/헬퍼/모달 테스트 포함).
- [ ] `npm run typecheck`·`npm run build` 통과.
- [ ] 파일 import → 로드 → 재실행 자동 로드 → 삭제(스냅샷 정리)가 수동 스모크로 동작.
- [ ] URL 입력란·재로드·stale 배너에 합성 키가 노출되지 않음.
