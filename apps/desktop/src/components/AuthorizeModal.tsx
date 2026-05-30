import { useState } from "react";
import type { ParsedSecurityScheme } from "../core/types";
import { schemeHint } from "../core/security";

interface Props {
  schemes: ParsedSecurityScheme[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onClose: () => void;
}

/** Swagger UI 스타일 Authorize 모달.
 *  각 스킴별 값 입력 + Authorize(저장)/Logout(해제), 하단 일괄 저장. */
export function AuthorizeModal({ schemes, values, onChange, onClose }: Props) {
  // 모달 내 임시 입력값(저장 전 draft). 저장 시 onChange로 커밋한다.
  const [draft, setDraft] = useState<Record<string, string>>({ ...values });

  const setOne = (name: string, value: string) => setDraft((d) => ({ ...d, [name]: value }));

  const authorizeOne = (name: string) => onChange({ ...values, [name]: (draft[name] ?? "").trim() });
  const logoutOne = (name: string) => {
    const next = { ...values };
    delete next[name];
    onChange(next);
    setDraft((d) => ({ ...d, [name]: "" }));
  };

  const saveAll = () => {
    const merged = { ...values };
    for (const s of schemes) merged[s.name] = (draft[s.name] ?? "").trim();
    onChange(merged);
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal auth-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>🔒 Authorize</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {schemes.length === 0 && <div className="hint">이 명세에는 보안 스킴이 없습니다.</div>}
          {schemes.map((scheme) => {
            const committed = (values[scheme.name] ?? "").trim() !== "";
            return (
              <div className="auth-modal-row" key={scheme.name}>
                <div className="auth-modal-meta">
                  <span className="auth-name">{scheme.name}</span>
                  <span className="auth-hint">{schemeHint(scheme)}</span>
                  {committed && <span className="auth-applied">적용됨</span>}
                </div>
                <div className="auth-modal-input">
                  <input
                    className="auth-input"
                    value={draft[scheme.name] ?? ""}
                    onChange={(e) => setOne(scheme.name, e.target.value)}
                    placeholder="토큰 / 값 입력"
                    spellCheck={false}
                    type={committed ? "password" : "text"}
                  />
                  {committed ? (
                    <button className="btn small" onClick={() => logoutOne(scheme.name)}>
                      Logout
                    </button>
                  ) : (
                    <button
                      className="btn small primary"
                      onClick={() => authorizeOne(scheme.name)}
                      disabled={(draft[scheme.name] ?? "").trim() === ""}
                    >
                      Authorize
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            닫기
          </button>
          <button className="btn primary" onClick={saveAll}>
            모두 저장
          </button>
        </div>
      </div>
    </div>
  );
}
