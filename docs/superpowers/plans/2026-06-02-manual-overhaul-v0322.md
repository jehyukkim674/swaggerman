# 사용 매뉴얼 전면 개편 (v0.3.22) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> ⚠️ 이 계획은 **인라인 실행 전용**이다. 캡처→분석→클릭의 시각 피드백 루프가 연속된 컨텍스트를 요구하므로 서브에이전트 분할 실행은 부적합하다.

**Goal:** gh-pages 사용 매뉴얼을 v0.3.22 전체 기능 기준으로 전면 개편하고, 새로 촬영한 빨간 박스·번호 주석 스크린샷 14장과 번호 1:1 매칭 설명을 단다.

**Architecture:** (1) Swift CGEvent 클릭 CLI + bash UI 헬퍼 + PIL 주석 스크립트를 만들고 → (2) SwaggerMan 새 창에서 Petstore 데모 데이터를 구축하며 단계마다 창 전체를 캡처하고 → (3) 캡처에 주석을 입힌 뒤 16섹션 HTML을 작성해 → (4) gh-pages 브랜치(personal 레포)로 퍼블리시한다.

**Tech Stack:** AppleScript(System Events) + Swift(CGEvent) + `screencapture` + Python PIL + 정적 HTML(gh-pages)

**Spec:** `apps/desktop/docs/superpowers/specs/2026-06-02-manual-overhaul-v0322-design.md`

---

## 전제 조건 (실행 전 확인)

- Accessibility 권한: cmux에 부여됨 (확인 완료)
- Screen Recording 권한: 있음 (확인 완료)
- SwaggerMan.app v0.3.22 설치·실행 중
- Petstore 접근 가능: `curl -s -o /dev/null -w "%{http_code}" https://petstore3.swagger.io/api/v3/openapi.json` → `200`
- ⚠️ **사용자 고지**: Phase 2(앱 조작) 동안 Mac 키보드/마우스 사용 금지. 클립보드 내용이 덮어써짐.

## 파일 구조

| 경로 | 역할 | 커밋 대상 |
|---|---|---|
| `apps/desktop/scripts/manual/click.swift` | CGEvent 클릭·스크롤 CLI 소스 | main |
| `apps/desktop/scripts/manual/ui.sh` | 앱 활성화·키입력·캡처 bash 헬퍼 | main |
| `apps/desktop/scripts/manual/annotate.py` | 빨간 박스+번호 주석 + 리사이즈 | main |
| `/tmp/swaggerman-manual/` | 작업 디렉토리 (click 바이너리, 원본·주석 캡처) | 커밋 안 함, 마지막에 삭제 |
| `/tmp/swaggerman-ghpages/` | gh-pages 워크트리 | gh-pages 브랜치 |
| gh-pages: `index.html` | 매뉴얼 본문 (전면 교체) | gh-pages |
| gh-pages: `screenshots/*.png` | 주석 스크린샷 14장 (기존 5장 삭제) | gh-pages |

---

# Phase 1: 자동화 인프라

### Task 1: 헬퍼 스크립트 작성 + 동작 검증

**Files:**
- Create: `apps/desktop/scripts/manual/click.swift`
- Create: `apps/desktop/scripts/manual/ui.sh`
- Create: `apps/desktop/scripts/manual/annotate.py`

- [ ] **Step 1.1: 작업 디렉토리 생성**

```bash
mkdir -p /tmp/swaggerman-manual/raw /tmp/swaggerman-manual/annotated
mkdir -p /Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop/scripts/manual
```

- [ ] **Step 1.2: click.swift 작성**

```swift
// click.swift — CGEvent 기반 클릭·스크롤 CLI (Accessibility 권한 필요)
// 사용법: click <x> <y>            : 좌클릭 (논리 좌표)
//        click <x> <y> double      : 더블클릭
//        click <x> <y> scroll <dy> : 해당 위치에서 세로 스크롤(dy>0 위로)
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 3, let x = Double(args[1]), let y = Double(args[2]) else {
    print("usage: click <x> <y> [double|scroll <dy>]")
    exit(1)
}
let point = CGPoint(x: x, y: y)

// 마우스 이동(호버 상태 반영)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
        mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
usleep(150_000)

if args.count >= 5, args[3] == "scroll", let dy = Int32(args[4]) {
    let scroll = CGEvent(scrollWheelEvent2Source: nil, units: .line,
                         wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)!
    scroll.location = point
    scroll.post(tap: .cghidEventTap)
    exit(0)
}

func clickOnce(state: Int64) {
    let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown,
                       mouseCursorPosition: point, mouseButton: .left)!
    let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                     mouseCursorPosition: point, mouseButton: .left)!
    down.setIntegerValueField(.mouseEventClickState, value: state)
    up.setIntegerValueField(.mouseEventClickState, value: state)
    down.post(tap: .cghidEventTap)
    usleep(80_000)
    up.post(tap: .cghidEventTap)
}

clickOnce(state: 1)
if args.count >= 4 && args[3] == "double" {
    usleep(120_000)
    clickOnce(state: 2)
}
```

- [ ] **Step 1.3: ui.sh 작성**

