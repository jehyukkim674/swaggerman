// src/components/ProxyModal.tsx
// 프록시/브라우저 녹화 모달.
// - 프록시: 타깃으로 포워딩하며 녹화 (OAuth 리다이렉트가 있는 서비스는 우회됨)
// - 브라우저: 전용 Chrome을 CDP로 띄워 XHR/Fetch를 녹화 (Okta 등 로그인 흐름 대응)
import { useEffect, useRef, useState } from "react";
import { startProxy, stopProxy, getRecordings, type ProxyRecord } from "../core/proxy-client";
import { startCapture, stopCapture, getCaptureRecordings, getCaptureStatus } from "../core/capture-client";
import { methodColor } from "./method";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import type { NetworkSettings } from "../core/types";

interface Props {
  defaultTarget: string;
  /** 앱 네트워크 설정(SSL 검증 끄기 등) — 포워딩에 적용 */
  net?: Partial<NetworkSettings>;
  /** 녹화를 Mock으로 변환 요청(App이 매칭·저장). 성공 메시지/실패는 App이 결정 → 결과 문자열 반환 */
  onSendToMock: (record: ProxyRecord) => string;
  /** 녹화 전체를 Mock으로 일괄 저장(App이 매칭·저장, IndexedDB). 결과 메시지 반환(async) */
  onSendAllToMock: (records: ProxyRecord[], title: string) => Promise<string>;
  onClose: () => void;
}

const DEFAULT_PORT = 9091;
type Mode = "proxy" | "browser";

