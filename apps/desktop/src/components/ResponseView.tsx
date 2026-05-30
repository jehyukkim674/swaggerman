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

  // 검색 제출 시 첫 매치 라인으로 스크롤
  useEffect(() => {
    if (!submitted || matchLines.size === 0 || !bodyRef.current) return;
    const first = Math.min(...matchLines);
    const el = bodyRef.current;
    el.scrollTop = (first / Math.max(lines.length, 1)) * el.scrollHeight - el.clientHeight / 3;
  }, [submitted, matchLines, lines.length]);

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

  const highlighted = renderHighlighted(body, submitted);

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
            if (e.key === "Enter") setSubmitted(search);
            if (e.key === "Escape") {
              setSearch("");
              setSubmitted("");
            }
          }}
          placeholder="검색 후 Enter"
          spellCheck={false}
        />
        {submitted && (
          <span className={matchCount === 0 ? "match none" : "match"}>
            {matchCount === 0 ? "일치 없음" : `${matchCount}개 일치`}
          </span>
        )}
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

/** 검색어가 있으면 매치를 <mark>로 감싼 노드를, 없으면 원문 문자열을 반환. */
function renderHighlighted(body: string, query: string): React.ReactNode {
  if (!query) return body;
  const parts: React.ReactNode[] = [];
  const lower = body.toLowerCase();
  const lq = query.toLowerCase();
  let i = 0;
  let key = 0;
  let idx = lower.indexOf(lq);
  while (idx !== -1) {
    if (idx > i) parts.push(body.slice(i, idx));
    parts.push(
      <mark key={key++} className="hl">
        {body.slice(idx, idx + query.length)}
      </mark>,
    );
    i = idx + query.length;
    idx = lower.indexOf(lq, i);
  }
  parts.push(body.slice(i));
  return parts;
}
