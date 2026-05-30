import { useState } from "react";
import type { ParsedSecurityScheme } from "../core/types";
import { schemeHint } from "../core/security";

interface Props {
  schemes: ParsedSecurityScheme[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function AuthorizePanel({ schemes, values, onChange }: Props) {
  const [open, setOpen] = useState(false);
  if (schemes.length === 0) return null;

  const activeCount = schemes.filter((s) => (values[s.name] ?? "").trim() !== "").length;

  return (
    <div className="authorize">
      <button className="authorize-toggle" onClick={() => setOpen((v) => !v)}>
        <span className={activeCount > 0 ? "lock on" : "lock"}>
          {activeCount > 0 ? "🔓" : "🔒"} Authorize
        </span>
        {activeCount > 0 && (
          <span className="auth-count">
            {activeCount}/{schemes.length}
          </span>
        )}
        <span className="chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="authorize-body">
          {schemes.map((scheme) => (
            <div className="auth-row" key={scheme.name}>
              <div className="auth-meta">
                <span className="auth-name">{scheme.name}</span>
                <span className="auth-hint">{schemeHint(scheme)}</span>
              </div>
              <input
                className="auth-input"
                value={values[scheme.name] ?? ""}
                onChange={(e) => onChange({ ...values, [scheme.name]: e.target.value })}
                placeholder="토큰 / 값 입력"
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
