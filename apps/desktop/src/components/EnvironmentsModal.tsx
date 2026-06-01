import { CloseCircleIcon, TrashIcon } from "./icons";

interface EnvVar {
  key: string;
  value: string;
}

interface Env {
  name: string;
  baseURL: string;
  vars?: EnvVar[];
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
    onChange([...envs, { name: `환경 ${envs.length + 1}`, baseURL: currentBaseURL, vars: [] }]);

  const setVars = (index: number, vars: EnvVar[]) => update(index, { vars });

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal env-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>환경 관리</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          {envs.length === 0 && (
            <div className="hint">저장된 환경이 없습니다. 아래 “+ 환경 추가”로 만들어 보세요.</div>
          )}
          {envs.map((env, i) => (
            <div className="env-card" key={i}>
              <div className="env-item">
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
                <button className="btn small icon danger" onClick={() => remove(i)} title="삭제">
                  <TrashIcon />
                </button>
              </div>

              <div className="env-vars">
                <div className="env-vars-label">
                  변수 <span className="section-note">요청에서 {"{{이름}}"} 으로 사용</span>
                </div>
                {(env.vars ?? []).map((v, vi) => (
                  <div className="env-var-row" key={vi}>
                    <input
                      className="kv-input"
                      value={v.key}
                      onChange={(e) =>
                        setVars(
                          i,
                          (env.vars ?? []).map((x, j) =>
                            j === vi ? { ...x, key: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="이름 (예: token)"
                      spellCheck={false}
                    />
                    <input
                      className="kv-input"
                      value={v.value}
                      onChange={(e) =>
                        setVars(
                          i,
                          (env.vars ?? []).map((x, j) =>
                            j === vi ? { ...x, value: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="값"
                      spellCheck={false}
                    />
                    <button
                      className="icon-btn"
                      onClick={() => setVars(i, (env.vars ?? []).filter((_, j) => j !== vi))}
                      title="변수 삭제"
                    >
                      <CloseCircleIcon size={15} />
                    </button>
                  </div>
                ))}
                <button
                  className="add-row"
                  onClick={() => setVars(i, [...(env.vars ?? []), { key: "", value: "" }])}
                >
                  + 변수 추가
                </button>
              </div>
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
