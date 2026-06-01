import { Fragment } from "react";
import type { RequestSuggestion } from "../core/ai/types";
import { tokenizeJson } from "../core/json-tokenize";

/** JSON 문자열을 줄 단위로 토큰화해 구문 색상으로 렌더(읽기 전용). */
function JsonBody({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <pre>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {tokenizeJson(line).map((t, k) => (
            <span className={t.cls} key={k}>
              {t.text}
            </span>
          ))}
          {i < lines.length - 1 ? "\n" : ""}
        </Fragment>
      ))}
    </pre>
  );
}

interface Props {
  suggestion: RequestSuggestion;
  onApply: (s: RequestSuggestion) => void;
  onDismiss: () => void;
  onCopyCurl?: (s: RequestSuggestion) => void;
  onSaveVars?: (s: RequestSuggestion) => void;
}

/** 요청 작성 도우미 제안을 보여주고 폼에 적용/무시/cURL 복사/변수 저장한다. */
export function AiSuggestionCard({ suggestion, onApply, onDismiss, onCopyCurl, onSaveVars }: Props) {
  const { pathParams, queryParams, headers, body, notes } = suggestion;
  const kv = (rec?: Record<string, string>) =>
    rec && Object.keys(rec).length > 0
      ? Object.entries(rec).map(([k, v]) => `${k}: ${v}`).join("\n")
      : null;

  return (
    <div className="ai-suggestion">
      <div className="ai-suggestion-title">제안된 요청</div>
      {notes && <div className="ai-suggestion-notes">{notes}</div>}
      {kv(pathParams) && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Path</span>
          <pre>{kv(pathParams)}</pre>
        </div>
      )}
      {kv(queryParams) && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Query</span>
          <pre>{kv(queryParams)}</pre>
        </div>
      )}
      {kv(headers) && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Headers</span>
          <pre>{kv(headers)}</pre>
        </div>
      )}
      {body && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Body</span>
          <JsonBody text={body} />
        </div>
      )}
      <div className="ai-suggestion-actions">
        <button className="btn small primary" onClick={() => onApply(suggestion)}>
          폼에 적용
        </button>
        {onCopyCurl && (
          <button className="btn small" onClick={() => onCopyCurl(suggestion)} title="제안을 cURL 명령으로 복사">
            cURL 복사
          </button>
        )}
        {onSaveVars && (
          <button className="btn small" onClick={() => onSaveVars(suggestion)} title="제안 값을 환경 변수로 저장">
            변수로 저장
          </button>
        )}
        <button className="btn small" onClick={onDismiss}>
          무시
        </button>
      </div>
    </div>
  );
}
