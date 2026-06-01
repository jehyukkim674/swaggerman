import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dynamicValue } from "../core/variables";

interface Props {
  value: string;
  onChange: (value: string) => void;
  vars: string[]; // 제안할 변수 이름 목록
  varDetails?: Record<string, { value: string; source: string }>; // 호버 툴팁용 값/출처
  placeholder?: string;
  className?: string;
}

// 커서 앞에서 "열린" 변수 토큰(`{{` 뒤, 아직 `}}` 안 닫힘)과 부분 이름을 찾는다.
const OPEN_TOKEN = /\{\{\s*([\w.$-]*)$/;
// 값 안에서 닫힌 `{{ 이름 }}` 토큰(툴팁 표시 대상).
const USED_TOKEN = /\{\{\s*([\w.$-]+)\s*\}\}/g;

/** `{{` 입력 시 변수 이름을 제안하는 자동완성 입력. */
export function VarInput({ value, onChange, vars, varDetails, placeholder, className }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  // 툴팁 화면 좌표(fixed). null이면 숨김. 포털로 body에 그려 부모 overflow에 잘리지 않게 한다.
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  // 값에 등장하는 닫힌 변수 이름(중복 제거) — 툴팁 표시용.
  const usedVars = useMemo(() => {
    const names: string[] = [];
    for (const m of value.matchAll(USED_TOKEN)) {
      if (!names.includes(m[1])) names.push(m[1]);
    }
    return names;
  }, [value]);

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

  // 입력 위치 기준으로 툴팁 좌표 계산(화면 오른쪽 밖으로 나가지 않게 클램프).
  const showTooltip = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - 396));
    setTooltipPos({ top: rect.bottom + 4, left });
  };

  return (
    <span
      ref={wrapRef}
      className="var-input-wrap"
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltipPos(null)}
    >
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
      {/* 자동완성이 열려 있으면 겹침 방지를 위해 툴팁은 숨긴다.
          포털 + fixed: 부모 패널의 overflow에 잘리지 않고 화면 최상위에 표시된다. */}
      {tooltipPos &&
        !open &&
        usedVars.length > 0 &&
        createPortal(
          <div
            className="var-tooltip"
            style={{ position: "fixed", top: tooltipPos.top, left: tooltipPos.left }}
          >
            {usedVars.map((name) => {
              const detail = varDetails?.[name];
              const dynamic = name.startsWith("$") ? dynamicValue(name) : null;
              return (
                <div className="var-tooltip-row" key={name}>
                  <span className="var-tooltip-name">{`{{${name}}}`}</span>
                  {detail ? (
                    <>
                      <span className="var-tooltip-source">{detail.source}</span>
                      <span className="var-tooltip-value">{detail.value}</span>
                    </>
                  ) : dynamic !== null ? (
                    <>
                      <span className="var-tooltip-source">동적 변수</span>
                      <span className="var-tooltip-value">{dynamic} (예시)</span>
                    </>
                  ) : (
                    <span className="var-tooltip-missing">⚠ 정의되지 않음</span>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}
