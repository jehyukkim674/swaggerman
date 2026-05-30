import { useState } from "react";
import type { ParsedSecurityScheme } from "../core/types";
import { schemeHint } from "../core/security";
import type { OAuth2Config, OAuth2Grant, OAuth2TokenResult } from "../core/oauth2";

interface Props {
  schemes: ParsedSecurityScheme[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onClose: () => void;
  oauth2: OAuth2Config;
  onOauth2Change: (cfg: OAuth2Config) => void;
  onFetchToken: (cfg: OAuth2Config) => Promise<OAuth2TokenResult>;
}

/** Swagger UI 스타일 Authorize 모달.
 *  각 스킴별 값 입력 + Authorize(저장)/Logout(해제), 하단 일괄 저장. */
export function AuthorizeModal({
  schemes,
  values,
  onChange,
  onClose,
  oauth2,
  onOauth2Change,
  onFetchToken,
}: Props) {
  // 모달 내 임시 입력값(저장 전 draft). 저장 시 onChange로 커밋한다.
  const [draft, setDraft] = useState<Record<string, string>>({ ...values });
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCfg = (patch: Partial<OAuth2Config>) => onOauth2Change({ ...oauth2, ...patch });

  const issueToken = async () => {
    setFetching(true);
    setFetchMsg(null);
    try {
      const result = await onFetchToken(oauth2);
      const target = oauth2.targetScheme || schemes[0]?.name;
      if (target) {
        setDraft((d) => ({ ...d, [target]: result.accessToken }));
        onChange({ ...values, [target]: result.accessToken });
      }
      setFetchMsg({ ok: true, text: `발급 완료 → ${target ?? "(대상 없음)"}` });
    } catch (e) {
      setFetchMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setFetching(false);
    }
  };

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

          <details className="oauth2-block">
            <summary>OAuth2로 토큰 발급</summary>
            <div className="oauth2-grid">
              <label className="oauth2-field">
                <span>Grant</span>
                <select
                  value={oauth2.grant}
                  onChange={(e) => setCfg({ grant: e.target.value as OAuth2Grant })}
                >
                  <option value="client_credentials">client_credentials</option>
                  <option value="password">password</option>
                </select>
              </label>
              <label className="oauth2-field">
                <span>Token URL</span>
                <input
                  value={oauth2.tokenUrl}
                  onChange={(e) => setCfg({ tokenUrl: e.target.value })}
                  placeholder="https://auth.example.com/oauth/token"
                  spellCheck={false}
                />
              </label>
              <label className="oauth2-field">
                <span>Client ID</span>
                <input
                  value={oauth2.clientId}
                  onChange={(e) => setCfg({ clientId: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="oauth2-field">
                <span>Client Secret</span>
                <input
                  type="password"
                  value={oauth2.clientSecret}
                  onChange={(e) => setCfg({ clientSecret: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="oauth2-field">
                <span>Scope</span>
                <input
                  value={oauth2.scope}
                  onChange={(e) => setCfg({ scope: e.target.value })}
                  placeholder="read write"
                  spellCheck={false}
                />
              </label>
              {oauth2.grant === "password" && (
                <>
                  <label className="oauth2-field">
                    <span>Username</span>
                    <input
                      value={oauth2.username}
                      onChange={(e) => setCfg({ username: e.target.value })}
                      spellCheck={false}
                    />
                  </label>
                  <label className="oauth2-field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={oauth2.password}
                      onChange={(e) => setCfg({ password: e.target.value })}
                      spellCheck={false}
                    />
                  </label>
                </>
              )}
              <label className="oauth2-field">
                <span>적용 대상</span>
                <select
                  value={oauth2.targetScheme}
                  onChange={(e) => setCfg({ targetScheme: e.target.value })}
                >
                  <option value="">{schemes[0]?.name ?? "(스킴 없음)"}</option>
                  {schemes.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="oauth2-actions">
              <button
                className="btn small primary"
                onClick={issueToken}
                disabled={fetching || !oauth2.tokenUrl}
              >
                {fetching ? "발급 중…" : "토큰 발급"}
              </button>
              {fetchMsg && (
                <span className={fetchMsg.ok ? "oauth2-ok" : "oauth2-bad"}>{fetchMsg.text}</span>
              )}
            </div>
          </details>
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