export function ProxyModal({ defaultTarget, net, onSendToMock, onSendAllToMock, onClose }: Props) {
  useEscToClose(onClose);
  const [mode, setMode] = useState<Mode>("proxy");
  // 프록시 모드 상태
  const [target, setTarget] = useState(defaultTarget);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [running, setRunning] = useState(false);
  const [boundPort, setBoundPort] = useState(0);
  const [records, setRecords] = useState<ProxyRecord[]>([]);
  // 브라우저 모드 상태
  const [startUrl, setStartUrl] = useState(defaultTarget);
  const [capRunning, setCapRunning] = useState(false);
  const [capStarting, setCapStarting] = useState(false);
  const [capRecords, setCapRecords] = useState<ProxyRecord[]>([]);
  // 공용
  const [error, setError] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 마운트 시 캡처 상태 재동기화(모달을 닫았다 열어도 Chrome이 떠있을 수 있음) + 보존된 녹화 로드
  useEffect(() => {
    getCaptureStatus().then((s) => setCapRunning(!!s)).catch(() => {});
    getCaptureRecordings().then((r) => setCapRecords(r ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    getRecordings().then(setRecords).catch(() => {});
    pollRef.current = setInterval(() => {
      getRecordings().then(setRecords).catch(() => {});
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running]);

  useEffect(() => {
    if (!capRunning) {
      if (capPollRef.current) clearInterval(capPollRef.current);
      return;
    }
    getCaptureRecordings().then((r) => setCapRecords(r ?? [])).catch(() => {});
    capPollRef.current = setInterval(() => {
      getCaptureRecordings().then((r) => setCapRecords(r ?? [])).catch(() => {});
      // 사용자가 Chrome 창을 직접 닫으면 백엔드가 자동 중지 → UI 반영
      getCaptureStatus().then((s) => { if (!s) setCapRunning(false); }).catch(() => {});
    }, 1000);
    return () => {
      if (capPollRef.current) clearInterval(capPollRef.current);
    };
  }, [capRunning]);

  const toggle = async () => {
    setError(null);
    if (running) {
      await stopProxy();
      setRunning(false);
      return;
    }
    try {
      const bp = await startProxy(target, port, net);
      setBoundPort(bp);
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("PORT_IN_USE") ? `포트 ${port}이(가) 사용 중입니다 (예: ${port + 1})` : `시작 실패: ${msg}`);
    }
  };

  const toggleCapture = async () => {
    setError(null);
    if (capRunning) {
      await stopCapture().catch(() => {});
      setCapRunning(false);
      return;
    }
    // 시작은 CDP 포트가 열릴 때까지 최대 10초 대기 → 그동안 버튼을 잠가 더블클릭으로
    // 두 번째 capture_start가 첫 Chrome을 부팅 중에 죽이는 것을 막는다.
    setCapStarting(true);
    try {
      await startCapture(startUrl);
      setCapRunning(true);
    } catch (e) {
      setError(`시작 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCapStarting(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSendMsg(null);
    setBulkOpen(false);
  };

  const baseUrl = `http://localhost:${boundPort}`;
  const isBrowser = mode === "browser";
  // 숨김 키. index 대신 atMs+method+path로 안정화(목록이 최신순 reverse라 index는 불안정).
  // 완전 동일한 녹화(같은 ms·메서드·경로)는 함께 숨겨져도 무방.
  const recKey = (r: ProxyRecord) => `${r.atMs}-${r.method}-${r.path}`;
  const allRecords = isBrowser ? capRecords : records;
  const shownRecords = allRecords.filter((r) => !hiddenIds.has(recKey(r)));
  const activeRunning = isBrowser ? capRunning : running;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal proxy-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {isBrowser ? "브라우저 녹화" : "프록시 녹화"}
            {activeRunning && <span className="proxy-running"> 실행 중{!isBrowser && ` — ${baseUrl}`}</span>}
          </h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body proxy-body">
          <div className="proxy-mode-tabs">
            <button className={!isBrowser ? "btn small primary" : "btn small"} onClick={() => switchMode("proxy")}>프록시</button>
            <button className={isBrowser ? "btn small primary" : "btn small"} onClick={() => switchMode("browser")}>브라우저</button>
          </div>
          {!isBrowser && (
            <div className="proxy-control">
              <label className="config-field">
                <span className="config-label">타깃 Base URL</span>
                <input value={target} disabled={running} onChange={(e) => setTarget(e.target.value)}
                  placeholder="https://api.example.com" spellCheck={false} style={{ minWidth: 280 }} />
              </label>
              <label className="config-field">
                <span className="config-label">포트</span>
                <input type="number" value={port} disabled={running}
                  onChange={(e) => setPort(Number(e.target.value) || DEFAULT_PORT)} style={{ width: 80 }} />
              </label>
              <button className={running ? "btn small" : "btn small primary"} disabled={!target.trim()} onClick={toggle}>
                {running ? "중지" : "시작"}
              </button>
              {running && (
                <button className="btn small" title="Base URL 복사" onClick={() => navigator.clipboard.writeText(baseUrl).catch(() => {})}>
                  <CopyIcon size={13} /> {baseUrl}
                </button>
              )}
            </div>
          )}
          {isBrowser && (
            <div className="proxy-control">
              <label className="config-field">
                <span className="config-label">시작 URL</span>
                <input value={startUrl} disabled={capRunning || capStarting} onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://service.example.com" spellCheck={false} style={{ minWidth: 280 }} />
              </label>
              <button className={capRunning ? "btn small" : "btn small primary"} disabled={!startUrl.trim() || capStarting} onClick={toggleCapture}>
                {capStarting ? "시작 중…" : capRunning ? "중지" : "시작"}
              </button>
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          {sendMsg && <div className="proxy-sendmsg">{sendMsg}</div>}
          <div className="proxy-records">
            {shownRecords.length === 0 && (
              <div className="hint">
                {isBrowser
                  ? capRunning
                    ? "Chrome 창에서 서비스를 사용하면 API 호출(XHR/fetch)이 여기에 녹화됩니다"
                    : "시작하면 전용 Chrome이 열립니다 (로그인 세션은 다음 녹화에 재사용)"
                  : running
                    ? `${baseUrl} 로 호출하면 여기에 녹화됩니다`
                    : "시작 후 프록시로 호출하세요"}
              </div>
            )}
            {shownRecords.length > 0 && (
              <div className="proxy-bulk-row">
                {!bulkOpen ? (
                  <button className="btn small" onClick={() => { setBulkOpen(true); setBulkTitle(""); }}>
                    전체 Mock으로
                  </button>
                ) : (
                  <>
                    <input className="proxy-bulk-title" value={bulkTitle} autoFocus
                      placeholder="프리셋 제목" onChange={(e) => setBulkTitle(e.target.value)} />
                    <button className="btn small primary" disabled={!bulkTitle.trim()}
                      onClick={() => {
                        const recs = shownRecords;
                        const t = bulkTitle.trim();
                        setBulkOpen(false);
                        setSendMsg("저장 중…");
                        onSendAllToMock(recs, t).then(setSendMsg).catch(() => setSendMsg("프리셋 저장 실패"));
                      }}>
                      저장
                    </button>
                    <button className="btn small" onClick={() => setBulkOpen(false)}>취소</button>
                  </>
                )}
              </div>
            )}
            {[...shownRecords].reverse().map((r, i) => (
              <div className="proxy-rec-row" key={`${r.atMs}-${i}`}>
                <span className="method" style={{ color: methodColor(r.method) }}>{r.method}</span>
                <span className="proxy-rec-path">{r.path}</span>
                <span className="proxy-rec-status" style={{ color: r.error ? "#f85149" : "#3fb950" }}>
                  {r.error ? "ERR" : r.status}
                </span>
                <button className="btn small" onClick={() => setSendMsg(onSendToMock(r))}>Mock으로</button>
                <button className="btn small" title="이 녹화 삭제"
                  onClick={() => setHiddenIds((prev) => { const next = new Set(prev); next.add(recKey(r)); return next; })}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
