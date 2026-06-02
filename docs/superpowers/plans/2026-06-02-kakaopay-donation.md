# 카카오페이 후원(커피 사주기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 상단 30분 주기 후원 배너 + 설정 모달 정보 섹션 + README/Pages/릴리스 노트에 카카오페이 후원 링크를 추가하고 v0.3.23으로 릴리스한다.

**Architecture:** 순수 로직(표시 여부 판단·영속화)은 `core/donation.ts`로 분리해 테스트하고, UI(배너·설정 모달)는 기존 업데이트 배너/모달 패턴을 그대로 따른다. 외부 링크는 이미 설치된 `@tauri-apps/plugin-opener`의 `openUrl()` 사용.

**Tech Stack:** Tauri 2 + React + TypeScript, Vitest, localStorage(storage.ts), shields.io 뱃지

**Spec:** `docs/superpowers/specs/2026-06-02-kakaopay-donation-design.md`

---

### Task 1: core/donation.ts — 표시 판단 로직 + 영속화 (TDD)

**Files:**
- Create: `apps/desktop/src/core/donation.ts`
- Test: `apps/desktop/src/core/donation.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/desktop/src/core/donation.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldShowDonationBanner,
  loadDonationDismissedAt,
  saveDonationDismissedAt,
  REDISPLAY_INTERVAL_MS,
  DONATION_URL,
} from "./donation";

describe("shouldShowDonationBanner", () => {
  it("닫은 기록이 없으면 표시한다", () => {
    expect(shouldShowDonationBanner(null, Date.now())).toBe(true);
  });

  it("닫은 지 30분 미만이면 표시하지 않는다", () => {
    const now = 1_000_000_000;
    expect(shouldShowDonationBanner(now - REDISPLAY_INTERVAL_MS + 1, now)).toBe(false);
  });

  it("닫은 지 30분 이상이면 다시 표시한다", () => {
    const now = 1_000_000_000;
    expect(shouldShowDonationBanner(now - REDISPLAY_INTERVAL_MS, now)).toBe(true);
  });
});

describe("dismissedAt 영속화", () => {
  beforeEach(() => localStorage.clear());

  it("저장 전에는 null", () => {
    expect(loadDonationDismissedAt()).toBe(null);
  });

  it("저장한 시각을 다시 읽는다", () => {
    saveDonationDismissedAt(12345);
    expect(loadDonationDismissedAt()).toBe(12345);
  });
});

describe("DONATION_URL", () => {
  it("카카오페이 QR 링크다", () => {
    expect(DONATION_URL).toBe("https://qr.kakaopay.com/FcUzxPAhE");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/donation.test.ts`
Expected: FAIL — "Cannot find module './donation'"

- [ ] **Step 3: 구현**

`apps/desktop/src/core/donation.ts`:

```typescript
// 카카오페이 후원(커피 사주기) — 배너 표시 판단 + 닫은 시각 영속화.
import { loadJSON, saveJSON } from "./storage";

/** 카카오페이 송금 QR 페이지. 브라우저에서 열고 휴대폰으로 스캔하면 송금된다. */
export const DONATION_URL = "https://qr.kakaopay.com/FcUzxPAhE";

/** 배너를 닫아도 이 시간이 지나면 다시 표시한다. (30분) */
export const REDISPLAY_INTERVAL_MS = 30 * 60 * 1000;

const DISMISSED_AT_KEY = "swaggerman.donation.dismissedAt";

/** 닫은 기록이 없거나 REDISPLAY_INTERVAL_MS가 지났으면 true. */
export function shouldShowDonationBanner(dismissedAtMs: number | null, nowMs: number): boolean {
  if (dismissedAtMs === null) return true;
  return nowMs - dismissedAtMs >= REDISPLAY_INTERVAL_MS;
}

export function loadDonationDismissedAt(): number | null {
  return loadJSON<number | null>(DISMISSED_AT_KEY, null);
}

export function saveDonationDismissedAt(nowMs: number): void {
  saveJSON(DISMISSED_AT_KEY, nowMs);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/donation.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop/src/core/donation.ts apps/desktop/src/core/donation.test.ts
git commit -m "기능: 후원 배너 표시 판단 로직(core/donation) + 테스트"
```

---

### Task 2: CoffeeIcon SVG 아이콘

