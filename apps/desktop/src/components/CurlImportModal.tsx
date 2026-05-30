import { useState } from "react";
import { curlToRequest } from "../core/curl";
import type { ParsedOperation } from "../core/types";
import type { RequestInputs } from "../core/request-builder";

interface Props {
  onImport: (op: ParsedOperation, inputs: RequestInputs, baseURL: string) => void;
  onClose: () => void;
}

/** cURL 명령을 붙여넣어 ad-hoc 요청으로 가져오는 모달. */
export function CurlImportModal({ onImport, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const doImport = () => {
    try {
      const { operation, inputs, baseURL } = curlToRequest(text);
      onImport(operation, inputs, baseURL);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal curl-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>cURL 가져오기</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <textarea
            className="curl-input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder={`curl -X POST https://api.example.com/users \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"kim"}'`}
            spellCheck={false}
            rows={10}
            autoFocus
          />
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            닫기
          </button>
          <button className="btn primary" onClick={doImport} disabled={!text.trim()}>
            가져오기
          </button>
        </div>
      </div>
    </div>
  );
}
