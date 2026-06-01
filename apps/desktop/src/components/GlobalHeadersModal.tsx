import { CloseCircleIcon, TrashIcon } from "./icons";
import type { RequestParam } from "../core/request-builder";
import { useEscToClose } from "./useEscToClose";

interface Props {
  headers: RequestParam[];
  onChange: (headers: RequestParam[]) => void;
  onClose: () => void;
}

export function GlobalHeadersModal({ headers, onChange, onClose }: Props) {
  // ESC 키로 닫기
  useEscToClose(onClose);

  const update = (index: number, patch: Partial<RequestParam>) =>
    onChange(headers.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  const remove = (index: number) => onChange(headers.filter((_, i) => i !== index));
  const add = () => onChange([...headers, { key: "", value: "", enabled: true }]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>전역 헤더</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="hint">
            모든 요청에 자동으로 적용됩니다. (같은 키의 요청별 헤더·인증 토큰이 우선)
          </div>
          {headers.map((h, i) => (
            <div className="env-item" key={i}>
              <input
                type="checkbox"
                checked={h.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                title="사용"
              />
              <input
                className="env-item-name"
                value={h.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="헤더 이름"
                spellCheck={false}
              />
              <input
                className="env-item-url"
                value={h.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="값"
                spellCheck={false}
              />
              <button
                className="btn small icon danger"
                onClick={() => remove(i)}
                title="삭제"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <button className="add-row" onClick={add}>
            + 헤더 추가
          </button>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
