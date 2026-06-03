# 메뉴바 퀵 호출 (전역 단축키) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 지정 OS 전역 단축키를 어느 앱에서든 누르면 SwaggerMan 창을 앞으로+포커스하고 커맨드 팔레트를 자동으로 연다.

**Architecture:** Rust(tauri-plugin-global-shortcut)가 전역 단축키를 등록하고 트리거 시 창 show/focus + `quick-launch` 이벤트 emit. TS는 변환/영속화 모듈 + 키 캡처 입력 컴포넌트 + 설정 UI를 제공하고, App.tsx가 시작 시 등록 + 이벤트 리스너로 기존 팔레트를 연다.

**Tech Stack:** Rust(tauri-plugin-global-shortcut 2), TypeScript, React 19, vitest(jsdom), @tauri-apps/api(core invoke, event listen).

**Spec:** `docs/superpowers/specs/2026-06-03-global-shortcut-design.md`

작업 디렉터리: `/Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop`. 모든 명령은 이 디렉터리에서. 브랜치: `main` 직접 커밋. 한국어 주석/커밋.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/core/global-shortcut.ts` (신규) | accelerator 변환(eventToAccelerator/acceleratorToDisplay), 영속화, invoke 래퍼(registerShortcut/unregisterShortcut) |
| `src/core/global-shortcut.test.ts` (신규) | 변환·영속화 테스트 |
| `src/components/ShortcutInput.tsx` (신규) | 키 조합 캡처 입력란 + 지우기 |
| `src/components/ShortcutInput.test.tsx` (신규) | 키 캡처·지우기 테스트 |
| `src/components/SettingsModal.tsx` (수정) | "전역 단축키" 섹션 추가 |
| `src/App.tsx` (수정) | 시작 시 등록 + quick-launch 리스너→팔레트 + 단축키 state |
| `src/components/SettingsModal` 호출부(App.tsx) | shortcut props 전달 |
| `public/tauri-mock.js` (수정) | register/unregister no-op |
| `src-tauri/Cargo.toml` (수정) | global-shortcut 의존성 |
| `src-tauri/src/global_shortcut.rs` (신규) | register/unregister command + 트리거 핸들러 |
| `src-tauri/src/lib.rs` (수정) | 플러그인 + command 등록 |
| `src-tauri/capabilities/default.json` (수정) | global-shortcut 권한 |

기본 accelerator 상수: `CmdOrCtrl+Shift+P`.

---

### Task 1: core/global-shortcut.ts — 변환 + 영속화

**Files:**
- Create: `src/core/global-shortcut.ts`
- Create: `src/core/global-shortcut.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/core/global-shortcut.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  eventToAccelerator,
  acceleratorToDisplay,
  loadShortcut,
  saveShortcut,
  DEFAULT_SHORTCUT,
} from "./global-shortcut";

function ke(over: Partial<KeyboardEvent>): KeyboardEvent {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, key: "", ...over } as KeyboardEvent;
}

describe("eventToAccelerator", () => {
  it("⌘⇧P → CmdOrCtrl+Shift+P", () => {
    expect(eventToAccelerator(ke({ metaKey: true, shiftKey: true, key: "p" }))).toBe("CmdOrCtrl+Shift+P");
  });
  it("Ctrl+Alt+F1 → CmdOrCtrl+Alt+F1", () => {
    expect(eventToAccelerator(ke({ ctrlKey: true, altKey: true, key: "F1" }))).toBe("CmdOrCtrl+Alt+F1");
  });
  it("modifier 없는 단일 키는 null (일반 타이핑 가로채기 방지)", () => {
    expect(eventToAccelerator(ke({ key: "p" }))).toBeNull();
  });
  it("modifier만 누르면(주 키 없음) null", () => {
    expect(eventToAccelerator(ke({ metaKey: true, key: "Meta" }))).toBeNull();
    expect(eventToAccelerator(ke({ shiftKey: true, key: "Shift" }))).toBeNull();
  });
});

