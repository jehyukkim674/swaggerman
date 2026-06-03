# 가이드 문서 생성 설계

날짜: 2026-06-03
대상 버전: v0.4.2

## 배경

- 프론트 개발자에게 "이 API 이렇게 호출하면 이런 응답 와요"를 전달하려면 매번 손으로 문서를 쓴다.
- 스펙(파라미터)과 히스토리(실제 요청/응답)가 이미 있으니, 둘을 묶어 Markdown 가이드를 자동 생성한다.

## 목표

1. 선택한 operation들에 대해 스펙 정보 + 히스토리 실제 예시를 묶은 Markdown 가이드 생성.
2. 미리보기 후 클립보드 복사 또는 `.md` 파일 저장.
3. 요청 예시는 cURL(기존 buildCurl 재활용), 응답 예시는 실제 히스토리 우선.

## 비목표 (YAGNI)

- HTML 출력 없음 — Markdown만(GitHub/Notion/Confluence에 그대로 붙여넣기 가능).
- 응답 스키마 전체 문서화 없음 — 예시 위주.
- 인증/보안 스킴 설명 자동화 없음 — 파라미터 표까지.
- 민감 헤더는 cURL 예시에서 제외(요청 공유의 isSecretHeader 재활용).

## 문서 구조

```markdown
# {spec.info.title} 연동 가이드

> 생성: SwaggerMan · Base URL: {baseURL}

## GET /pet/findByStatus — Finds Pets by status.

{operation.description 또는 summary}

**파라미터**

| 이름 | 위치 | 필수 | 타입 |
|---|---|---|---|
| status | query | 필수 | string |

**요청 예시**

​```bash
curl -X GET "https://.../pet/findByStatus?status=sold" -H "Accept: application/json"
​```

**응답 예시** (200)

​```json
{ ... }
​```
```

operation이 파라미터/응답 없으면 해당 소제목 생략.

## 예시 출처 우선순위

- **요청 예시(cURL)**: 해당 opId의 최근 히스토리 항목의 inputs로 cURL 생성(buildCurl 재활용). 히스토리 없으면 스펙 기본값(defaultInputs)으로. cURL 헤더에서 민감 헤더(isSecretHeader) 제외.
- **응답 예시**: 해당 opId의 최근 성공(2xx) 히스토리 responseBody(JSON이면 pretty). 없으면 스펙 2xx 응답 example. 둘 다 없으면 응답 예시 섹션 생략.

## 컴포넌트

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/guide-export.ts` (신규) | `buildGuideMarkdown(spec, opIds, history, baseURL)` — 문서 헤더 + operation별 섹션(파라미터 표, cURL 요청 예시, 응답 예시). 순수 함수 | buildCurl(curl-builder), isSecretHeader(share), defaultInputs(request-builder) |
| `core/guide-export.test.ts` (신규) | 섹션·표·예시 우선순위·민감 제외 | — |
| `components/GuideModal.tsx` (신규) | operation 체크박스(전체 기본) + 생성 + Markdown 미리보기 + 복사/파일저장 | guide-export |
| `components/GuideModal.test.tsx` (신규) | 선택·생성·복사 | — |
| `App.tsx` (수정) | 상단바 "가이드" 버튼(spec 있을 때) + 모달 + 파일저장 콜백 | GuideModal |
| `App.css` (수정) | `.guide-*` 스타일 | — |

### buildGuideMarkdown 시그니처

```ts
export function buildGuideMarkdown(
  spec: ParsedSpec,
  opIds: string[],
  history: HistoryItem[],
  baseURL: string,
): string;
```

- opIds 순서대로 섹션 생성. spec.operations에서 op 찾기.
- 파라미터 표: op.parameters(name/location/required/schema.type).
- cURL: 최근 히스토리 inputs 또는 defaultInputs → buildCurl(method, url, headers, body). 민감 헤더 제외.
- 응답: 최근 2xx 히스토리 responseBody(JSON.parse 성공 시 들여쓰기, 실패 시 원문) 또는 스펙 example.

## 파일 저장

- Tauri dialog `save`({ defaultPath: "api-guide.md", filters: [{name:"Markdown", extensions:["md"]}] }) + core/fs.ts writeTextFile. 컬렉션 내보내기(CollectionsModal)와 동일 패턴.
- 브라우저 모드: dialog/fs가 tauri-mock에서 처리 안 되면 복사만 동작(저장 버튼은 try/catch로 안전).

## 데이터 흐름

1. "가이드" 버튼 → GuideModal(operation 목록, 전체 체크)
2. 선택 + "생성" → `buildGuideMarkdown(spec, checkedOpIds, history, baseURL)` → 미리보기 textarea
3. "복사" → 클립보드 / "파일로 저장" → .md

## 에러 처리

- spec 미로드 → 버튼 비활성
- 선택 0개 → 생성 버튼 비활성
- 파일 저장 취소/실패 → 무시(또는 메시지)
- 클립보드 실패 → catch 무시

## 테스트

- `core/guide-export.test.ts`:
  - 문서 헤더(제목/baseURL), operation 섹션 헤더(`## GET /path — summary`)
  - 파라미터 표 행 생성(필수/옵션)
  - 요청 예시 cURL 포함, 민감 헤더(Authorization 등) 제외
  - 응답 예시: 히스토리 responseBody 우선, 없으면 스펙 example, 둘 다 없으면 섹션 없음
  - 파라미터/응답 없는 op는 해당 소제목 생략
- `components/GuideModal.test.tsx` (jsdom): operation 체크, 생성→미리보기에 Markdown, 복사 클립보드 호출

## 릴리스

v0.4.2 묶음의 하나. 묶음 완료 후 함께 배포.
