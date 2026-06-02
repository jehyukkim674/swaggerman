import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NetworkSettings } from "../core/types";
import { clearCookies, listCookies, type CookieInfo } from "../core/cookies";
import { DONATION_URL } from "../core/donation";
import { CloseCircleIcon, CoffeeIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  settings: NetworkSettings;
  onChange: (s: NetworkSettings) => void;
  onClose: () => void;
  /** claude 실행파일 경로 수동 지정(비우면 자동 탐지). */
  claudePath?: string;
  onClaudePathChange?: (path: string) => void;
}

/** 네트워크 설정(타임아웃/SSL/프록시) + AI(claude 경로) + 쿠키 조회·삭제 모달. */
export function SettingsModal({ settings, onChange, onClose, claudePath = "", onClaudePathChange }: Props) {
  // ESC 키로 닫기
  useEscToClose(onClose);

  const [cookies, setCookies] = useState<CookieInfo[]>([]);
  const [cookieErr, setCookieErr] = useState<string | null>(null);

  // 정보 섹션: 앱 버전 + 후원
  const [version, setVersion] = useState("");
  const [donationErr, setDonationErr] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  const refresh = () => {
    listCookies()
      .then(setCookies)
      .catch((e) => setCookieErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(refresh, []);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>설정</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">네트워크</div>
          <label className="settings-field">
            <span>타임아웃 (ms)</span>
            <input
              type="number"
              value={settings.timeoutMs}
              min={1000}
              step={1000}
              onChange={(e) =>
                onChange({ ...settings, timeoutMs: Number(e.target.value) || 30000 })
              }
            />
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.insecure}
              onChange={(e) => onChange({ ...settings, insecure: e.target.checked })}
            />
            <span>SSL 인증서 검증 무시 (자체 서명 서버용 — 주의)</span>
          </label>
          <label className="settings-field">
            <span>프록시 URL</span>
            <input
              value={settings.proxy}
              onChange={(e) => onChange({ ...settings, proxy: e.target.value })}
              placeholder="http://127.0.0.1:8888 (비우면 미사용)"
              spellCheck={false}
            />
          </label>

          {onClaudePathChange && (
            <>
              <div className="settings-section">AI</div>
              <label className="settings-field">
                <span>claude 실행파일 경로</span>
                <input
                  value={claudePath}
                  onChange={(e) => onClaudePathChange(e.target.value)}
                  placeholder="비우면 자동 탐지 (예: C:\Users\me\.local\bin\claude.exe)"
                  spellCheck={false}
                />
              </label>
              <div className="hint">
                AI가 claude를 못 찾을 때 직접 지정하세요. macOS/Linux: <code>~/.local/bin/claude</code>,
                Windows: <code>%USERPROFILE%\.local\bin\claude.exe</code>
              </div>
            </>
          )}

          <div className="settings-section">
            쿠키 ({cookies.length})
            <span className="settings-actions">
              <button className="btn small" onClick={refresh}>
                새로고침
              </button>
              <button
                className="btn small danger"
                onClick={() => {
                  clearCookies().then(refresh);
                }}
                disabled={cookies.length === 0}
              >
                모두 삭제
              </button>
            </span>
          </div>
          {cookieErr && <div className="error-box">{cookieErr}</div>}
          {cookies.length === 0 && !cookieErr && <div className="hint">저장된 쿠키가 없습니다.</div>}
          {cookies.map((c, i) => (
            <div className="cookie-row" key={i}>
              <span className="cookie-name">{c.name}</span>
              <span className="cookie-domain">{c.domain}</span>
              <span className="cookie-value" title={c.value}>
                {c.value}
              </span>
            </div>
          ))}

          <div className="settings-section">정보</div>
          <div className="hint">SwaggerMan {version && `v${version}`} — 이 앱이 도움이 됐다면</div>
          <button
            className="btn donate"
            onClick={() => {
              openUrl(DONATION_URL).catch((e) =>
                setDonationErr(
                  `브라우저 열기 실패(${e instanceof Error ? e.message : e}) — 직접 열기: ${DONATION_URL}`,
                ),
              );
            }}
          >
            <CoffeeIcon size={15} /> 개발자에게 커피 사주기
          </button>
          {donationErr && <div className="error-box">{donationErr}</div>}
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