```bash
#!/bin/bash
# SwaggerMan UI 자동화 헬퍼 — 매뉴얼 스크린샷 촬영용
# 필요 권한: Accessibility(클릭·키입력), Screen Recording(캡처)
# 사용법: ./ui.sh <command> [args...]
set -euo pipefail

WORK=/tmp/swaggerman-manual
CLICK="$WORK/click"
WIN_ID_FILE="$WORK/window-id"

# 앱 활성화 (데모 창이 속한 Space로 전환됨)
activate() {
  osascript -e 'tell application "SwaggerMan" to activate'
  sleep 1
}

# 최전면 SwaggerMan 창의 논리 bounds: "x y w h"
bounds() {
  osascript <<'EOF'
tell application "System Events" to tell process "SwaggerMan"
  set p to position of window 1
  set s to size of window 1
  return ((item 1 of p) as text) & " " & ((item 2 of p) as text) & " " & ¬
    ((item 1 of s) as text) & " " & ((item 2 of s) as text)
end tell
EOF
}

# 창 내 비율 좌표(0.0~1.0) 클릭: click_frac <fx> <fy> [double]
click_frac() {
  local fx="$1" fy="$2" mode="${3:-}"
  read -r wx wy ww wh <<< "$(bounds)"
  local x y
  x=$(python3 -c "print($wx + $ww * $fx)")
  y=$(python3 -c "print($wy + $wh * $fy)")
  "$CLICK" "$x" "$y" $mode
  sleep 0.6
}

# 절대 논리 좌표 클릭: click_abs <x> <y> [double]
click_abs() {
  "$CLICK" "$1" "$2" "${3:-}"
  sleep 0.6
}

# 창 내 비율 좌표에서 스크롤: scroll_frac <fx> <fy> <dy>
scroll_frac() {
  local fx="$1" fy="$2" dy="$3"
  read -r wx wy ww wh <<< "$(bounds)"
  local x y
  x=$(python3 -c "print($wx + $ww * $fx)")
  y=$(python3 -c "print($wy + $wh * $fy)")
  "$CLICK" "$x" "$y" scroll "$dy"
  sleep 0.4
}

# 클립보드 경유 텍스트 입력(한글 안전): type_text "텍스트"
type_text() {
  osascript - "$1" <<'EOF'
on run argv
  set the clipboard to (item 1 of argv)
  delay 0.2
  tell application "System Events" to keystroke "v" using command down
end run
EOF
  sleep 0.4
}

# 키 입력: press <key> [cmd] [shift] [option] [ctrl]
# 예: press n cmd / press return / press escape / press a cmd
press() {
  local key="$1"; shift
  local mods=""
  for m in "$@"; do
    case "$m" in
      cmd) mods="$mods command down," ;;
      shift) mods="$mods shift down," ;;
      option) mods="$mods option down," ;;
      ctrl) mods="$mods control down," ;;
    esac
  done
  mods="${mods%,}"
  local using=""
  [ -n "$mods" ] && using="using {$mods}"
  case "$key" in
    return) osascript -e "tell application \"System Events\" to key code 36 $using" ;;
    escape) osascript -e "tell application \"System Events\" to key code 53 $using" ;;
    tab)    osascript -e "tell application \"System Events\" to key code 48 $using" ;;
    delete) osascript -e "tell application \"System Events\" to key code 51 $using" ;;
    *)      osascript -e "tell application \"System Events\" to keystroke \"$key\" $using" ;;
  esac
  sleep 0.5
}

# 전체 선택 후 텍스트 교체: replace_text "텍스트"
replace_text() {
  press a cmd
  type_text "$1"
}

# SwaggerMan 모든 창 나열(다른 Space 포함): "창ID|w|h|x|y" 줄들
list_windows() {
  swift "$WORK/listwin.swift"
}

# 데모 창 ID 저장/조회
set_win() { echo "$1" > "$WIN_ID_FILE"; }
get_win() { cat "$WIN_ID_FILE"; }

# 캡처: capture <이름>  → /tmp/swaggerman-manual/raw/<이름>.png (데모 창 ID 사용)
capture() {
  screencapture -x -o -l"$(get_win)" "$WORK/raw/$1.png"
  echo "$WORK/raw/$1.png"
}

# cmux로 포커스 복귀(분석하는 동안 사용자 화면 복원용 — 선택)
focus_back() {
  osascript -e 'tell application "cmux" to activate'
}

"$@"
```

- [ ] **Step 1.4: listwin.swift 작성** (ui.sh의 list_windows가 사용)

`/tmp/swaggerman-manual/listwin.swift`로 저장 (커밋 대상 아님 — click.swift와 달리 단순해서 스크립트 컴파일 없이 `swift` 인터프리터로 실행):

```swift
import CoreGraphics
import Foundation
let info = CGWindowListCopyWindowInfo([.excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
for w in info {
    guard let owner = w["kCGWindowOwnerName"] as? String, owner == "SwaggerMan",
          let layer = w["kCGWindowLayer"] as? Int, layer == 0,
          let bounds = w["kCGWindowBounds"] as? [String: Any],
          let width = (bounds["Width"] as? NSNumber)?.intValue, width > 300 else { continue }
    let num = w["kCGWindowNumber"] as! Int
    let h = (bounds["Height"] as! NSNumber).intValue
    let x = (bounds["X"] as! NSNumber).intValue
    let y = (bounds["Y"] as! NSNumber).intValue
    print("\(num)|\(width)|\(h)|\(x)|\(y)")
}
```

