# 스펙 로딩 실패 시 캐시 폴백 (오프라인 폴백)

- 날짜: 2026-06-05
- 상태: 설계 승인 대기

## 문제

`loadSpec()`이 네트워크 단절·타임아웃·TLS/DNS·환경 문제 등으로 실패하면 좌측 오퍼레이션
목록이 비고 에러만 표시된다. 사내망 환경(KT Cloud)에서 간헐적 DNS/프록시 문제가 잦아,
바로 직전까지 잘 보던 API 목록조차 못 보게 되는 불편이 있다.

## 목표

특정 spec URL을 **성공적으로 불러온 적이 있으면 그 결과를 캐시**하고, 이후 같은 URL
로딩이 **어떤 이유로든 실패**했을 때 캐시된(과거) 스펙을 대신 표시한다. 사용자가 과거
데이터를 보고 있음을 상단 배너로 명확히 알리고, 즉시 다시 시도할 수 있게 한다.

## 결정 사항 (사용자 확정)

- **폴백 트리거**: 모든 로딩 실패 시(인증·spec 못 찾음 포함) 캐시가 있으면 폴백.
- **표시 방식**: 상단 오프라인 배너 + 마지막 로드 시각 + "다시 시도" 버튼.
- **저장소**: **IndexedDB**. localStorage(약 5MB)는 큰 CMDB 스펙에서 용량 초과 위험이
  있어 부적합. SQLite(tauri-plugin-sql)는 단일 blob 캐시엔 과한 인프라(Cargo 의존·플러그인
  등록·capabilities 권한·마이그레이션·Rust 재빌드, 앱 안에서만 동작). IndexedDB는 수백 MB
  용량을 네이티브 변경 없이 제공하고, 앱·브라우저 모드·테스트 모두에서 동작한다.

## 구성 요소

### 1. `src/core/spec-cache.ts` (신규) — IndexedDB 캐시

비동기 객체 저장소. DB `swaggerman-cache`, object store `specs`(keyPath: `url`).

```ts
interface CachedSpec { url: string; savedAt: number; spec: ParsedSpec; }

export async function saveSpecCache(url: string, spec: ParsedSpec): Promise<void>;
export async function loadSpecCache(url: string): Promise<{ savedAt: number; spec: ParsedSpec } | null>;
```

- 내부 `openDB()`는 단일 Promise로 캐싱(중복 오픈 방지), `onupgradeneeded`에서 store 생성.
- **모든 경로를 try/catch로 감싸 절대 throw하지 않는다.** 저장 실패는 no-op, 로드 실패/부재는
  `null` 반환 — 캐시는 부가 기능이므로 본 로딩 흐름을 깨지 않는다.
- IndexedDB 미지원 환경(구식 테스트 등)에서는 조용히 no-op/`null`로 degrade.
- 저장 데이터는 구조화 복제 가능한 평범한 객체(`ParsedSpec`)이므로 IndexedDB에 그대로 저장.

### 2. `App.tsx` `loadSpec()` 리팩터링

현재 성공 시 처리(즐겨찾기·히스토리·노트·마지막 오퍼레이션 복원 등, 약 601–650행)를
`try` 밖의 공용 "스펙 적용" 블록으로 추출하여 **성공 경로와 캐시 폴백 경로가 동일하게**
탄다. 그래야 캐시로 띄워도 사용자 상태가 그대로 복원된다.

흐름:

```text
setStaleSpec(null); setLoadError(null); setLoading(true)
try:
  try:
    parsed = await loadSpecFromUrl(url, insecure)
    void saveSpecCache(url, parsed)        // fire-and-forget, 에러는 모듈이 흡수
  catch (e):
    msg = errToString(e)
    cached = await loadSpecCache(url)
    if !cached:
      log.error; setLoadError(msg); setSpec(null); return   // 기존 동작
    log.warn("로딩 실패 → 캐시 사용")
    parsed = cached.spec
    setStaleSpec({ savedAt: cached.savedAt, error: msg })
  // ---- 공용 적용 블록 (parsed 기준) ----
  setSpec(parsed); setBaseURL(...); setActiveSpecUrl(url); ... 상태 복원 ...
finally:
  setLoading(false)
```

성공 경로에서는 `setStaleSpec(null)`(상단에서 이미 해제) 유지, 저장은 UI를 막지 않도록
fire-and-forget.

### 3. 새 상태 `staleSpec`

```ts
const [staleSpec, setStaleSpec] = useState<{ savedAt: number; error: string } | null>(null);
```

매 로드 시작 시 해제. 성공 시 캐시 미사용이므로 자연히 `null` 유지.

### 4. 오프라인 배너 UI

기존 `update-banner`/`donation-banner`와 같은 위치·스타일(`.stale-banner` 추가):

```
⚠️ 네트워크 오류로 마지막으로 불러온 스펙(2026-06-05 12:40)을 표시 중입니다.
   [다시 시도]  [✕]
```

- 시각: `new Date(savedAt).toLocaleString()` (기존 TimeTravelModal 패턴).
- "다시 시도" → `loadSpec(activeSpecUrl || specUrl)`.
- ✕ → `setStaleSpec(null)` (배너만 닫고 캐시 스펙은 계속 표시).

## 데이터 흐름

- 로드 성공 → 캐시 저장 + 최신 스펙 표시(배너 없음)
- 로드 실패 + 캐시 있음 → 캐시 스펙 표시 + 오프라인 배너
- 로드 실패 + 캐시 없음 → 에러 표시(기존과 동일)

## 에러 처리

- `spec-cache`의 모든 IndexedDB 연산은 throw하지 않음 → 캐시 장애가 로딩을 막지 않음.
- 저장 실패(드묾): 다음 성공 시 갱신될 때까지 폴백 불가(허용).

## 테스트

- `src/core/spec-cache.test.ts` — `fake-indexeddb`(devDep) 사용:
  - 저장 후 로드 라운드트립(spec·savedAt 보존)
  - 키 없음 → `null`
  - 같은 URL 재저장 시 최신값으로 덮어쓰기(+ savedAt 갱신)
  - 손상/비정상 환경에서도 throw 없이 `null`/no-op
- App 본체의 폴백 배선은 단위테스트 제외 영역(App)이라 추론 + 수동 검증으로 확인.

## 범위 밖 (YAGNI)

- 캐시 만료(TTL)·다중 버전 보관·수동 캐시 삭제 UI — 단일 최신 스냅샷이면 충분.
- 다른 앱 상태의 IndexedDB 이전 — 이번 작업은 spec 캐시에 한정.
