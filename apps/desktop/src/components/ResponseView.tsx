import { useEffect, useMemo, useRef, useState } from "react";
import type { HTTPRequest, HTTPResponse, ParsedOperation } from "../core/types";
import { statusColor } from "./method";
import { Minimap } from "./Minimap";
import { DocsPane } from "./DocsPane";
import { JsonView } from "./JsonView";
import { buildSnippet, SNIPPET_LANGS, type SnippetLang } from "../core/snippet-builder";

interface Props {
  response: HTTPResponse | null;
  request: HTTPRequest | null;
  operation: ParsedOperation | null;
  sending: boolean;
  error: string | null;
  tab: "docs" | "response";
  onTab: (tab: "docs" | "response") => void;
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

export function ResponseView({ response, request, operation, sending, error, tab, onTab }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [active, setActive] = useState(0);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setActive(0);
  }, [submitted]);

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

  const responseContent = sending ? (
    <div className="hint center">요청 중…</div>
  ) : error ? (
    <div className="error-box big">요청 실패: {error}</div>
  ) : !response ? (
    <div className="hint center">Send를 눌러 요청을 실행하세요.</div>
  ) : (
    <>
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
        {(search || submitted) && (
          <button
            className="search-clear"
            onClick={() => {
              setSearch("");
              setSubmitted("");
            }}
            title="검색 지우기 (Esc)"
          >
            ✕
          </button>
        )}
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
        <JsonView text={body} query={submitted} active={active} containerRef={bodyRef} />
        <Minimap text={body} scrollRef={bodyRef} matchLines={matchLines} />
      </div>
    </>
  );

  return (
    <section className="response-pane">
      {operation && (
        <div className="resp-tabs">
          <button className={tab === "docs" ? "active" : ""} onClick={() => onTab("docs")}>
            Docs
          </button>
          <button className={tab === "response" ? "active" : ""} onClick={() => onTab("response")}>
            Response
          </button>
        </div>
      )}
      {tab === "docs" && operation ? <DocsPane operation={operation} /> : responseContent}
    </section>
  );
}

