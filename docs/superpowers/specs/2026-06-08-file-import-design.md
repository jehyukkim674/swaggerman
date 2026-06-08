# 파일에서 프로젝트 가져오기 (스냅샷 import)

- 날짜: 2026-06-08
- 상태: 설계 승인됨

## 문제

현재 프로젝트(`{ url, title }`)는 **스펙 URL로만** 추가할 수 있다. 로컬에 OpenAPI
스펙 파일(JSON/YAML)을 가진 사용자는 그 파일을 서버에 올리거나 URL로 노출하지 않으면
SwaggerMan에서 열 수 없다. 사내망/오프라인/생성 직후 등 URL이 없는 상황에서 파일을
바로 프로젝트로 가져오는 수단이 필요하다.

## 목표

OS 파일 다이얼로그로 고른 로컬 OpenAPI 스펙 파일을 **프로젝트로 가져온다.** 가져온
프로젝트는 목록에 저장되어 재실행·재선택 시 다시 열 수 있고, 기존 프로젝트와 동일하게
히스토리·즐겨찾기·메모 등 URL-키 기반 상태를 가진다.

## 결정 사항 (사용자 확정)

- **가져오기 방식 = 스냅샷(내용 복사)**: 파일을 한 번 읽어 스펙 내용을 앱 저장소에 복사한다.
  원본 파일을 옮기거나 지워도 프로젝트는 그대로 열린다. 파일이 바뀌면 **"다시 가져오기"**
  로 갱신한다. (대안인 "파일 링크(매번 재읽기)"·"하이브리드"는 견고성·단순성 이유로 기각.)
- **진입점 = 프로젝트 관리 모달**(`ProjectsModal`)의 "새 프로젝트 추가" 영역. (메인 툴바는 제외.)
- **재가져오기 포함**: 같은 프로젝트(같은 키)에 스냅샷만 덮어써 히스토리/상태를 보존.

## 핵심 설계 — 합성 키로 기존 URL-키 모델 재사용

앱의 모든 프로젝트별 상태(히스토리·즐겨찾기·인증·메모·환경변수·스냅샷 등)는 스펙
**URL을 키**로 `localStorage`에 저장된다. 파일 프로젝트도 이 모델에 그대로 태우기 위해
**합성 키** `swaggerman:file:<id>`를 `Project.url`에 넣는다. 이렇게 하면 per-URL 저장
머신러리·UI(Select·삭제·재로드)를 변경 없이 재사용하고, 기존 저장 프로젝트의 마이그레이션이
필요 없다.

판별 기준은 **단일하게** 키 접두사로 한다:

```ts
export const FILE_PROJECT_PREFIX = "swaggerman:file:";
export const isFileProject = (url: string): boolean => url.startsWith(FILE_PROJECT_PREFIX);
```

## 구성 요소

### 1. `src/core/imported-spec-store.ts` (신규) — 스냅샷 저장소

스냅샷은 기존 `spec-cache.ts`를 **재사용하지 않고 전용 IndexedDB DB**에 둔다.
이유: (1) `spec-cache`는 "버려도 되는" 캐시라 향후 캐시 비우기 기능에 삭제될 위험,
(2) `spec-cache`는 저장 실패를 조용히 삼켜 import 실패를 사용자에게 못 알림,
(3) `ParsedSpec`(고정 파싱본)이 아니라 **원본 텍스트**를 저장해 열 때 재파싱 →
파서 개선 혜택을 받고 데이터가 더 작고 이식성 있음.

DB `swaggerman-imports`, object store `specs`(keyPath: `url`, 합성 키).

```ts
interface ImportedSpecRecord {
  url: string;        // 합성 키 swaggerman:file:<id>
  fileName: string;   // 표시용 원본 파일명(basename)
  content: string;    // 원본 스펙 텍스트(JSON/YAML 그대로)
  importedAt: number;
}

// 저장 실패 시 throw(= import 실패를 명확히 표시). spec-cache와 다른 점.
export async function saveImportedSpec(rec: ImportedSpecRecord): Promise<void>;
export async function loadImportedSpec(url: string): Promise<ImportedSpecRecord | null>;
export async function deleteImportedSpec(url: string): Promise<void>;
```

- `openDB()`는 단일 Promise 캐싱, `onupgradeneeded`에서 store 생성.
- `loadImportedSpec`/`deleteImportedSpec`은 부재/오류에 관대(`null`/no-op). `saveImportedSpec`만
  실패 시 throw(트랜잭션 `onerror`/`onabort`을 reject로 전파).

### 2. `src/App.tsx` — import 흐름

```ts
async function importProjectFromFile(): Promise<string> {
  const path = await open({
    multiple: false,
    title: "OpenAPI 스펙 파일 가져오기",
    filters: [{ name: "OpenAPI (JSON/YAML)", extensions: ["json", "yaml", "yml"] }],
  });
  if (typeof path !== "string") return "";            // 취소
  const content = await readTextFile(path);
  const parsed = parseSpecText(content);              // 검증 + info.title 추출(throw→실패 메시지)
  const fileName = path.split(/[\\/]/).pop() ?? path;
  const url = `${FILE_PROJECT_PREFIX}${newId()}`;
  await saveImportedSpec({ url, fileName, content, importedAt: Date.now() });
  setProjects((prev) => [{ url, title: parsed.info.title || fileName, fileName },
                         ...prev.filter((p) => p.url !== url)]);
  await loadSpec(url);                                // 바로 열기
  return `'${fileName}'을(를) 가져왔습니다.`;
}
```

