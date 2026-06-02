# 카카오페이 후원(커피 사주기) 설계

날짜: 2026-06-02
상태: 승인됨

## 목적

SwaggerMan 사용자가 개발자에게 카카오페이로 소액 후원(커피 사주기)할 수 있는 진입점을 앱과 배포 채널 전반에 추가한다.

- 후원 URL: `https://qr.kakaopay.com/FcUzxPAhE`
- 클릭하면 기본 브라우저에서 카카오페이 QR 페이지가 열리고, 휴대폰으로 스캔하면 송금된다.

## 범위

| # | 위치 | 내용 |
|---|------|------|
| 1 | 앱 상단 배너 | 30분 주기 후원 배너 (핵심) |
| 2 | 설정(⚙) 모달 | '정보' 섹션 — 버전 + 후원 버튼 |
| 3 | README.md | 상단 카카오페이 후원 뱃지 |
| 4 | GitHub Pages 매뉴얼 | 푸터 후원 버튼 |
| 5 | 릴리스 노트 | v0.3.23부터 하단 후원 문구 고정 |

## 1. 상단 후원 배너

기존 업데이트 배너(`.update-banner`, `App.tsx:769`)와 동일한 위치·스타일 패턴.

```
[커피SVG] 이 앱이 도움이 됐다면 개발자에게 커피 한 잔 어때요?  [☕ 커피 사주기]  [✕]
```

### 동작

- **표시 조건**: 마지막으로 닫은 시각(`dismissedAt`)으로부터 30분 경과 시 표시. 최초 실행(기록 없음)이면 즉시 표시.
- **[✕] 닫기**: 배너 숨김 + `dismissedAt = now` 를 localStorage에 저장.
- **[☕ 커피 사주기]**: `@tauri-apps/plugin-opener`의 `openUrl()`로 브라우저 열기 + 배너 닫기(동일하게 `dismissedAt` 기록).
- **재표시**: 1분 간격 타이머로 체크, 30분 경과 시 다시 표시.

### 구현 구조

- `src/core/donation.ts` (신규, 테스트 포함)
  - `DONATION_URL` 상수
  - `REDISPLAY_INTERVAL_MS = 30 * 60 * 1000`
  - `shouldShowDonationBanner(dismissedAtMs: number | null, nowMs: number): boolean`
  - localStorage 키: `swaggerman.donation.dismissedAt`
- `src/components/icons.tsx`에 `CoffeeIcon` SVG 추가 (김 나는 커피잔, 갈색 컵 + 카카오 노랑 포인트 — 이모지 대신 SVG로 플랫폼 간 통일)
- `App.tsx`에 배너 렌더링 + 타이머 (업데이트 배너 바로 아래)
- `App.css`에 `.donation-banner` 스타일 (`.update-banner` 변형, 따뜻한 톤)

## 2. 설정 모달 '정보' 섹션

쿠키 섹션 아래에 추가:

```
정보
  SwaggerMan v0.3.23
  이 앱이 도움이 됐다면
  [☕ 개발자에게 커피 사주기]
```

- 버전은 `@tauri-apps/api/app`의 `getVersion()`으로 표시 (tauri.conf.json 버전을 런타임에 읽음 — 별도 빌드 설정 불필요).
- 버튼 클릭 → `openUrl(DONATION_URL)`.

## 3. README.md

루트 README 상단(제목 아래)에 카카오페이 노란색 shields.io 뱃지:

```markdown
[![커피 사주기](https://img.shields.io/badge/☕_커피_사주기-카카오페이-FFCD00?style=for-the-badge)](https://qr.kakaopay.com/FcUzxPAhE)
```

## 4. GitHub Pages 매뉴얼 (gh-pages 브랜치 index.html)

페이지 푸터에 후원 버튼(카카오 노랑 배경, 커피 이모지) 추가.

## 5. 릴리스 노트

v0.3.23부터 릴리스 노트 하단에 고정 문구:

```markdown
---
☕ 이 앱이 도움이 됐다면 [카카오페이로 커피 한 잔](https://qr.kakaopay.com/FcUzxPAhE) 사주세요!
```

## 에러 처리

- `openUrl()` 실패 시(샌드박스/권한 문제): 배너/설정 모달에 실패 메시지 표시 + URL 텍스트를 보여줘 수동 복사 가능하게.
- localStorage 접근 실패: 배너를 매번 표시(보수적 기본값)하지 않고, 메모리 상태로만 동작(앱 세션 내 1회 표시 후 닫으면 그 세션 동안 30분 주기 적용).

## 테스트

- `donation.test.ts`: `shouldShowDonationBanner` — 기록 없음/30분 미만/30분 이상 경우.
- `App` 레벨 배너 표시·닫기는 기존 패턴(컴포넌트 테스트 없음)에 맞춰 core 로직 테스트로 갈음.

## 릴리스 계획

1. 위 1~4 구현 + 테스트 통과
2. v0.3.23 버전 범프 (`tauri.conf.json`, `package.json`, `Cargo.toml`) + CHANGELOG
   - 포함 내용: 모달 ESC 닫기(이미 커밋됨) + 새 창 실패 원인 표시 + 카카오페이 후원
3. main 푸시 (origin + personal)
4. `SwaggerMan-v0.3.23` 태그를 personal에 푸시 → CI 빌드
5. draft 릴리스 publish (후원 문구 포함 노트)
