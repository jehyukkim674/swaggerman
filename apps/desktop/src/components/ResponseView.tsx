import { useEffect, useMemo, useRef, useState } from "react";
import type { HTTPRequest, HTTPResponse, ParsedOperation } from "../core/types";
import { statusColor } from "./method";
import { CopyIcon } from "./icons";
import { Minimap } from "./Minimap";
import { DocsPane } from "./DocsPane";
import { JsonView } from "./JsonView";
import { save } from "@tauri-apps/plugin-dialog";
import { buildSnippet, SNIPPET_LANGS, type SnippetLang } from "../core/snippet-builder";
import { writeTextFile } from "../core/fs";
import { HistoryBanner } from "./RequestEditor";
import type { HistoryItem } from "../core/history";
import type { ValidationIssue } from "../core/schema-validate";

interface Props {
  response: HTTPResponse | null;
  request: HTTPRequest | null;
  operation: ParsedOperation | null;
  sending: boolean;
  error: string | null;
  tab: "docs" | "response";
  onTab: (tab: "docs" | "response") => void;
  historyItem: HistoryItem | null;
  schemaIssues: ValidationIssue[];
  onAskAi?: (kind: "diagnose" | "explain") => void;
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

export function ResponseView({
  response,
  request,
  operation,
  sending,
  error,
  tab,
  onTab,
  historyItem,
  schemaIssues,
  onAskAi,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [active, setActive] = useState(0);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"pretty" | "raw" | "preview">("pretty");
  const bodyRef = useRef<HTMLDivElement>(null);

  const contentType = response?.headers["content-type"] ?? "";
  const isHtml = contentType.includes("text/html");

  const saveBody = async () => {
    if (!response) return;
    try {
      const ext = isHtml ? "html" : contentType.includes("json") ? "json" : "txt";
      const path = await save({
        defaultPath: `response.${ext}`,
        filters: [{ name: "응답", extensions: [ext, "txt", "json", "html"] }],
      });
      if (typeof path === "string") await writeTextFile(path, response.body);
    } catch {
      /* 취소 등 무시 */
    }
  };

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
          <span className="view-seg">
            <button
              className={viewMode === "pretty" ? "active" : ""}
              onClick={() => setViewMode("pretty")}
              title="보기 좋게 들여쓴 JSON(구문 색상·검색·미니맵)"
            >
              Pretty
            </button>
            <button
              className={viewMode === "raw" ? "active" : ""}
              onClick={() => setViewMode("raw")}
              title="서버가 보낸 원본 그대로(포맷팅 없음)"
            >
              Raw
            </button>
            {isHtml && (
              <button
                className={viewMode === "preview" ? "active" : ""}
                onClick={() => setViewMode("preview")}
                title="HTML 응답을 안전한 샌드박스에서 미리보기"
              >
                Preview
              </button>
            )}
          </span>
          <button
            className="btn small"
            onClick={saveBody}
            title="응답 본문을 파일(.json/.html/.txt)로 저장합니다"
          >
            저장
          </button>
          {request && (
            <button
              className="btn small"
              onClick={() => copy(buildSnippet(request, "cURL"), () => flash("curl"))}
              title="이 요청을 그대로 재현하는 cURL 명령을 클립보드에 복사"
            >
              {copied === "curl" ? "✓" : "cURL"}
            </button>
          )}
          {request && (
            <div className="snippet-menu">
              <button
                className="btn small"
                onClick={() => setSnippetOpen((v) => !v)}
                title="이 요청을 코드 스니펫(JavaScript·Python 등)으로 복사"
              >
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
          {onAskAi && (
            <span className="ai-resp-actions">
              <button
                className="btn small"
                onClick={() => onAskAi("explain")}
                title="AI가 응답 본문을 한국어로 요약하고 주요 필드의 의미를 설명합니다(✦ AI 패널에서)"
              >
                ✦ 설명
              </button>
              {response.statusCode >= 400 && (
                <button
                  className="btn small"
                  onClick={() => onAskAi("diagnose")}
                  title="AI가 상태코드와 본문을 근거로 실패 원인과 해결 방법을 진단합니다(4xx·5xx)"
                >
                  ✦ 진단
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {request && (
        <div className="req-url-line">
          <span className="method-mini">{request.method}</span>
          <span className="req-url-text">{request.url}</span>
        </div>
      )}

      {operation && operation.responses.some((r) => r.schema) && (
        <details className="schema-check" open={schemaIssues.length > 0}>
          <summary>
            스키마 검증
            {schemaIssues.length === 0 ? (
              <span className="schema-ok">✓ 일치</span>
            ) : (
              <span className="schema-bad">✕ {schemaIssues.length}건 불일치</span>
            )}
          </summary>
          {schemaIssues.map((issue, i) => (
            <div className="schema-issue" key={i}>
              <span className="schema-issue-path">{issue.path}</span>
              <span className="schema-issue-msg">{issue.message}</span>
            </div>
          ))}
        </details>
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

      {viewMode === "preview" && isHtml ? (
        <iframe className="resp-preview" sandbox="" srcDoc={response.body} title="HTML 미리보기" />
      ) : (
        <div className="resp-body-wrap">
          {viewMode === "raw" ? (
            <pre className="resp-raw">{response.body}</pre>
          ) : (
            <>
              <JsonView text={body} query={submitted} active={active} containerRef={bodyRef} />
              <Minimap text={body} scrollRef={bodyRef} matchLines={matchLines} />
            </>
          )}
          <button
            className="body-copy-fab"
            onClick={() => copy(viewMode === "raw" ? response.body : body, () => flash("body"))}
            title="응답 본문 전체를 클립보드에 복사"
            aria-label="응답 본문 복사"
          >
            {copied === "body" ? "✓" : <CopyIcon size={16} />}
          </button>
        </div>
      )}
    </>
  );

  return (
    <section className="response-pane">
      {historyItem && <HistoryBanner item={historyItem} />}
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

