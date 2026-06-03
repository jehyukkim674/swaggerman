// 가이드 문서 생성: operation 선택 → Markdown 생성 → 복사/파일 저장.
import { useState } from "react";
import type { ParsedSpec } from "../core/types";
import type { HistoryItem } from "../core/history";
import { buildGuideMarkdown } from "../core/guide-export";
import { methodColor } from "./method";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  spec: ParsedSpec;
  history: HistoryItem[];
  baseURL: string;
  onSaveFile: (markdown: string) => void;
  onClose: () => void;
}

export function GuideModal({ spec, history, baseURL, onSaveFile, onClose }: Props) {
  useEscToClose(onClose);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(spec.operations.map((o) => o.id)));
  const [markdown, setMarkdown] = useState("");
  const [copied, setCopied] = useState(false);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = () => {
    const ids = spec.operations.map((o) => o.id).filter((id) => checked.has(id));
    setMarkdown(buildGuideMarkdown(spec, ids, history, baseURL));
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal guide-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>가이드 문서 생성</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body guide-body">
          <div className="guide-ops">
            {spec.operations.map((o) => (
              <label className="guide-op-check" key={o.id}>
                <input type="checkbox" checked={checked.has(o.id)} onChange={() => toggle(o.id)} />
                <span className="method" style={{ color: methodColor(o.method) }}>{o.method}</span>
                <span className="guide-op-path">{o.path}</span>
              </label>
            ))}
          </div>
          <div className="guide-actions">
            <button className="btn small primary" disabled={checked.size === 0} onClick={generate}>생성</button>
            {markdown && (
              <>
                <button className="btn small" onClick={() => { navigator.clipboard.writeText(markdown).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }}>
                  <CopyIcon size={13} /> {copied ? "복사됨" : "복사"}
                </button>
                <button className="btn small" onClick={() => onSaveFile(markdown)}>파일로 저장</button>
              </>
            )}
          </div>
          <textarea className="guide-preview" aria-label="가이드 미리보기" readOnly value={markdown}
            placeholder="operation을 선택하고 '생성'을 누르세요" spellCheck={false} />
        </div>
      </div>
    </div>
  );
}
