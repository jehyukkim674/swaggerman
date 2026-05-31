import { useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  vars: string[]; // 제안할 변수 이름 목록
  placeholder?: string;
  className?: string;
}

// 커서 앞에서 "열린" 변수 토큰(`{{` 뒤, 아직 `}}` 안 닫힘)과 부분 이름을 찾는다.
const OPEN_TOKEN = /\{\{\s*([\w.$-]*)$/;

/** `{{` 입력 시 변수 이름을 제안하는 자동완성 입력. */
export function VarInput({ value, onChange, vars, placeholder, className }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<string[]>([]);
  const [active, setActive] = useState(0);

  const refresh = (val: string, caret: number) => {
    const before = val.slice(0, caret);
    const m = before.match(OPEN_TOKEN);
    if (!m) {
      setOpen(false);
      return;
    }
    const partial = m[1].toLowerCase();
    const list = vars.filter((v) => v.toLowerCase().includes(partial)).slice(0, 8);
    setMatches(list);
    setActive(0);
    setOpen(list.length > 0);
  };

  const insert = (name: string) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const m = before.match(OPEN_TOKEN);
    if (!m) return;
    const start = before.length - m[0].length;
    const head = value.slice(0, start) + `{{${name}}}`;
    onChange(head + after);
    setOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(head.length, head.length);
    });
  };

  return (
    <span className="var-input-wrap">
      <input
        ref={ref}
        className={className}
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          refresh(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(matches.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" || e.key === "Tab") {
            if (matches[active]) {
              e.preventDefault();
              insert(matches[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="var-suggest">
          {matches.map((m, i) => (
            <div
              key={m}
              className={i === active ? "var-suggest-item active" : "var-suggest-item"}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(m);
              }}
            >
              {`{{${m}}}`}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
