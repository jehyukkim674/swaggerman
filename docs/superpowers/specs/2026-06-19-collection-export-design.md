# 컬렉션 일괄 내보내기 설계 (2026-06-19)

## 목표
컬렉션(저장 요청)을 외부 도구가 읽을 수 있는 4개 포맷으로 내보낸다. 현재는 네이티브 JSON export만 가능하다.

## 포맷
1. **Postman v2.1 JSON** — `parsePostmanV21`의 역방향. 단일 파일.
2. **cURL 스크립트(.sh)** — 모든 요청을 curl 명령으로. 단일 파일.
3. **OpenAPI 3.1 (YAML)** — best-effort, 손실 매핑. 단일 파일.
4. **Bruno (.bru)** — 요청당 `.bru` 1개. ZIP 대신 **디렉터리 저장**(Bruno 네이티브 구조, ZIP 의존성 회피).

## 로직 — `core/collection-export.ts` (순수 함수)
```ts
export function toPostmanV21(cols: Collection[]): string;   // JSON
export function toCurlScript(cols: Collection[]): string;   // .sh
export function toOpenAPI(cols: Collection[]): string;      // YAML (js-yaml)
export function toBruFiles(cols: Collection[]): { relPath: string; content: string }[];
```
- **Postman**: `folder`("a/b") → item 폴더 트리 재구성. 컬렉션 1개면 그대로, 여러 개면 각 컬렉션을 최상위 폴더로 묶은 단일 컬렉션(name "SwaggerMan Export"). header는 `{key,value}` 배열, body는 `mode:"raw"`.
- **cURL**: `#!/usr/bin/env bash` + `set -euo pipefail` 헤더. 요청마다 `# <컬렉션>/<폴더>/<이름>` 주석 + `buildCurl(SavedRequest→HTTPRequest)`. SavedRequest의 headers 배열 → Record로 매핑.
- **OpenAPI**: URL을 파싱해 첫 요청 origin을 `servers[0].url`로. path별로 method 그룹핑, `summary=name`, body 있으면 `requestBody.content["application/json"].example`(JSON 파싱 실패 시 문자열), 헤더는 `parameters[in:header]`. 컬렉션은 스펙이 아니므로 응답/스키마는 비움.
- **Bruno**: 요청당 `.bru` 텍스트. `relPath = <컬렉션명>/<폴더경로>/<요청명>.bru`(파일명 안전화: `/`·제어문자 → `_`). `.bru` 본문: `meta{name,type:http,seq}` + `<method>{url, body:<none|json>, auth:none}` + 헤더 있으면 `headers{...}` + body 있으면 `body:json{...}`.

## Rust 보강 — `src-tauri/src/lib.rs`
`write_text_file`이 부모 디렉터리를 만들지 않아 Bruno 하위 폴더 저장 시 실패. 쓰기 전 `if let Some(parent)=Path::new(&path).parent() { create_dir_all(parent) }` 추가. 안전하며 모든 writer가 이득.

## UI — `components/CollectionsModal.tsx`
- 기존 "내보내기" 버튼 → **포맷 드롭다운 + 실행**. 옵션: 네이티브 JSON / Postman v2.1 / cURL(.sh) / OpenAPI(YAML) / Bruno(폴더).
- 단일 파일 포맷: `save()` 다이얼로그(포맷별 기본 파일명·확장자 필터) → `writeTextFile`.
- Bruno: `open({directory:true})` → 폴더 선택 → `toBruFiles` 결과를 순차 `writeTextFile`. 완료 메시지에 파일 개수. 디렉터리 미선택 시 취소.
- `collections.length===0`이면 비활성(기존 유지).

## 테스트
- `collection-export.test.ts`: 4개 생성기. 특히 **Postman round-trip**(toPostmanV21→parsePostmanV21 동일 복원), cURL 명령 형태·주석, OpenAPI paths/servers 구조, Bruno relPath·.bru 본문·폴더 경로·파일명 안전화.
- `CollectionsModal.test.tsx`: 포맷 선택별 알맞은 다이얼로그/writer 호출(mock).
- Rust: `write_text_file`이 없는 부모 디렉터리를 생성하는지 round-trip 테스트.

## 비범위(YAGNI)
- ZIP 패키징, 토큰 마스킹(컬렉션에 토큰 저장 안 함), OpenAPI 응답 스키마 추론.
