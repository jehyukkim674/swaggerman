import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  /** 오른쪽 보조 텍스트(태그별 API 개수 등) */
  hint?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** true면 패널 상단에 검색창 표시 */
  searchable?: boolean;
  /** value에 해당하는 옵션이 없을 때 트리거에 표시할 문구 */
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** 래퍼에 부여 — 기존 .project-select / .env-select 등 폭 제어 클래스 유지용 */
  className?: string;
  title?: string;
}

/** 패널 최대 높이(검색창 포함) — 위/아래 펼침 방향 판단에 사용 */
const PANEL_MAX_HEIGHT = 320;

/** 네이티브 <select>를 대체하는 커스텀 드롭다운.
 *  - 다크 테마 패널 + 선택 체크 + hover/키보드(↑↓ Enter Esc) 내비게이션
 *  - searchable이면 패널 상단에 검색창(옵션 즉시 필터)
 *  - 모달 등 overflow 컨테이너 안에서도 잘리지 않도록 portal + fixed 배치 */
export function Select({
  options,
  value,
  onChange,
  searchable = false,
  placeholder = "선택…",
  searchPlaceholder = "검색…",
  disabled = false,
  className,
  title,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, up: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle),
    );
  }, [options, query]);

  function openPanel() {
    if (disabled) return;
    const rect = triggerRef.current!.getBoundingClientRect();
    // 아래 공간이 부족하면 위로 펼친다
    const up = rect.bottom + PANEL_MAX_HEIGHT > window.innerHeight && rect.top > PANEL_MAX_HEIGHT;
    setPos({ top: up ? rect.top : rect.bottom, left: rect.left, width: rect.width, up });
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  // 바깥 클릭으로 닫기 (패널이 portal이라 래퍼 contains만으로는 부족)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // 키보드 내비게이션 — 캡처 단계에서 가로채 모달의 ESC 닫기(useEscToClose)보다 먼저 처리
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(filtered.length - 1, a + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        const opt = filtered[active];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, active, onChange]);

  // 패널 바깥 영역 스크롤/창 크기 변경 시 닫기(패널 위치가 어긋나는 것 방지)
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // 키보드 이동 시 활성 항목이 보이도록 스크롤 (jsdom에는 scrollIntoView가 없어 옵셔널 호출)
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(".cselect-option.active");
    (el as HTMLElement | null)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function choose(opt: SelectOption) {
    onChange(opt.value);
    setOpen(false);
  }

  return (
    <div className={`cselect${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="cselect-trigger"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className={selected ? "cselect-value" : "cselect-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="cselect-panel"
            role="listbox"
            style={
              pos.up
                ? { left: pos.left, bottom: window.innerHeight - pos.top + 4, minWidth: pos.width }
                : { left: pos.left, top: pos.top + 4, minWidth: pos.width }
            }
          >
            {searchable && (
              <input
                className="cselect-search"
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                spellCheck={false}
              />
            )}
            <div className="cselect-list" ref={listRef}>
              {filtered.length === 0 && <div className="cselect-empty">결과 없음</div>}
              {filtered.map((opt, i) => (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  className={`cselect-option${i === active ? " active" : ""}${
                    opt.value === value ? " selected" : ""
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    // 트리거 blur보다 먼저 선택 처리
                    e.preventDefault();
                    choose(opt);
                  }}
                >
                  <span className="cselect-check">{opt.value === value ? "✓" : ""}</span>
                  <span className="cselect-option-label">{opt.label}</span>
                  {opt.hint && <span className="cselect-hint">{opt.hint}</span>}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
