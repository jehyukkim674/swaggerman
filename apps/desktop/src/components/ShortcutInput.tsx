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
          // Tab은 포커스 이동을 허용(캡처 위젯에 갇히지 않게).
          if (e.key === "Tab") return;
          // 캡처 중에는 키 이벤트가 앱 전역 단축키(⌘K 등)로 전파되지 않게 막는다.
          // window에 addEventListener로 붙은 핸들러까지 막으려면 native
          // stopImmediatePropagation이 필요(React 합성 stopPropagation만으론 부족).
          e.preventDefault();
          e.stopPropagation();
          (e.nativeEvent as KeyboardEvent | undefined)?.stopImmediatePropagation?.();
          // fireEvent.keyDown(테스트)은 합성이벤트에 직접 프로퍼티를 심으므로
          // e.nativeEvent 대신 e(React.KeyboardEvent)를 넘긴다.
          // eventToAccelerator는 metaKey/ctrlKey/shiftKey/altKey/key만 읽어 호환됨.
          const acc = eventToAccelerator(e as unknown as KeyboardEvent);
          if (acc) {
            onChange(acc);
            (e.target as HTMLButtonElement).blur();
          }
          // 주 키가 아니면(modifier만 등) 캡처 유지
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
