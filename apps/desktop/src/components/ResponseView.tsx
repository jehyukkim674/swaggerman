import { useEffect, useMemo, useRef, useState } from "react";
import type { HTTPRequest, HTTPResponse } from "../core/types";
import { statusColor } from "./method";
import { Minimap } from "./Minimap";
import { buildSnippet, SNIPPET_LANGS, type SnippetLang } from "../core/snippet-builder";

interface Props {
  response: HTTPResponse | null;
  request: HTTPRequest | null;
  sending: boolean;
  error: string | null;
}

function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function copy(text: string, done: () => void) {
  navigator.clipboard.writeText(text);
  done();
}

export function ResponseView({ response, request, sending, error }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [active, setActive] = useState(0);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const bodyRef = useRef<HTMLPreElement>(null);

  const body = useMemo(() => (response ? prettyBody(response.body) : ""), [response]);
  const lines = useMemo(() => body.split("\n"), [body]);

  const { matchLines, matchCount } = useMemo(() => {
    const set = new Set<number>();
    let count = 0;
    if (submitted) {
      const q = submitted.toLowerCase();
      lines.forEach((line, i) => {
        const lower = line.toLowerCase();
        if (lower.includes(q)) {
          set.add(i);
          let idx = lower.indexOf(q);
          while (idx !== -1) {
            count += 1;
            idx = lower.indexOf(q, idx + q.length);
          }
        }
      });
    }
    return { matchLines: set, matchCount: count };
  }, [lines, submitted]);

  // 새 검색을 제출하면 활성 매치를 첫 번째로 되돌린다.
  useEffect(() => {
    setActive(0);
  }, [submitted]);

  // 활성 매치를 본문 가운데로 스크롤한다. (resp-body 컨테이너 내부만 스크롤)
  useEffect(() => {
    if (!submitted || matchCount === 0 || !bodyRef.current) return;
    const wrap = bodyRef.current;
    const markEl = wrap.querySelector<HTMLElement>(`mark[data-match="${active}"]`);
    if (!markEl) return;
    const wrapRect = wrap.getBoundingClientRect();
    const markRect = markEl.getBoundingClientRect();
    wrap.scrollTop += markRect.top - wrapRect.top - wrap.clientHeight / 2;
  }, [active, submitted, matchCount]);

  const goNext = () => {
    if (matchCount > 0) setActive((a) => (a + 1) % matchCount);
  };
  const goPrev = () => {
    if (matchCount > 0) setActive((a) => (a - 1 + matchCount) % matchCount);
  };

  const flash = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied(null), 1200);
  };

  if (sending) return <section className="response-pane"><div className="hint center">요청 중…</div></section>;
  if (error)
    return (
      <section className="response-pane">
        <div className="error-box big">요청 실패: {error}</div>
      </section>
    );
  if (!response)
    return (
      <section className="response-pane">
        <div className="hint center">Send를 눌러 요청을 실행하세요.</div>
      </section>
    );

  const highlighted = renderHighlighted(body, submitted, active);

  return (
    <section className="response-pane">
      <div className="response-status">
        <span className="status-code" style={{ color: statusColor(response.statusCode) }}>
          {response.statusCode}
        </span>
        <span className="muted">{response.durationMs}ms</span>
        <span className="muted">{formatSize(response.size)}</span>
        <div className="resp-actions">
          <button className="btn small" onClick={() => copy(body, () => flash("body"))}>
            {copied === "body" ? "✓" : "Body"}
          </button>
          {request && (
            <button
              className="btn small"
              onClick={() => copy(buildSnippet(request, "cURL"), () => flash("curl"))}
            >
              {copied === "curl" ? "✓" : "cURL"}
            </button>
          )}
          {request && (
            <div className="snippet-menu">
              <button className="btn small" onClick={() => setSnippetOpen((v) => !v)}>
                Code ▾
              </button>
              {snippetOpen && (
                <div className="snippet-dropdown">
                  {SNIPPET_LANGS.map((lang: SnippetLang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        copy(buildSnippet(request, lang), () => flash("code"));
                        setSnippetOpen(false);
                      }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {request && (
        <div className="req-url-line">
          <span className="method-mini">{request.method}</span>
          <span className="req-url-text">{request.url}</span>
        </div>
      )}

      <details className="resp-headers">
        <summary>Response Headers ({Object.keys(response.headers).length})</summary>
        <div className="headers-grid">
          {Object.entries(response.headers).map(([key, value]) => (
            <div className="header-line" key={key}>
              <span className="h-key">{key}</span>
              <span className="h-val">{value}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="search-bar">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // 같은 검색어로 다시 Enter 하면 매치 사이를 이동한다. (Shift+Enter = 이전)
              if (submitted === search && matchCount > 0) {
                if (e.shiftKey) goPrev();
                else goNext();
              } else {
                setSubmitted(search);
              }
            }
            if (e.key === "Escape") {
              setSearch("");
              setSubmitted("");
            }
          }}
          placeholder="검색 후 Enter"
          spellCheck={false}
        />
        {submitted &&
          (matchCount === 0 ? (
            <span className="match none">일치 없음</span>
          ) : (
            <span className="match-nav">
              <button className="btn small" onClick={goPrev} title="이전 매치 (Shift+Enter)">
                ‹
              </button>
              <span className="match">
                {active + 1}/{matchCount}
              </span>
              <button className="btn small" onClick={goNext} title="다음 매치 (Enter)">
                ›
              </button>
            </span>
          ))}
      </div>

      <div className="resp-body-wrap">
        <pre ref={bodyRef} className="resp-body">
          {highlighted}
        </pre>
        <Minimap text={body} scrollRef={bodyRef} matchLines={matchLines} />
      </div>
    </section>
  );
}

/** 검색어가 있으면 매치를 <mark>로 감싼 노드를, 없으면 원문 문자열을 반환.
 *  active 인덱스의 매치에는 `active` 클래스를 추가하고 data-match 로 식별자를 부여한다. */
function renderHighlighted(body: string, query: string, active: number): React.ReactNode {
  if (!query) return body;
  const parts: React.ReactNode[] = [];
  const lower = body.toLowerCase();
  const lq = query.toLowerCase();
  let i = 0;
  let matchIndex = 0;
  let idx = lower.indexOf(lq);
  while (idx !== -1) {
    if (idx > i) parts.push(body.slice(i, idx));
    parts.push(
      <mark key={matchIndex} data-match={matchIndex} className={matchIndex === active ? "hl active" : "hl"}>
        {body.slice(idx, idx + query.length)}
      </mark>,
    );
    i = idx + query.length;
    matchIndex += 1;
    idx = lower.indexOf(lq, i);
  }
  parts.push(body.slice(i));
  return parts;
}