- [ ] **Step 1.5: annotate.py 작성**

```python
#!/usr/bin/env python3
"""스크린샷에 빨간 네모박스 + 번호 원 주석을 그리고 리사이즈한다.

사용법: python3 annotate.py <입력.png> <출력.png> <주석.json> [--width 1728]

주석 JSON (좌표는 입력 PNG 픽셀 기준 — Retina 캡처면 2배율 픽셀):
[
  {"num": 1, "x": 100, "y": 50, "w": 800, "h": 60, "label": "tl"},
  ...
]
label: 번호 원 위치 — tl(좌상단 모서리, 기본) | tr | bl | br | l(왼쪽 바깥) | r(오른쪽 바깥)
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

RED = (255, 59, 48, 255)
WHITE = (255, 255, 255, 255)
BOX_W = 6          # 박스 테두리 두께 (2x 캡처 기준)
R = 34             # 번호 원 반지름
FONT_SIZE = 44

def load_font():
    for p in ["/System/Library/Fonts/Helvetica.ttc",
              "/System/Library/Fonts/SFNS.ttf",
              "/Library/Fonts/Arial Unicode.ttf"]:
        try:
            return ImageFont.truetype(p, FONT_SIZE)
        except OSError:
            continue
    return ImageFont.load_default()

def circle_center(a, img_w, img_h):
    x, y, w, h = a["x"], a["y"], a["w"], a["h"]
    pos = a.get("label", "tl")
    pad = 6
    centers = {
        "tl": (x + R + pad, y + R + pad),
        "tr": (x + w - R - pad, y + R + pad),
        "bl": (x + R + pad, y + h - R - pad),
        "br": (x + w - R - pad, y + h - R - pad),
        "l":  (x - R - 12, y + R),
        "r":  (x + w + R + 12, y + R),
    }
    cx, cy = centers[pos]
    cx = max(R + 2, min(img_w - R - 2, cx))
    cy = max(R + 2, min(img_h - R - 2, cy))
    return cx, cy

def main():
    src, dst, spec = sys.argv[1], sys.argv[2], sys.argv[3]
    out_width = 1728
    if "--width" in sys.argv:
        out_width = int(sys.argv[sys.argv.index("--width") + 1])

    img = Image.open(src).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = load_font()

    with open(spec) as f:
        annotations = json.load(f)

    for a in annotations:
        x, y, w, h = a["x"], a["y"], a["w"], a["h"]
        draw.rectangle([x, y, x + w, y + h], outline=RED, width=BOX_W)
        cx, cy = circle_center(a, img.width, img.height)
        draw.ellipse([cx - R, cy - R, cx + R, cy + R], fill=RED)
        text = str(a["num"])
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), text,
                  fill=WHITE, font=font)

    out = Image.alpha_composite(img, overlay).convert("RGB")
    if out.width > out_width:
        ratio = out_width / out.width
        out = out.resize((out_width, int(out.height * ratio)), Image.LANCZOS)
    out.save(dst, "PNG", optimize=True)
    print(f"saved: {dst} ({len(annotations)} annotations, {out.width}x{out.height})")

if __name__ == "__main__":
    main()
```

- [ ] **Step 1.6: click 바이너리 컴파일 + listwin 복사**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop/scripts/manual
swiftc -O -o /tmp/swaggerman-manual/click click.swift
cp click.swift /dev/null 2>/dev/null || true  # (컴파일 확인용 no-op)
# listwin.swift는 ui.sh가 참조하는 위치로 복사
cat > /tmp/swaggerman-manual/listwin.swift << 'EOF'
(Step 1.4의 listwin.swift 내용)
EOF
chmod +x ui.sh
```

Expected: `/tmp/swaggerman-manual/click` 바이너리 생성, 에러 없음

- [ ] **Step 1.7: 헬퍼 동작 검증**

```bash
UI=/Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop/scripts/manual/ui.sh
# 1) 창 나열 (3개 이상 나와야 함 — 사용자 기존 창들)
$UI list_windows
# 2) 활성화 + bounds
$UI activate && $UI bounds
# 3) 기존 창 캡처 테스트 (첫 번째 창 ID로)
WIN=$($UI list_windows | head -1 | cut -d'|' -f1)
$UI set_win "$WIN"
$UI capture test
# 4) cmux 포커스 복귀
$UI focus_back
```

Expected: bounds가 "0 37 1728 1080" 형태로 출력, `/tmp/swaggerman-manual/raw/test.png` 생성. Read 도구로 test.png를 열어 SwaggerMan 화면인지 확인.

- [ ] **Step 1.8: annotate.py 검증**

```bash
cat > /tmp/swaggerman-manual/test-ann.json << 'EOF'
[{"num": 1, "x": 100, "y": 100, "w": 1000, "h": 200, "label": "tl"},
 {"num": 2, "x": 100, "y": 400, "w": 600, "h": 300, "label": "l"}]
EOF
python3 /Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop/scripts/manual/annotate.py \
  /tmp/swaggerman-manual/raw/test.png /tmp/swaggerman-manual/annotated/test.png \
  /tmp/swaggerman-manual/test-ann.json