**Files:**
- Modify: `apps/desktop/src/components/icons.tsx` (파일 끝에 추가)

- [ ] **Step 1: CoffeeIcon 추가**

`icons.tsx` 끝에 (lucide coffee 아이콘, 기존 IconProps 사용):

```tsx
/** 김이 나는 커피잔 — 후원(커피 사주기) 아이콘. */
export function CoffeeIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
      <path d="M6 2v2" />
    </svg>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음

- [ ] **Step 3: 커밋** (Task 3과 묶어서 커밋해도 됨 — 단독 의미가 작으므로 Task 3 끝에서 함께 커밋)

---

### Task 3: 상단 후원 배너 (App.tsx + App.css)

**Files:**
- Modify: `apps/desktop/src/App.tsx` (import 구역, 상태 선언 구역 ~431행 근처, 렌더링 ~769행 업데이트 배너 아래)
- Modify: `apps/desktop/src/App.css` (`.update-banner` 스타일 아래 ~1530행)

- [ ] **Step 1: App.tsx import 추가**

기존 `import { checkUpdateStatus, ... } from "./core/updater";` 아래에:

```typescript
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  DONATION_URL,
  loadDonationDismissedAt,
  saveDonationDismissedAt,
  shouldShowDonationBanner,
} from "./core/donation";
```

`import { CloseCircleIcon } from "./components/icons";` → `import { CloseCircleIcon, CoffeeIcon } from "./components/icons";`

- [ ] **Step 2: 배너 상태 + 타이머 추가**

업데이트 확인 useEffect(431~449행) 아래에:

```typescript
  // 후원 배너: 닫은 지 30분 지나면 다시 표시 (1분 간격 체크)
  const [showDonation, setShowDonation] = useState(() =>
    shouldShowDonationBanner(loadDonationDismissedAt(), Date.now()),
  );
  const [donationErr, setDonationErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      setShowDonation(shouldShowDonationBanner(loadDonationDismissedAt(), Date.now()));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  function dismissDonation() {
    saveDonationDismissedAt(Date.now());
    setShowDonation(false);
    setDonationErr(null);
  }
  async function openDonation() {
    try {
      await openUrl(DONATION_URL);
      dismissDonation();
    } catch (e) {
      // 열기 실패 시 URL을 보여줘 수동으로 열 수 있게 한다.
      setDonationErr(`브라우저 열기 실패(${e instanceof Error ? e.message : e}) — 직접 열기: ${DONATION_URL}`);
    }
  }
```

- [ ] **Step 3: 배너 렌더링 추가**

업데이트 배너 `{update && (...)}` 블록(769~793행) **바로 아래**에:

```tsx
      {showDonation && (
        <div className="donation-banner">
          <CoffeeIcon size={18} />
          <span>이 앱이 도움이 됐다면 개발자에게 커피 한 잔 어때요?</span>
          <button className="btn small donate" onClick={openDonation}>
            ☕ 커피 사주기
          </button>
          {donationErr && <span className="donation-err">{donationErr}</span>}
          <button className="icon-btn donation-close" title="닫기 (30분 뒤 다시 표시)" onClick={dismissDonation}>
            <CloseCircleIcon size={16} />
          </button>
        </div>
      )}
```

- [ ] **Step 4: App.css 스타일 추가**

`.update-error` 스타일(~1537행) 아래에:

```css
/* 후원(커피 사주기) 배너 */
.donation-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: #3a2e1a;
  border-bottom: 1px solid #ffcd00;
  font-size: 12px;
  color: #ffd866;
}
.donation-banner span {
  font-weight: 600;
}
.donation-banner .donation-close {
  margin-left: auto;
}
.donation-err {
  color: #ff7b72;
  font-weight: 400 !important;
  user-select: text;
}
.btn.donate {
  background: #ffcd00;
  border-color: #ffcd00;
  color: #3c1e1e;
  font-weight: 700;
}
.btn.donate:hover {
  background: #ffdb4d;
}
```

- [ ] **Step 5: 빌드 + 전체 테스트**

Run: `cd apps/desktop && npm run build && npx vitest run`
Expected: 빌드 성공, 전체 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/App.css apps/desktop/src/components/icons.tsx
git commit -m "기능: 상단 후원 배너 — 카카오페이 커피 사주기 (30분 주기 재표시)"
```