- 실패(취소 제외)는 호출처(모달)에서 try/catch로 잡아 상태 메시지로 표시.
- 재가져오기 `reimportProjectFromFile(url)`: 같은 `url` 키에 `saveImportedSpec` 덮어쓰고,
  활성 프로젝트면 `loadSpec(url)` 재호출. `Project.title`은 보존, `fileName`만 갱신.

### 3. `src/App.tsx` `loadSpec()` — 파일 분기

`loadSpec` 진입부에서 파일 프로젝트면 네트워크·캐시폴백 경로를 건너뛴다.

```ts
async function loadSpec(targetUrl = specUrl) {
  setSpecUrl(isFileProject(targetUrl) ? "" : targetUrl);   // (D) 합성 키 노출 차단
  setLoading(true); setLoadError(null); setStaleSpec(null);
  try {
    let parsed: ParsedSpec;
    if (isFileProject(targetUrl)) {
      const rec = await loadImportedSpec(targetUrl);
      if (!rec) { setLoadError("가져온 스펙을 찾을 수 없습니다. 다시 가져오세요."); setSpec(null); return; }
      try { parsed = parseSpecText(rec.content); }
      catch (e) { setLoadError(`스펙 파싱 실패: ${msg(e)}`); setSpec(null); return; }
      // staleSpec 안 띄움, saveSpecCache 안 함(파일은 stale/네트워크 캐시 대상 아님)
    } else {
      /* 기존 네트워크 + 캐시 폴백 경로 그대로 */
    }
    // ---- 공용 적용(setSpec, baseURL, projects upsert, per-url 상태 로드) ----
  } finally { setLoading(false); }
}
```

- **baseURL**: 파일 프로젝트는 `parsed.servers` 중 첫 절대(`http(s)://`) URL, 없으면 `""`.
  (`deriveBaseURL`을 합성 키로 호출하면 `new URL("swaggerman:file:..").origin === "null"` 버그.)
  사용자는 config-bar에서 baseURL을 수정할 수 있다.
- **projects upsert**: 기존 항목을 spread로 보존해 `fileName`이 유실되지 않게 한다.
  `{ ...existing, url: targetUrl, title: existing?.title || parsed.info.title || existing?.fileName || targetUrl }`.

### 4. `src/App.tsx` — 노출 차단 & 삭제 정리

- **부팅 자동 로드**: 시작 effect는 저장된 `lastSpecUrl`로 `loadSpec`을 호출(합성 키여도
  스냅샷에서 로드). `specUrl` 초기값은 sanitize(`isFileProject ? "" : stored`)해 URL 입력란에
  합성 키가 보이지 않게 한다.
- **removeProject(url)**: 기존 localStorage 키 정리에 더해 `isFileProject(url)`이면
  `void deleteImportedSpec(url)`로 스냅샷도 제거(고아 데이터 방지).

### 5. `src/components/ProjectsModal.tsx` — UI

- props 추가: `onImportFile: () => Promise<string>`, `onReimportFile: (url: string) => Promise<string>`.
  내부 `msg` 상태로 결과/오류 표시(`CollectionsModal`의 import 패턴과 동일).
- "새 프로젝트 추가" 영역에 **`파일에서 가져오기`** 버튼 추가.
- **파일 프로젝트 행**(`isFileProject(p.url)`): 편집 가능한 URL 입력 대신
  `📄 {p.fileName}` **읽기전용** 표시(합성 키 편집 시 상태 손상 방지). 이름 입력은 유지.
  "열기"·삭제 유지 + **`다시 가져오기`** 버튼 추가.
- URL 프로젝트 행: 기존과 동일.

## Project 타입 변경

```ts
interface Project { url: string; title: string; fileName?: string; }
```

`fileName`은 파일 프로젝트에만 존재(표시·재가져오기용). 기존 저장 프로젝트는 `fileName`
없는 URL 프로젝트로 그대로 동작(하위 호환).

## 흐름 요약

가져오기: 다이얼로그 → `readTextFile` → `parseSpecText`(검증) → 합성 키 →
`saveImportedSpec` → 프로젝트 upsert → `loadSpec(키)`.

다시 열기/부팅: `loadSpec(키)` → `loadImportedSpec` → `parseSpecText` → 표시
(네트워크·stale 배너 없음).

삭제: `removeProject` → localStorage 정리 + `deleteImportedSpec`.

## 테스트 (TDD)

- `imported-spec-store.test.ts`(`fake-indexeddb/auto`): 저장→로드 라운드트립(필드 보존),
  덮어쓰기, 없는 키→`null`, 삭제 후→`null`.
- `ProjectsModal.test.tsx`: "파일에서 가져오기" 클릭 시 `onImportFile` 호출; 파일 프로젝트
  행이 `fileName` 읽기전용 + "다시 가져오기" 버튼 렌더, URL 입력 미노출.
- App import 흐름 통합 테스트(선택): `@tauri-apps/plugin-dialog`의 `open`과 `core/fs`의
  `readTextFile`를 mock(=`CollectionsModal.test` 패턴)해 가져오기→프로젝트 추가→로드 검증.

## 범위 밖 (YAGNI)

- 폴더 단위/다중 파일 일괄 가져오기.
- 원본 파일 변경 감지(워처) 자동 갱신 — 갱신은 명시적 "다시 가져오기"만.
- 외부 `$ref`(다른 파일 참조) 해석 — 현 파서는 로컬 `$ref`만 지원(기존 제약 유지).
- URL 프로젝트 ↔ 파일 프로젝트 상호 변환.
