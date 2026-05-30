import { useMemo, useState } from "react";
import type { HTTPResponse } from "../core/types";
import { statusColor } from "./method";

interface Props {
  response: HTTPResponse | null;
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

export function ResponseView({ response, sending, error }: Props) {
  const [copied, setCopied] = useState(false);
  const body = useMemo(() => (response ? prettyBody(response.body) : ""), [response]);

  if (sending) {
    return (
      <section className="response-pane">
        <div className="hint center">요청 중…</div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="response-pane">
        <div className="error-box big">요청 실패: {error}</div>
      </section>
    );
  }
  if (!response) {
    return (
      <section className="response-pane">
        <div className="hint center">Send를 눌러 요청을 실행하세요.</div>
      </section>
    );
  }

  const copyBody = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section className="response-pane">
      <div className="response-status">
        <span className="status-code" style={{ color: statusColor(response.statusCode) }}>
          {response.statusCode}
        </span>
        <span className="muted">{response.durationMs}ms</span>
        <span className="muted">{formatSize(response.size)}</span>
        <button className="btn small" onClick={copyBody}>
          {copied ? "✓ 복사됨" : "Body 복사"}
        </button>
      </div>

      <details className="resp-headers" open>
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

      <pre className="resp-body">{body}</pre>
    </section>
  );
}