---

### Task 4: 설정 모달 '정보' 섹션

**Files:**
- Modify: `apps/desktop/src/components/SettingsModal.tsx`

- [ ] **Step 1: import + 버전 상태 추가**

```typescript
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DONATION_URL } from "../core/donation";
import { CloseCircleIcon, CoffeeIcon } from "./icons";
```

컴포넌트 안 cookies 상태 아래에:

```typescript
  const [version, setVersion] = useState("");
  const [donationErr, setDonationErr] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);
```

- [ ] **Step 2: 쿠키 목록 렌더링 아래(modal-body 끝)에 정보 섹션 추가**

```tsx
          <div className="settings-section">정보</div>
          <div className="hint">
            SwaggerMan {version && `v${version}`} — 이 앱이 도움이 됐다면
          </div>
          <button
            className="btn donate"
            onClick={() => {
              openUrl(DONATION_URL).catch((e) =>
                setDonationErr(`브라우저 열기 실패(${e instanceof Error ? e.message : e}) — 직접 열기: ${DONATION_URL}`),
              );
            }}
          >
            <CoffeeIcon size={15} /> 개발자에게 커피 사주기
          </button>
          {donationErr && <div className="error-box">{donationErr}</div>}
```

- [ ] **Step 3: 빌드 + 테스트**

Run: `cd apps/desktop && npm run build && npx vitest run`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/desktop/src/components/SettingsModal.tsx
git commit -m "기능: 설정 모달 정보 섹션 — 버전 표시 + 커피 사주기 버튼"
```

---

### Task 5: README 후원 뱃지

**Files:**
- Modify: `README.md` (루트 — 공개 레포 첫 화면)
- Modify: `apps/desktop/README.md` (데스크톱 앱 README)

- [ ] **Step 1: 루트 README 제목 아래 뱃지 추가**

`# SwaggerMan` 바로 아래:

```markdown
[![커피 사주기](https://img.shields.io/badge/☕_커피_사주기-카카오페이-FFCD00?style=for-the-badge)](https://qr.kakaopay.com/FcUzxPAhE)
```

- [ ] **Step 2: apps/desktop/README.md 제목 아래에도 동일 뱃지 추가**

- [ ] **Step 3: 커밋**

```bash
git add README.md apps/desktop/README.md
git commit -m "문서: README 카카오페이 후원 뱃지 추가"
```

---

### Task 6: v0.3.23 버전 범프 + CHANGELOG

**Files:**
- Modify: `apps/desktop/package.json` (version)
- Modify: `apps/desktop/src-tauri/tauri.conf.json` (version)
- Modify: `apps/desktop/src-tauri/Cargo.toml` (version)
- Modify: `apps/desktop/src-tauri/Cargo.lock` (cargo가 자동 갱신)
- Modify: `apps/desktop/CHANGELOG.md`

- [ ] **Step 1: 버전 문자열 교체** — 세 파일에서 `0.3.22` → `0.3.23`

- [ ] **Step 2: Cargo.lock 갱신**

Run: `cd apps/desktop/src-tauri && cargo update -p swagger-man-desktop --precise 0.3.23 2>/dev/null || cargo check --quiet 2>&1 | tail -1`
(패키지명은 Cargo.toml의 `name` 확인 후 사용. cargo check가 Cargo.lock의 자체 버전을 갱신함)

- [ ] **Step 3: CHANGELOG.md에 v0.3.23 추가** (`## v0.3.22` 위에)

```markdown
## v0.3.23

- 기능: **카카오페이 후원(커피 사주기)** — 상단 배너(30분 주기) + 설정 모달 정보 섹션에서 개발자에게 커피 한 잔 ☕
- 기능: **모든 모달 ESC 닫기** — 9개 모달 전부 ESC 키로 닫기 (비교 모달 검색 중엔 검색어만 지움)
- 개선: **새 창 생성 실패 시 원인 표시** — 에러를 숨기지 않고 상단바에 메시지로 표시 (사내망/권한 문제 진단용)
- 개선: 설정 모달에 **앱 버전 표시**
```

- [ ] **Step 4: 빌드 확인 + 커밋**

```bash
cd apps/desktop && npm run build
git add apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/CHANGELOG.md
git commit -m "문서: v0.3.23 버전 범프 + CHANGELOG(카카오페이 후원·ESC 닫기·새 창 실패 원인)"
```

