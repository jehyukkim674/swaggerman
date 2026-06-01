# 마지막 위치·요청 정보 영속화 (2026-06-01)

## 배경

- 입력한 요청 파라미터(Query/Path/Headers/Body)가 **메모리(opCacheRef)에만 캐시**돼 앱을 재시작하면 사라짐
- 마지막으로 보던 API(오퍼레이션)도 기억하지 않아 재시작 후 다시 찾아 들어가야 함

## 설계

### 1. 오퍼레이션별 입력값 영속화

- `swaggerman.inputs.<specUrl>` = `Record<opId, RequestInputs>` (프로젝트별)
- 입력값이 바뀔 때마다 해당 오퍼레이션 entry를 즉시 갱신(useEffect)
- **응답(Response)은 저장하지 않음** — 히스토리가 이미 보관, 대용량 응답 용량 문제 회피

### 2. 마지막 선택 오퍼레이션 영속화

- `swaggerman.lastOp.<specUrl>` = `selected.id` (프로젝트별)
- 스펙 로드 완료 시 해당 오퍼레이션을 자동 선택 + 저장된 입력값 복원

### 3. 복원 우선순위 (selectOperation)

```
메모리 캐시(opCacheRef, 응답 포함) → 저장된 입력값(localStorage) → 스펙 기본값(defaultInputs)
```

### 4. 순수 함수 분리 (테스트 대상)

`core/request-builder.ts`에 추가:

```ts
/** 저장된 입력값이 있으면 복원, 없으면 스펙 기본값. */
export function restoreInputs(
  saved: Record<string, RequestInputs>,
  op: ParsedOperation,
): RequestInputs;
```

## 테스트

- restoreInputs: 저장값 우선, 없으면 defaultInputs 결과, 저장값 구조 보존
- 기존 전체 테스트 회귀 없음

## 버전

- v0.3.21
