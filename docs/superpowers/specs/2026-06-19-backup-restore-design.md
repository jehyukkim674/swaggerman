# 전체 백업 / 복원 설계 (2026-06-19)

## 목표
앱의 모든 설정·데이터를 단일 `.json` 파일로 백업하고, 새 설치본에서 그대로 복원한다. 버전이 바뀌어도 깨지지 않도록(버전 독립적) 설계한다.

## 데이터 위치
- **localStorage**: `swaggerman*` 접두사 키 약 30종(전역 설정 + 스펙별 데이터). 단순 문자열 값.
- **IndexedDB** 4개 DB(각 단일 스토어, 인라인 keyPath):
  - `swaggerman-cache` / `specs` / keyPath `url`
  - `swaggerman-imports` / `specs` / keyPath `url`
  - `swaggerman-mock-config` / `configs` / keyPath `specUrl`
  - `swaggerman-mock-presets` / `presets` / keyPath `specUrl`

## 버전 독립 원칙
- localStorage는 `swaggerman`으로 시작하는 **모든 키를 통째 덤프/복원**(미래에 새 키가 생겨도 자동 포함).
- IndexedDB는 레코드가 인라인 keyPath라 `getAll()`로 읽고 `put(record)`로 복원(키 지정 불필요).
- 파일에 `schemaVersion`만 기록. 알 수 없는 추가 필드는 무시(전방 호환).

## 로직 — `core/backup.ts`
```ts
interface BackupFile {
  swaggerman: "backup";
  schemaVersion: 1;
  exportedAt: number;
  appVersion?: string;
  localStorage: Record<string, string>;
  indexedDB: Record<string, unknown[]>; // "dbName/storeName" -> records
}
const IDB_STORES: { db: string; store: string; keyPath: string }[]; // 위 4개

export function collectLocalStorage(): Record<string, string>;        // swaggerman* 키
export async function collectIndexedDB(): Promise<Record<string, unknown[]>>;
export async function buildBackup(appVersion?: string): Promise<BackupFile>;
export function serializeBackup(b: BackupFile): string;               // JSON pretty
export function parseBackup(text: string): BackupFile;                // 마커/스키마 검증, 실패 시 throw
export async function restoreBackup(b: BackupFile, mode: "merge" | "replace"): Promise<void>;
```
- `restoreBackup`:
  - `replace`: 기존 `swaggerman*` localStorage 키 제거 + 각 IDB 스토어 clear 후 기록.
  - `merge`: 덮어쓰기만(기존 유지).
  - IDB 스토어가 없으면 생성(keyPath 지정). 복원 후 호출 측이 `location.reload()`로 앱 재초기화.

## UI — `components/SettingsModal.tsx`
- 새 "백업/복원" 섹션:
  - **백업 파일로 저장**: `buildBackup` → `save()` 다이얼로그(`swaggerman-backup-YYYYMMDD.json`) → `writeTextFile`.
  - **복원(파일 선택)**: `open()` → `readTextFile` → `parseBackup` → 확인 다이얼로그(전체 덮어쓰기 경고) → `restoreBackup(_, "replace")` → `location.reload()`.
- 파일 I/O는 CollectionsModal과 동일하게 `@tauri-apps/plugin-dialog` + `core/fs` 직접 사용(App 배선 불필요).

## 테스트 — `core/backup.test.ts` (jsdom + fake-indexeddb)
- localStorage + IDB 시드 → `buildBackup` → `serializeBackup`/`parseBackup` 왕복 → 깨끗한 상태에서 `restoreBackup` → 값 복원 검증.
- `collectLocalStorage`가 비-swaggerman 키는 제외.
- `parseBackup`가 잘못된 파일(마커 없음)에서 throw.
- `replace` 모드가 기존 swaggerman 키를 제거.

## 비범위(YAGNI)
- 암호화, 부분 선택 백업, 클라우드 동기화, 자동 주기 백업.