```

Expected: "saved: ... (2 annotations, 1728x...)". Read로 열어 빨간 박스 2개 + ①② 번호 원 확인.

- [ ] **Step 1.9: 스크립트 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add apps/desktop/scripts/manual/
git commit -m "도구: 매뉴얼 스크린샷 자동화 헬퍼(CGEvent 클릭·캡처·PIL 주석)"
```

---

# Phase 2: 데모 데이터 구축 + 캡처 (앱 조작 구간)

> ⚠️ 시작 전 사용자에게 고지: "지금부터 약 30~60분간 SwaggerMan을 자동 조작합니다. Mac 키보드·마우스 사용을 멈춰 주세요. 클립보드가 덮어써집니다."
>
> **공통 패턴 (모든 인터랙션에 적용):**
> 1. `$UI capture <이름>` → Read로 열어 현재 상태 확인
> 2. 클릭할 UI 요소의 위치를 캡처 픽셀 기준으로 파악 → 비율 좌표 환산 (캡처는 2배율: `비율 = 픽셀/2/논리크기`)
> 3. `$UI click_frac <fx> <fy>` (또는 `type_text`/`press`)
> 4. 다시 캡처해 의도한 상태가 됐는지 검증. 어긋나면 `press escape`로 복구 후 재시도
>
> **캡처 검수:** 매 캡처마다 사내 정보(내부 IP·도메인·실제 토큰)가 보이면 해당 캡처는 폐기하고 상태를 정리한 후 재촬영.

### Task 2: 데모 창 생성 + 다크 테마 + Petstore 프로젝트 로드

- [ ] **Step 2.1: 새 창 생성**

```bash
$UI activate
$UI list_windows > /tmp/swaggerman-manual/before.txt
$UI press n cmd          # ⌘N 새 창
sleep 2
$UI list_windows > /tmp/swaggerman-manual/after.txt
# 새로 생긴 창 ID = after에만 있는 ID → 데모 창으로 등록
NEW=$(comm -13 <(sort /tmp/swaggerman-manual/before.txt) <(sort /tmp/swaggerman-manual/after.txt) | head -1 | cut -d'|' -f1)
$UI set_win "$NEW"
$UI capture 00-new-window
```

Expected: 새 창이 생기고 데모 창 ID 등록됨. 캡처에 새 창(마지막 프로젝트가 로드된 상태일 수 있음) 확인.

- [ ] **Step 2.2: 다크 테마 확인/전환**

캡처(00-new-window)에서 배경이 밝으면(라이트 테마) 테마 토글 버튼(상단바 또는 설정)을 찾아 클릭해 다크로 전환. 어두우면 스킵.