describe("acceleratorToDisplay", () => {
  it("mac 표시로 변환한다", () => {
    expect(acceleratorToDisplay("CmdOrCtrl+Shift+P", "mac")).toBe("⌘⇧P");
    expect(acceleratorToDisplay("CmdOrCtrl+Alt+F1", "mac")).toBe("⌘⌥F1");
  });
  it("그 외 플랫폼은 Ctrl 표기", () => {
    expect(acceleratorToDisplay("CmdOrCtrl+Shift+P", "other")).toBe("Ctrl+Shift+P");
  });
  it("빈 문자열은 빈 표시", () => {
    expect(acceleratorToDisplay("", "mac")).toBe("");
  });
});

describe("loadShortcut / saveShortcut", () => {
  beforeEach(() => localStorage.clear());
  it("저장 후 복원한다", () => {
    saveShortcut("CmdOrCtrl+Alt+K");
    expect(loadShortcut()).toBe("CmdOrCtrl+Alt+K");
  });
  it("저장된 적 없으면 기본 단축키", () => {
    expect(loadShortcut()).toBe(DEFAULT_SHORTCUT);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/global-shortcut.test.ts`
Expected: FAIL — `Cannot find module './global-shortcut'`

- [ ] **Step 3: 구현**

```ts
// src/core/global-shortcut.ts
// OS 전역 단축키: 키 이벤트 ↔ Tauri accelerator 문자열 변환, 영속화, Rust 등록 래퍼.
import { invoke } from "@tauri-apps/api/core";
import { loadJSON, saveJSON } from "./storage";

export const DEFAULT_SHORTCUT = "CmdOrCtrl+Shift+P";
const STORAGE_KEY = "swaggerman.globalShortcut";

/** 주 키로 인정하는 키: 영문 단일 글자 또는 F1~F12. */
function normalizeMainKey(key: string): string | null {
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase();
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

/** KeyboardEvent → Tauri accelerator(예: "CmdOrCtrl+Shift+P"). 유효하지 않으면 null. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const main = normalizeMainKey(e.key);
  if (!main) return null; // 주 키(문자/F키)가 아니면 무효 — modifier만이거나 Meta/Shift 등
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null; // modifier 없는 단일 키 금지(일반 타이핑 가로채기 방지)
  parts.push(main);
  return parts.join("+");
}

const MAC_SYMBOL: Record<string, string> = {
  CmdOrCtrl: "⌘",
  Alt: "⌥",
  Shift: "⇧",
  Super: "⌘",
};

/** accelerator → 사람이 읽는 표시 문자열. platform "mac"이면 기호. */
export function acceleratorToDisplay(acc: string, platform: "mac" | "other"): string {
  if (!acc) return "";
  const parts = acc.split("+");
  if (platform === "mac") {
    return parts.map((p) => MAC_SYMBOL[p] ?? p).join("");
  }
  // 그 외: CmdOrCtrl → Ctrl
  return parts.map((p) => (p === "CmdOrCtrl" ? "Ctrl" : p)).join("+");
}

export function loadShortcut(): string {
  return loadJSON<string>(STORAGE_KEY, DEFAULT_SHORTCUT);
}

export function saveShortcut(acc: string): void {
  saveJSON(STORAGE_KEY, acc);
}

/** Rust에 전역 단축키 등록(빈 문자열이면 해제). 실패 시 throw. */
export async function registerShortcut(acc: string): Promise<void> {
  if (!acc) {
    await invoke("unregister_global_shortcut");
    return;
  }
  await invoke("register_global_shortcut", { accelerator: acc });
}

export async function unregisterShortcut(): Promise<void> {
  await invoke("unregister_global_shortcut");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/global-shortcut.test.ts`
Expected: PASS (9개)

- [ ] **Step 5: 커밋**

```bash
git add src/core/global-shortcut.ts src/core/global-shortcut.test.ts
git commit -m "기능: 전역 단축키 코어 — accelerator 변환·영속화·등록 래퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ShortcutInput 컴포넌트

**Files:**
- Create: `src/components/ShortcutInput.tsx`
- Create: `src/components/ShortcutInput.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/components/ShortcutInput.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShortcutInput } from "./ShortcutInput";

describe("ShortcutInput", () => {
  it("현재 단축키를 표시한다", () => {
    render(<ShortcutInput value="CmdOrCtrl+Shift+P" onChange={vi.fn()} />);
    // mac 기준 표시(테스트 환경은 navigator.platform 기본 — 표시 문자열에 P 포함 확인)
    expect(screen.getByRole("button", { name: /단축키/ }).textContent).toMatch(/P/);
  });

  it("포커스 후 키 조합을 누르면 onChange가 accelerator로 호출된다", () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="" onChange={onChange} />);
    const btn = screen.getByRole("button", { name: /단축키/ });
    fireEvent.keyDown(btn, { metaKey: true, shiftKey: true, key: "k" });
    expect(onChange).toHaveBeenCalledWith("CmdOrCtrl+Shift+K");
  });

  it("modifier 없는 단일 키는 무시한다", () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /단축키/ }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("지우기 버튼은 onChange('')를 호출한다", () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="CmdOrCtrl+Shift+P" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/ShortcutInput.test.tsx`
Expected: FAIL — `Cannot find module './ShortcutInput'`

- [ ] **Step 3: 구현**

```tsx
// src/components/ShortcutInput.tsx
// 키 조합을 캡처해 Tauri accelerator로 변환하는 입력 컴포넌트.
import { useState } from "react";
import { eventToAccelerator, acceleratorToDisplay } from "../core/global-shortcut";

interface Props {
  value: string; // accelerator (빈 문자열 = 미설정)
  onChange: (acc: string) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export function ShortcutInput({ value, onChange }: Props) {
  const [capturing, setCapturing] = useState(false);
  const display = acceleratorToDisplay(value, isMac ? "mac" : "other");

  return (
    <span className="shortcut-input">
      <button
        type="button"
        className={`shortcut-capture${capturing ? " capturing" : ""}`}
        aria-label="전역 단축키 입력"
        onFocus={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={(e) => {
          const acc = eventToAccelerator(e.nativeEvent);
          if (acc) {
            e.preventDefault();
            onChange(acc);
            (e.target as HTMLButtonElement).blur();
          } else {
            // 주 키가 아니면(modifier만 등) 캡처 유지, 기본 동작은 막아 탭 이동 등 방지
            if (e.key !== "Tab") e.preventDefault();
          }
        }}
      >
        {capturing ? "키 조합을 누르세요…" : display || "(미설정)"}
      </button>
      {value && (
        <button type="button" className="btn small" aria-label="지우기" onClick={() => onChange("")}>
          지우기
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/ShortcutInput.test.tsx`
Expected: PASS (4개)

주의: `fireEvent.keyDown(btn, {...})`의 이벤트가 `e.nativeEvent`로 전달되는지 — React 합성이벤트의 nativeEvent에 metaKey/shiftKey/key가 실리는지 확인. 만약 테스트에서 nativeEvent 접근이 비면, `eventToAccelerator`에 합성이벤트(e)를 직접 넘기도록 시그니처를 맞춘다(KeyboardEvent 호환 필드만 사용하므로 React.KeyboardEvent도 동작). 그 경우 onKeyDown에서 `eventToAccelerator(e as unknown as KeyboardEvent)`.

- [ ] **Step 5: 커밋**

```bash
git add src/components/ShortcutInput.tsx src/components/ShortcutInput.test.tsx
git commit -m "기능: 전역 단축키 키 조합 캡처 입력 컴포넌트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Rust global_shortcut.rs + 플러그인/권한 등록

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/global_shortcut.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Cargo.toml 의존성 추가**

`[dependencies]`의 `axum = "0.8"` 아래에 추가:

```toml
tauri-plugin-global-shortcut = "2"
```

- [ ] **Step 2: capabilities/default.json 권한 추가**

`permissions` 배열에 추가(마지막 항목 뒤 콤마 주의):

```json
    "dialog:default",
    "global-shortcut:default"
```

(기존 `"dialog:default"`가 배열 마지막이므로 콤마 추가 후 새 줄)

- [ ] **Step 3: global_shortcut.rs 생성**

```rust
// src-tauri/src/global_shortcut.rs
// OS 전역 단축키 등록/해제. 트리거 시 메인 창을 앞으로 가져오고 프론트에 quick-launch 이벤트를 emit.
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 전역 단축키 등록. 기존 등록은 모두 해제 후 새로 등록한다. 실패 시 Err.
#[tauri::command]
pub fn register_global_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    // 기존 단축키 모두 해제(중복 등록 방지)
    let _ = gs.unregister_all();

    if accelerator.trim().is_empty() {
        return Ok(());
    }

    let app_for_handler = app.clone();
    gs.on_shortcut(accelerator.as_str(), move |_app, _shortcut, event| {
        // 누를 때 1회만(뗄 때 중복 방지)
        if event.state() != ShortcutState::Pressed {
            return;
        }
        // 메인 창("main" 우선, 없으면 첫 창)을 앞으로 + 포커스
        let win = app_for_handler
            .get_webview_window("main")
            .or_else(|| app_for_handler.webview_windows().into_values().next());
        if let Some(w) = win {
            let _ = w.show();
            let _ = w.set_focus();
        }
        let _ = app_for_handler.emit("quick-launch", ());
    })
    .map_err(|e| format!("단축키 등록 실패: {e}"))?;

    Ok(())
}

/// 전역 단축키 모두 해제.
#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}
```

참고: `on_shortcut`은 등록 + 핸들러를 한 번에 건다(tauri-plugin-global-shortcut 2.x API). API 시그니처가 다르면 docs.rs의 2.x 버전을 확인해 맞춘다(예: `gs.register(...)` + 전역 핸들러 방식). 멀티윈도우 label은 `main-*`도 있으나 첫 창 fallback으로 충분.

- [ ] **Step 4: lib.rs 플러그인 + command 등록**

`lib.rs` 1행대의 `mod` 선언부에 추가:
```rust
mod global_shortcut;
```

데스크톱 플러그인 블록에 추가(`#[cfg(desktop)]` 안):
```rust
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build());
```

`generate_handler!` 목록에 추가:
```rust
            mock_server::mock_start,
            mock_server::mock_stop,
            mock_server::mock_status,
            global_shortcut::register_global_shortcut,
            global_shortcut::unregister_global_shortcut
```

- [ ] **Step 5: 컴파일 + clippy**

Run: `cd src-tauri && cargo build 2>&1 | tail -15`
Expected: 컴파일 성공(의존성 다운로드로 수 분 소요 가능)

Run: `cd src-tauri && cargo clippy --all-targets 2>&1 | grep -E "^error" | wc -l`
Expected: `0`

API 불일치로 컴파일 에러 시: `tauri-plugin-global-shortcut` 2.x의 실제 API(`GlobalShortcutExt`, `on_shortcut`/`register` 시그니처, `ShortcutState`)를 docs.rs에서 확인해 맞춘다. import 경로/메서드명만 조정하고 동작(등록→show/focus/emit)은 동일하게 유지.

- [ ] **Step 6: 커밋**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/global_shortcut.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "기능: Rust 전역 단축키 — 등록/해제 command + 트리거 시 창 포커스·quick-launch emit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: SettingsModal "전역 단축키" 섹션

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/App.css` (단축키 입력 스타일)

- [ ] **Step 1: SettingsModal Props 확장 + 섹션 추가**

`SettingsModal.tsx` import에 추가:
```tsx
import { ShortcutInput } from "./ShortcutInput";
```

`interface Props`에 추가:
```tsx
  /** 전역 단축키 accelerator(빈 문자열 = 비활성). */
  globalShortcut?: string;
  onGlobalShortcutChange?: (acc: string) => void;
  /** 단축키 등록 에러(있으면 표시). */
  shortcutError?: string | null;
```

함수 시그니처 구조분해에 추가:
```tsx
export function SettingsModal({
  settings,
  onChange,
  onClose,
  claudePath = "",
  onClaudePathChange,
  globalShortcut = "",
  onGlobalShortcutChange,
  shortcutError = null,
}: Props) {
```

"정보" 섹션 바로 위에 새 섹션 추가(AI 섹션과 정보 섹션 사이):
```tsx
          {onGlobalShortcutChange && (
            <>
              <div className="settings-section">전역 단축키</div>
              <label className="settings-field">
                <span>앞으로 가져오기 + 검색</span>
                <ShortcutInput value={globalShortcut} onChange={onGlobalShortcutChange} />
              </label>
              <div className="settings-hint">
                어느 앱에서든 이 단축키로 SwaggerMan을 불러내 검색 팔레트를 엽니다. 비우면 비활성.
              </div>
              {shortcutError && <div className="error-box">{shortcutError}</div>}
            </>
          )}
```

(실제 SettingsModal의 섹션 구조를 확인해 "정보" 섹션 직전에 배치. `settings-hint` 클래스가 없으면 `hint` 사용)

- [ ] **Step 2: CSS 추가 (App.css 끝)**

```css
/* ============================================================
 * 전역 단축키 입력
 * ============================================================ */
.shortcut-input {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.shortcut-capture {
  min-width: 120px;
  background: var(--bg-3);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 10px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  cursor: pointer;
}
.shortcut-capture.capturing {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(56, 139, 253, 0.22);
  color: var(--muted);
}
```

- [ ] **Step 3: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -3`
Expected: 타입 에러 없음, 전체 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/components/SettingsModal.tsx src/App.css
git commit -m "기능: 설정 모달 전역 단축키 섹션 — 키 조합 입력·에러 표시

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: App.tsx 통합 — 등록·리스너·재등록

**Files:**
- Modify: `src/App.tsx`
- Modify: `public/tauri-mock.js`

- [ ] **Step 1: import 추가**

`App.tsx` 상단에 추가:
```tsx
import { listen } from "@tauri-apps/api/event";
import { loadShortcut, saveShortcut, registerShortcut } from "./core/global-shortcut";
```

- [ ] **Step 2: state 추가**

claudePath state 근처에 추가:
```tsx
  const [globalShortcut, setGlobalShortcut] = useState<string>(() => loadShortcut());
  const [shortcutError, setShortcutError] = useState<string | null>(null);
```

- [ ] **Step 3: 시작 시 등록 + quick-launch 리스너 useEffect**

다른 useEffect들 근처에 추가:
```tsx
  // 전역 단축키 등록 + quick-launch 이벤트 → 커맨드 팔레트 오픈
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    registerShortcut(globalShortcut)
      .then(() => setShortcutError(null))
      .catch((e) => setShortcutError(e instanceof Error ? e.message : String(e)));
    saveShortcut(globalShortcut);
    listen("quick-launch", () => setPaletteOpen(true)).then((un) => {
      unlisten = un;
    });
    return () => {
      unlisten?.();
    };
  }, [globalShortcut]);
```

참고: `setPaletteOpen`은 이미 App.tsx에 존재(⌘K 커맨드 팔레트). `listen`을 매 변경마다 다시 거는 것은 약간 과하지만 unlisten cleanup이 있어 누수는 없음. 단축키 변경이 잦지 않아 허용. (원하면 listen은 마운트 1회 useEffect로 분리 가능 — 단순화를 위해 합침)

- [ ] **Step 4: SettingsModal에 props 전달**

`<SettingsModal .../>` 렌더에 추가:
```tsx
          globalShortcut={globalShortcut}
          onGlobalShortcutChange={setGlobalShortcut}
          shortcutError={shortcutError}
```

- [ ] **Step 5: tauri-mock.js에 command no-op 추가**

invoke 라우터 switch에 추가(mock_status 케이스 근처):
```js
      case "register_global_shortcut":
        return Promise.resolve();
      case "unregister_global_shortcut":
        return Promise.resolve();
```

(`plugin:event|listen`은 이미 tauri-mock에 케이스가 있으므로 quick-launch listen은 브라우저 모드에서 자동 no-op)

- [ ] **Step 6: 타입체크 + 전체 테스트 + 빌드**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | tail -2`
Expected: 타입 에러 없음, 전체 PASS, 빌드 성공

- [ ] **Step 7: 커밋**

```bash
git add src/App.tsx public/tauri-mock.js
git commit -m "기능: 앱 시작 시 전역 단축키 등록 + quick-launch→팔레트 연결 (브라우저 모드 no-op)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 검증 + 실제 앱 단축키 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 자동 검증 (TS)**

```bash
npx eslint . && npx tsc --noEmit && npx vitest run && npm run build
```
Expected: 모두 PASS (기존 AiPanel react-refresh 경고 1건은 무관)

- [ ] **Step 2: Rust 검증**

```bash
cd src-tauri && cargo test && cargo clippy --all-targets 2>&1 | grep -E "^error" | wc -l && cd ..
```
Expected: 기존 테스트 PASS, clippy error 0

- [ ] **Step 3: 브라우저 모드 스모크**

```bash
npm run dev
```
Chrome DevTools MCP로 `http://localhost:1420`:
1. 설정(⚙) → "전역 단축키" 섹션 표시 확인
2. 입력란 포커스 → 키 조합 캡처 동작(표시 갱신) 확인 (register invoke는 mock no-op)
3. 지우기 동작 확인
(브라우저 모드에선 실제 전역 단축키는 동작 안 함 — 데스크톱 전용)

- [ ] **Step 4: 실제 앱(tauri dev) 단축키 확인 — 가능하면**

```bash
npm run tauri dev
```
1. 앱 로드 후 다른 앱으로 포커스 이동
2. `⌘⇧P`(기본) 누름 → SwaggerMan 창이 앞으로 + 커맨드 팔레트 오픈 확인
3. 설정에서 다른 조합으로 변경 → 새 조합 동작, 기존 조합 비활성 확인
4. 이미 점유된 조합 입력 시 에러 표시 확인

(주의: 실제 앱 GUI 자동화는 화면 활성 상태에서만 가능. 사용자 환경에 따라 수동 확인이 필요할 수 있음 — 그 경우 사용자에게 확인 요청)

- [ ] **Step 5: 발견된 문제 수정 후 커밋** (있을 때만)

---

## Self-Review 체크

- **스펙 커버리지**: accelerator 변환(Task1) ✓ / 영속화(Task1) ✓ / 등록 래퍼(Task1) ✓ / 키 캡처 입력(Task2) ✓ / Rust 등록·해제·트리거(창 show/focus + quick-launch emit)(Task3) ✓ / 플러그인·권한(Task3) ✓ / 설정 UI·에러표시(Task4) ✓ / 시작 시 등록·리스너·재등록(Task5) ✓ / 브라우저 모드 no-op(Task5) ✓ / 기본 단축키 CmdOrCtrl+Shift+P(Task1 DEFAULT_SHORTCUT) ✓
- **타입 일관성**: eventToAccelerator/acceleratorToDisplay/loadShortcut/saveShortcut/registerShortcut/unregisterShortcut/DEFAULT_SHORTCUT가 global-shortcut.ts에서 정의, ShortcutInput·App에서 동일 import ✓. Rust command명 register_global_shortcut/unregister_global_shortcut가 TS invoke와 일치 ✓. quick-launch 이벤트명 Rust emit ↔ TS listen 일치 ✓
- **플레이스홀더 없음** ✓ (Task3의 Rust API는 2.x 시그니처 확인 지침 명시 — 구현자가 docs.rs로 정확한 메서드명 확정)
- **리스크**: tauri-plugin-global-shortcut 2.x의 `on_shortcut` API 시그니처가 버전에 따라 다를 수 있음 → Task3 Step5에 docs.rs 확인 지침 포함. 동작(등록→show/focus/emit)은 불변.
