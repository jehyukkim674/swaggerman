#!/bin/bash
# SwaggerMan UI 자동화 헬퍼 — 매뉴얼 스크린샷 촬영용
# 필요 권한: Accessibility(클릭·키입력), Screen Recording(캡처)
# 사용법: ./ui.sh <command> [args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK=/tmp/swaggerman-manual
CLICK="$WORK/click"
WIN_ID_FILE="$WORK/window-id"

# 앱 활성화 (데모 창이 속한 Space로 전환됨)
activate() {
  osascript -e 'tell application "SwaggerMan" to activate'
  sleep 1
}

# 최전면 SwaggerMan의 가장 큰 창(본 창) 논리 bounds: "x y w h"
# (window 1이 메뉴바 보조 창일 수 있어 면적 최대 창을 고른다)
bounds() {
  osascript <<'EOF'
tell application "System Events" to tell process "SwaggerMan"
  set bestPos to {0, 0}
  set bestSize to {0, 0}
  set bestArea to 0
  repeat with w in windows
    set s to size of w
    set a to (item 1 of s) * (item 2 of s)
    if a > bestArea then
      set bestArea to a
      set bestSize to s
      set bestPos to position of w
    end if
  end repeat
  return ((item 1 of bestPos) as text) & " " & ((item 2 of bestPos) as text) & " " & ¬
    ((item 1 of bestSize) as text) & " " & ((item 2 of bestSize) as text)
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
  # shellcheck disable=SC2086
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

# SwaggerMan 모든 창 나열(다른 Space 포함, 본 창만): "창ID|w|h|x|y" 줄들
list_windows() {
  swift "$SCRIPT_DIR/listwin.swift"
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