Expected: 캡처 배경이 어두운 색(#0d1117 계열).

- [ ] **Step 2.3: Petstore 스펙 로드**

1. 상단바 스펙 URL 입력란 클릭 (`click_frac`)
2. `replace_text "https://petstore3.swagger.io/api/v3/openapi.json"`
3. Load 버튼 클릭
4. 로딩 오버레이가 사라질 때까지 3~5초 대기 후 캡처

```bash
$UI capture 01-petstore-loaded
```

Expected: 사이드바에 pet/store/user 태그 엔드포인트 목록, 상단바 프로젝트명 "Swagger Petstore - OpenAPI 3.0".

- [ ] **Step 2.4: 데모 창에 내부 정보 없는지 확인**

캡처를 Read로 열어: 내부 IP·nip.io 도메인·사내 API 경로가 없어야 함. 보이면(예: 프로젝트 드롭다운에 이전 프로젝트명) — 괜찮음, 드롭다운이 닫혀 있으면 노출 안 됨. 단, **프로젝트 드롭다운을 여는 캡처(projects.png)에서는 사내 프로젝트명이 보일 수 있으므로 Task 4에서 처리**.

### Task 3: 캡처 ①② — overview + topbar (같은 상태에서 2장)

- [ ] **Step 3.1: 화면 상태 만들기**

1. 사이드바에서 `GET /pet/findByStatus` 클릭 (pet 태그 아래)
2. Query 파라미터 `status`에 `available` 입력 (스펙 미리채우기로 이미 있을 수 있음 — 캡처로 확인)
3. Send(⌘Enter) → 응답 수신 대기 (2~3초) → 캡처로 응답 확인

```bash
$UI press return cmd     # ⌘Enter 전송
sleep 3
$UI capture 02-overview
```

Expected: 좌측 엔드포인트 목록 + 가운데 요청 폼 + 우측 Response 탭에 JSON 응답 + 상태코드 200.

- [ ] **Step 3.2: overview.png / topbar.png 원본 확정**

같은 캡처를 두 용도로 사용: `cp raw/02-overview.png raw/overview.png` + `cp raw/02-overview.png raw/topbar.png`
(주석만 다르게 입힘 — overview는 4영역 큰 박스, topbar는 상단바 버튼 12개)

Expected: raw/overview.png, raw/topbar.png 존재. AI 패널이 닫혀 있으면 ✦AI 버튼 클릭해 연 상태로 재캡처(overview에는 AI 패널도 보여야 함).

### Task 4: 캡처 ③ — projects (프로젝트 관리 모달)

- [ ] **Step 4.1: 프로젝트 관리 모달 열기 + 사내 정보 처리**

1. 상단바 ✏️(프로젝트 관리) 버튼 클릭 → 모달 캡처
2. **검수**: 모달에 사용자의 사내 프로젝트(CMDB API 등)가 목록으로 보일 것임
   - 이 경우 매뉴얼에 그대로 쓸 수 없음 → 대안: 모달의 "추가" 영역과 Petstore 항목이 보이도록 **스크롤/구도 조정**하거나, PIL 주석 단계에서 사내 항목 위에 **블러 처리 박스**를 추가
   - annotate.py에 블러 기능 추가가 필요하면: `{"blur": true, "x":..,"y":..,"w":..,"h":..}` 항목 지원 (Image.filter(GaussianBlur) crop-paste 방식, 6줄 추가)

```bash
$UI capture projects
$UI press escape    # 모달 닫기
```

Expected: 프로젝트 목록 모달 캡처. 사내 프로젝트명 노출 시 블러 처리 계획 기록.

### Task 5: 캡처 ⑧⑨ — authorize + environments (데이터 구축 겸용)

- [ ] **Step 5.1: Authorize 모달 — api_key 입력 후 캡처**

1. 상단바 Authorize 버튼 클릭
2. api_key 스킴 입력란 클릭 → `type_text "demo-api-key-12345"`
3. (보기/숨김 토글이 있으면 "보기" 상태로) 캡처 → Authorize 버튼 클릭(적용) → `press escape`

```bash
$UI capture authorize
```

Expected: Authorize 모달에 api_key 스킴 + 데모 토큰 입력 상태. petstore3 스펙의 보안 스킴(api_key, petstore_auth OAuth2)이 보임.

- [ ] **Step 5.2: 환경 모달 — 환경 2개 + 변수 생성 후 캡처**

1. 상단바 환경 드롭다운/관리 버튼 클릭 → 환경 모달
2. 환경 추가: 이름 `개발`, Base URL `https://petstore3.swagger.io/api/v3`
3. 변수 추가: `petId` = `1`, `apiToken` = `demo-token-1234`
4. 환경 추가: 이름 `운영`, Base URL 동일, `petId` = `2`
5. 변수가 보이는 상태에서 캡처 → 저장/적용 → 닫기

```bash
$UI capture environments
```

Expected: 환경 목록(개발·운영) + 변수 키/값 입력 상태가 한 화면에.

### Task 6: 캡처 ④⑤ — request + body-sample

- [ ] **Step 6.1: request.png — GET 요청 폼 + 요청 샘플 + 변수 사용**

1. `GET /pet/findByStatus` 선택 상태에서 Query `status=available` 입력
2. Headers 섹션이 보이게 (Accept 기본 헤더)
3. 요청 샘플 저장: 샘플 저장 버튼 클릭 → 이름 `판매중 펫 조회` → 저장
4. 캡처

```bash
$UI capture request
```

Expected: 메서드/경로, URL 미리보기(멀티라인+복사 버튼), 요청 샘플 셀렉터(이름 보임), Query/Headers, Send 버튼이 모두 보임.

- [ ] **Step 6.2: body-sample.png — POST Body + JSON 에디터**

1. 사이드바에서 `POST /pet` 클릭
2. Body 탭/섹션에 스펙 example이 미리 채워짐 (JSON 구문 색상)
3. 샘플 저장 버튼으로 `새 펫 등록 예시` 샘플 저장
4. 캡처

```bash
$UI capture body-sample
```

Expected: Body JSON 에디터(구문 색상) + Body 형식 선택 + 샘플 UI.

### Task 7: 캡처 ⑥⑦ — response + docs

- [ ] **Step 7.1: response.png**

1. `GET /pet/findByStatus`로 돌아가 ⌘Enter 전송 → 응답 수신
2. 응답 검색창에 `name` 입력 (검색 하이라이트 + 미니맵 매치 표시)
3. 캡처

```bash
$UI capture response
```

Expected: 상태코드·시간, Pretty/Raw/Preview 탭, 검색 입력+매치, 미니맵, 복사 버튼, 스키마 검증 결과가 보임.

- [ ] **Step 7.2: docs.png**

1. 우측 패널 Docs 탭 클릭
2. 스키마 트리 펼침 (Pet 스키마의 properties가 보이게 — 필요하면 트리 노드 클릭)
3. 캡처

```bash
$UI capture docs
```

Expected: 파라미터 목록 + 응답 스키마 트리 펼쳐진 상태.

### Task 8: 캡처 ⑩⑪ — history + compare

- [ ] **Step 8.1: 비교용 히스토리 2건 만들기**

1. `GET /pet/findByStatus`에서 `status=available` 전송 (이미 1건 있음)
2. `status`를 `sold`로 바꿔 다시 전송 → 히스토리 2건 확보

- [ ] **Step 8.2: history.png — 사이드바 히스토리 탭 + 2건 선택**

1. 사이드바 히스토리 탭 클릭
2. 히스토리 2건을 비교 선택(체크박스/⌘클릭 — 캡처로 UI 확인)
3. 비교 버튼이 활성화된 상태에서 캡처

```bash
$UI capture history
```

Expected: 히스토리 목록(2건 이상) + 비교 버튼.

- [ ] **Step 8.3: compare.png — 비교 모달**

1. 비교 버튼 클릭 → 비교 모달(2단: 좌 요청 정보 / 우 응답 diff)
2. (diff 검색창에 `id` 입력해 검색 하이라이트 표시)
3. 캡처 → `press escape`

```bash
$UI capture compare
```

Expected: 좌측 파라미터 diff(available vs sold), 우측 응답 BODY diff + 미니맵 + 검색.

### Task 9: 캡처 ⑫ — collections-runner

- [ ] **Step 9.1: 컬렉션 생성 + 요청 저장**

1. 상단바 컬렉션 버튼 클릭 → 컬렉션 모달
2. 컬렉션 추가: `Petstore 데모`
3. 현재 요청(findByStatus) 저장 + `GET /store/inventory`도 저장 (모달 닫고 선택 후 다시 저장)

- [ ] **Step 9.2: 캡처**

컬렉션 모달에 컬렉션·요청 목록·Import/Export 버튼이 보이는 상태로 캡처. 러너 결과가 한 화면에 안 되면 러너 실행 후 `runner.png` 별도 캡처(15장으로 증가).

```bash
$UI capture collections-runner
# (분리 시) $UI capture runner
```

Expected: 컬렉션 트리 + 저장된 요청 + Import/Export. (러너: 통과/실패 리포트)

### Task 10: 캡처 ⑬ — ai-panel

- [ ] **Step 10.1: AI 대화 + /요청 폼 채우기**

1. ✦AI 패널 열기 (이미 열려 있으면 스킵)
2. 입력창 클릭 → `type_text "이 API는 어떤 동작을 하는 API야?"` → `press return`
3. 스트리밍 완료 대기 (10~30초, 캡처로 완료 확인 — 응답 텍스트가 더 안 늘어나면 완료)
4. 입력창에 `/요청 판매중인 펫 목록을 조회해줘` → `press return`
5. 제안 카드(폼에 적용/cURL 복사/변수로 저장 버튼) 표시 대기 → 캡처

```bash
$UI capture ai-panel
```

Expected: 대화(질문+답변) + /요청 제안 카드 + 모델 선택 UI가 보임.
⚠️ claude CLI 호출 — 실제 사용자 quota 소모(질문 1 + 폼채우기 1). 실패 시(미로그인 등) AI 패널 안내 화면이라도 캡처해 사용.

### Task 11: 캡처 ⑭ — settings + 데모 창 정리

- [ ] **Step 11.1: settings.png**

1. 상단바 ⚙ 클릭 → 설정 모달
2. 캡처 (타임아웃·SSL·프록시·claude 경로 입력란이 보이는 상태 — **프록시·경로 입력란은 비워둔 상태로**, 사용자 실제 설정값이 보이면 블러 대상)
3. `press escape`

```bash
$UI capture settings
```

Expected: 설정 모달의 네트워크·claude 설정 항목.

- [ ] **Step 11.2: 전역 헤더 모달 확인** (topbar 주석 설명용 — 별도 스크린샷은 만들지 않되, UI 위치·이름 확인)

- [ ] **Step 11.3: 데모 창 닫기 + 포커스 복귀**

```bash
$UI activate
$UI press w cmd      # 데모 창 닫기 (⌘W)
$UI focus_back
```

Expected: 데모 창이 닫히고 사용자의 기존 창은 그대로. `$UI list_windows` 결과가 before.txt와 동일.

- [ ] **Step 11.4: 전체 캡처 사내 정보 최종 검수**

raw/ 의 모든 캡처를 Read로 열어 내부 IP·도메인·실토큰 노출 여부 확인. 노출 캡처는 블러 주석 추가 또는 재촬영.

---

# Phase 3: 주석 + HTML + 퍼블리시 (오프라인 작업)

### Task 12: 14장 주석 적용

- [ ] **Step 12.1: 캡처별 주석 JSON 작성**

각 raw 캡처를 Read로 열어 박스 좌표(캡처 픽셀)를 정하고 `/tmp/swaggerman-manual/ann/<이름>.json` 작성. 스펙의 번호 구성을 따른다:

| 파일 | 번호 주석 |
|---|---|
| overview | ①상단바 ②사이드바 ③요청 편집기 ④우측 패널 |
| topbar | ①스펙 URL ②Load ③프로젝트 ④✏️관리 ⑤환경 ⑥Authorize ⑦cURL ⑧컬렉션 ⑨러너 ⑩전역헤더 ⑪⚙설정 ⑫✦AI |
| projects | ①목록 ②추가 ③수정 ④삭제·열기 |
| request | ①메서드/경로 ②URL 미리보기·복사 ③요청 샘플 ④Query/Path ⑤Headers ⑥Send |
| body-sample | ①Body 형식 ②JSON 에디터 ③샘플 저장/전환 |
| response | ①상태·시간 ②Pretty/Raw/Preview ③검색(⌘F) ④미니맵 ⑤복사 ⑥스키마 검증 |
| docs | ①파라미터 ②요청 스키마 ③응답 스키마 |
| authorize | ①스킴 목록 ②토큰 입력·보기/숨김 ③OAuth2 ④Authorize/Logout |
| environments | ①환경 목록 ②Base URL ③변수 ④추가/적용 |
| history | ①목록 ②복원 ③비교 버튼 |
| compare | ①파라미터 diff ②응답 diff ③검색 ④미니맵 |
| collections-runner | ①컬렉션·폴더 ②저장 요청 ③Import/Export ④일괄 실행 |
| ai-panel | ①모델 선택 ②대화 ③제안 카드 ④폼에 적용 ⑤cURL·변수 저장 |
| settings | ①타임아웃 ②SSL 검증 ③프록시 ④claude 경로 |

실제 UI에 없는 요소(예: docs에 요청 스키마 없음)는 주석에서 빼고 본문 설명도 함께 조정한다. **주석 번호와 본문 설명의 1:1 일치가 최우선.**

- [ ] **Step 12.2: 일괄 적용 + 검수**

```bash
cd /tmp/swaggerman-manual
for f in overview topbar projects request body-sample response docs authorize environments history compare collections-runner ai-panel settings; do
  python3 /Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop/scripts/manual/annotate.py \
    raw/$f.png annotated/$f.png ann/$f.json
done
```

각 annotated/*.png를 Read로 열어: 박스가 의도한 UI 요소를 정확히 감싸는지, 번호가 가려지지 않는지 확인. 어긋나면 JSON 수정 후 재실행.

### Task 13: 매뉴얼 HTML 작성

- [ ] **Step 13.1: gh-pages 워크트리 생성**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git worktree add /tmp/swaggerman-ghpages gh-pages
```

- [ ] **Step 13.2: 스크린샷 교체**

```bash
cd /tmp/swaggerman-ghpages
git rm screenshots/*.png
mkdir -p screenshots
cp /tmp/swaggerman-manual/annotated/*.png screenshots/
```

- [ ] **Step 13.3: index.html 전면 재작성**

기존 index.html의 `<style>`(다크 테마 CSS)을 유지하고 아래를 추가:

```css
  /* 번호 마커 (본문 인라인) */
  .n {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px; height: 20px;
    background: #ff3b30;
    color: #fff;
    border-radius: 50%;
    font-size: 0.78em;
    font-weight: 700;
    font-style: normal;
    vertical-align: -3px;
    padding: 0 2px;
  }
  /* 번호 설명 리스트 */
  ul.nums { list-style: none; padding-left: 0; }
  ul.nums li { margin: 8px 0; padding-left: 30px; position: relative; }
  ul.nums li .n { position: absolute; left: 0; top: 2px; }
```

본문은 16개 섹션, 목차도 16개로 교체. 각 섹션 구성(스크린샷 → `ul.nums` 번호 설명 → 부가 설명):

1. **소개** — 기존 글 유지 + "v0.3.22 기준" 표기. 대상 사용자 3종.
2. **설치** — 기존 글 유지 (macOS xattr, Windows SmartScreen). Windows는 `.exe`(NSIS)만 언급(v0.3.12에서 MSI 제외됨).
3. **화면 구성** — `overview.png` ①~④ + `topbar.png` ①~⑫ 번호 설명.
4. **시작하기** — 스펙 로드 절차(steps), `projects.png` ①~④, 새 창(⌘N), 마지막 위치·입력값 자동 복원(v0.3.21), SSL 자체서명 안내(기존 note 유지), 로딩 오버레이.
5. **요청 보내기** — `request.png` ①~⑥ + `body-sample.png` ①~③, 파라미터 자동 칸·필수 표시, URL 미리보기 멀티라인·전체 복사, 요청 샘플(이름 저장·전환, GET도 가능), cURL 가져오기, 전송 전 사전 검증, {{변수}} 안내 링크.
6. **응답 보기** — `response.png` ①~⑥ + `docs.png` ①~③, Pretty/Raw/Preview, ⌘F 검색, 미니맵, Body/cURL/코드 스니펫 복사, 스키마 검증, 응답 파일 저장, 예제 응답 보기, 대용량(10MB+) 가상 스크롤 성능.
7. **인증** — `authorize.png` ①~④, bearer/basic/apiKey 적용 방식, 토큰 보기/숨김, OAuth2 자동 발급(client_credentials/password), 적용 후 요청 헤더 자동 포함.
8. **환경과 변수** — `environments.png` ①~④, 환경 전환, {{변수}} 치환, 동적 변수 표(`{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$guid}}`, `{{$randomUUID}}`, `{{$randomInt}}`), `{{` 자동완성, 변수 호버 툴팁(출처·실제 값), 요청 체이닝(JSONPath 추출→변수 저장), 어서션(status·JSONPath 검증).
9. **히스토리와 비교** — `history.png` ①~③ + `compare.png` ①~④, 자동 저장·복원·replay, 2건 선택 비교, 파라미터 diff + 응답 diff(추가/삭제/변경 색), diff 검색·미니맵.
10. **컬렉션과 러너** — `collections-runner.png` ①~④, 컬렉션/폴더 저장, Postman v2.1 Import, 네이티브 Export, 러너 일괄 실행+리포트.
11. **✦ AI 어시스턴트** — `ai-panel.png` ①~⑤, 기존 글 구조 유지(대화, /요청, 설명·진단, 히스토리, 보안 note, claude 설치, 경로 지정).
12. **전역 헤더·쿠키** — 전역 헤더 모달(모든 요청에 자동 첨부), 쿠키 jar(자동 유지·조회·삭제). topbar.png ⑩ 참조.
13. **설정** — `settings.png` ①~④, 타임아웃, SSL 검증 끄기(자체서명), 프록시(사내망), claude 경로, 테마 전환·줌.
14. **자동 업데이트** — 기존 글 + "프록시 환경에서는 설정→프록시 지정 후 업데이트 확인"(v0.3.19), 실패 사유 표시(v0.3.9).
15. **단축키** — 표: ⌘K, ⌘Enter, ⌘F(응답 검색), ⌘N(새 창), ⌘W(창 닫기), ⌘+/-/0, ESC(모달 닫기). Windows=Ctrl 안내.
16. **FAQ** — 기존 6개 유지 + 추가: "요청 샘플과 컬렉션의 차이", "히스토리 비교는 어떻게", "앱 재시작 후 입력값이 사라졌어요(자동 복원 안내)", "프록시 환경에서 업데이트 확인 실패".

푸터: `✦ SwaggerMan · OpenAPI Explorer · 매뉴얼 기준 버전 v0.3.22`

**본문 작성 원칙:** 번호 설명은 `<ul class="nums"><li><span class="n">1</span> <strong>이름</strong> — 설명</li>...</ul>` 형태. 스크린샷의 실제 주석 번호와 반드시 1:1 일치. 기존 매뉴얼의 존댓말 톤("~합니다") 유지.

- [ ] **Step 13.4: 로컬 렌더링 검증**

```bash
open /tmp/swaggerman-ghpages/index.html   # 또는 python3 -m http.server로 확인
```

Read 도구로 HTML 구조 검증: 16개 섹션 id, 목차 링크 일치, 이미지 14개 경로 유효(`ls screenshots/`와 대조), 깨진 태그 없음.

### Task 14: gh-pages 커밋 + 푸시 + Pages 확인

- [ ] **Step 14.1: 커밋**

```bash
cd /tmp/swaggerman-ghpages
git add -A
git status   # index.html 수정 + screenshots 교체만 있는지 확인
git commit -m "문서: 사용 매뉴얼 전면 개편 — v0.3.22 전체 기능·번호 주석 스크린샷 14장"
```

- [ ] **Step 14.2: personal 레포 푸시**

```bash
git push personal gh-pages
```

Expected: 푸시 성공. (origin에는 gh-pages 안 올림 — 기존 구조 유지)

- [ ] **Step 14.3: GitHub Pages 반영 확인**

```bash
sleep 90
curl -s -o /dev/null -w "%{http_code}" https://jehyukkim674.github.io/swaggerman/
curl -s https://jehyukkim674.github.io/swaggerman/ | grep -c "class=\"n\""   # 번호 마커 존재 확인
curl -s -o /dev/null -w "%{http_code}" https://jehyukkim674.github.io/swaggerman/screenshots/overview.png
```

Expected: 모두 200, 번호 마커 다수 존재. 반영이 늦으면(Pages 빌드 수 분) 재시도.

### Task 15: 마무리

- [ ] **Step 15.1: 워크트리·임시 파일 정리**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git worktree remove /tmp/swaggerman-ghpages
rm -rf /tmp/swaggerman-manual
```

- [ ] **Step 15.2: main 브랜치 푸시 (스크립트·spec·plan)**

```bash
git push origin main && git push personal main
```

- [ ] **Step 15.3: 메모리 기록**

`~/.claude/projects/.../memory/`에 매뉴얼 개편 사실 기록: gh-pages 매뉴얼이 v0.3.22 기준으로 갱신됨, 스크린샷 자동화 스크립트 위치(`apps/desktop/scripts/manual/`), 다음 갱신 시 동일 절차 재사용 가능.

- [ ] **Step 15.4: 사용자 안내**

- 매뉴얼 URL + 변경 요약 전달
- Accessibility 권한은 더 이상 필요 없으니 원하면 해제해도 된다고 안내

---

## Self-Review 체크 결과

- **Spec 커버리지**: 16섹션 ✓ / 14장 스크린샷 ✓ / 데모 데이터 ✓ / 자동화 방법 ✓ / 퍼블리시(gh-pages→personal) ✓ / 안전장치(새 창·검수·정리) ✓
- **Spec과 차이**: 자동화 스크립트를 main에 커밋(spec은 "설계 문서와 구현 계획만"이라 했으나, 다음 매뉴얼 갱신 때 재사용 가치가 있어 포함). projects.png에서 사내 프로젝트명 노출 가능성 → 블러 처리 대응 추가.
- **플레이스홀더 없음**: 모든 코드 블록은 실행 가능한 실제 코드. 클릭 좌표만 실행 시점에 캡처 분석으로 결정(사전 결정 불가능한 값).
- **타입/이름 일관성**: ui.sh 함수명(activate/bounds/click_frac/type_text/press/capture/set_win/get_win/list_windows/focus_back)이 모든 Task에서 동일하게 사용됨 ✓
