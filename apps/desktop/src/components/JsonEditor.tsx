import { Fragment, useMemo, useRef } from "react";
import { tokenizeJson } from "../core/json-tokenize";

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

/** 편집 가능한 JSON 에디터: 하이라이트 레이어 위에 투명 textarea를 겹쳐
 *  구문 색상 + 라인번호를 제공한다(스크롤 동기화). */
export function JsonEditor({ value, onChange, rows = 12 }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => value.split("\n"), [value]);
  const plain = lines.length > 4000; // 너무 크면 색상 생략(성능)

  // textarea 스크롤에 하이라이트/거터 동기화
  const sync = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  // Tab → 공백 2칸
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const next = value.slice(0, s) + "  " + value.slice(en);
      onChange(next);
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    }
  };

  return (
    <div className="json-editor" style={{ height: `${rows * 1.5}em` }}>
      <div className="je-gutter" ref={gutterRef} aria-hidden>
        {lines.map((_, i) => (
          <div className="je-lnum" key={i}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="je-scroll">
        <pre className="je-pre" ref={preRef} aria-hidden>
          {plain
            ? value
            : lines.map((line, i) => (
                <Fragment key={i}>
                  {tokenizeJson(line).map((t, k) => (
                    <span className={t.cls} key={k}>
                      {t.text}
                    </span>
                  ))}
                  {i < lines.length - 1 ? "\n" : ""}
                </Fragment>
              ))}
          {"\n"}
        </pre>
        <textarea
          ref={taRef}
          className="je-ta"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          onKeyDown={onKeyDown}
          spellCheck={false}
          wrap="off"
        />
      </div>
    </div>
  );
}