---

### Task 7: 푸시 + 태그 + CI 빌드 + 릴리스 publish

**Files:** 없음 (git/gh 작업)

- [ ] **Step 1: main 푸시 (origin + personal)**

```bash
git push origin main && git push personal main
```

- [ ] **Step 2: 태그 생성 + personal에 푸시** (CI 트리거)

```bash
git tag SwaggerMan-v0.3.23 && git push personal SwaggerMan-v0.3.23 && git push origin SwaggerMan-v0.3.23
```

- [ ] **Step 3: CI 빌드 대기** (mac universal + Windows, 약 15~25분)

```bash
gh run list -R jehyukkim674/swaggerman --workflow "SwaggerMan Release" --limit 1
gh run watch -R jehyukkim674/swaggerman <run-id> --exit-status
```

- [ ] **Step 4: 릴리스 노트 작성** (`/tmp/relnotes-0.3.23.md`)

```markdown
## v0.3.23

- 기능: **카카오페이 후원(커피 사주기)** — 상단 배너(30분 주기) + 설정 모달 정보 섹션에서 개발자에게 커피 한 잔 ☕
- 기능: **모든 모달 ESC 닫기** — 9개 모달 전부 ESC 키로 닫기 (비교 모달 검색 중엔 검색어만 지움)
- 개선: **새 창 생성 실패 시 원인 표시** — 에러를 숨기지 않고 상단바에 메시지로 표시 (사내망/권한 문제 진단용)
- 개선: 설정 모달에 **앱 버전 표시**

> macOS "손상" 경고: `xattr -dr com.apple.quarantine /Applications/SwaggerMan.app` / Windows SmartScreen: "추가 정보 → 실행"

---
☕ 이 앱이 도움이 됐다면 [카카오페이로 커피 한 잔](https://qr.kakaopay.com/FcUzxPAhE) 사주세요!
```

- [ ] **Step 5: draft 릴리스 publish**

```bash
gh release edit SwaggerMan-v0.3.23 -R jehyukkim674/swaggerman --draft=false --latest --notes-file /tmp/relnotes-0.3.23.md
```

- [ ] **Step 6: 확인**

```bash
gh release view SwaggerMan-v0.3.23 -R jehyukkim674/swaggerman --json assets,isDraft -q '{draft: .isDraft, assets: [.assets[].name]}'
```

Expected: draft=false, latest.json + .dmg + .exe/.msi + .sig 자산 존재

---

### Task 8: GitHub Pages 매뉴얼 푸터 후원 버튼

**Files:**
- Modify: gh-pages 브랜치의 `index.html` (personal 레포)

- [ ] **Step 1: gh-pages 워크트리 생성**

```bash
git fetch personal gh-pages
git worktree add /tmp/swaggerman-ghpages FETCH_HEAD
```

- [ ] **Step 2: index.html 푸터(또는 body 끝)에 후원 버튼 추가**

`</body>` 직전 또는 기존 footer 안에:

```html
<div style="text-align:center; padding:32px 0; border-top:1px solid #333; margin-top:48px;">
  <p style="color:#aaa; margin-bottom:12px;">이 앱이 도움이 됐다면 개발자에게 커피 한 잔 ☕</p>
  <a href="https://qr.kakaopay.com/FcUzxPAhE" target="_blank"
     style="display:inline-block; background:#FFCD00; color:#3C1E1E; font-weight:700;
            padding:10px 24px; border-radius:8px; text-decoration:none;">
    ☕ 카카오페이로 커피 사주기
  </a>
</div>
```

(실제 index.html 구조를 보고 기존 스타일·푸터에 맞춰 조정)

- [ ] **Step 3: gh-pages 커밋 + 푸시**

```bash
cd /tmp/swaggerman-ghpages
git add index.html
git commit -m "문서: 매뉴얼 푸터에 카카오페이 후원 버튼 추가"
git push personal HEAD:gh-pages
```

- [ ] **Step 4: 워크트리 정리 + 페이지 확인**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man && git worktree remove /tmp/swaggerman-ghpages
```

`https://jehyukkim674.github.io/swaggerman/` 에서 푸터 확인 (Pages 배포 1~2분 소요)
