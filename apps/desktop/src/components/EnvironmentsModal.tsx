import { TrashIcon } from "./icons";

interface Env {
  name: string;
  baseURL: string;
}

interface Props {
  envs: Env[];
  currentBaseURL: string;
  onChange: (envs: Env[]) => void;
  onApply: (baseURL: string) => void;
  onClose: () => void;
}

export function EnvironmentsModal({ envs, currentBaseURL, onChange, onApply, onClose }: Props) {
  const update = (index: number, patch: Partial<Env>) =>
    onChange(envs.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  const remove = (index: number) => onChange(envs.filter((_, i) => i !== index));
  const add = () =>
    onChange([...envs, { name: `환경 ${envs.length + 1}`, baseURL: currentBaseURL }]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>환경 관리</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="env-item env-item-header">
            <span className="env-col-name">이름</span>
            <span className="env-col-url">Base URL</span>
            <span className="env-col-actions" />
          </div>
          {envs.length === 0 && (
            <div className="hint">저장된 환경이 없습니다. 아래 “+ 환경 추가”로 만들어 보세요.</div>
          )}
          {envs.map((env, i) => (
            <div className="env-item" key={i}>
              <input
                className="env-item-name"
                value={env.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="이름"
                spellCheck={false}
              />
              <input
                className="env-item-url"
                value={env.baseURL}
                onChange={(e) => update(i, { baseURL: e.target.value })}
                placeholder="https://api.example.com"
                spellCheck={false}
              />
              <button
                className="btn small primary"
                onClick={() => {
                  onApply(env.baseURL);
                  onClose();
                }}
                title="이 환경의 Base URL을 적용"
              >
                적용
              </button>
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
            + 환경 추가
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
