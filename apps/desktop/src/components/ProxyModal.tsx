// src/components/ProxyModal.tsx
// 프록시 녹화 모달: 타깃으로 포워딩하며 녹화, 녹화 항목을 Mock으로 보낸다.
import { useEffect, useRef, useState } from "react";
import { startProxy, stopProxy, getRecordings, type ProxyRecord } from "../core/proxy-client";
import { methodColor } from "./method";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  defaultTarget: string;
  /** 녹화를 Mock으로 변환 요청(App이 매칭·저장). 성공 메시지/실패는 App이 결정 → 결과 문자열 반환 */
  onSendToMock: (record: ProxyRecord) => string;
  onClose: () => void;
}

const DEFAULT_PORT = 9091;

export function ProxyModal({ defaultTarget, onSendToMock, onClose }: Props) {
  useEscToClose(onClose);
  const [target, setTarget] = useState(defaultTarget);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [running, setRunning] = useState(false);
  const [boundPort, setBoundPort] = useState(0);
  const [records, setRecords] = useState<ProxyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    // 즉시 1회 조회 후 1초 간격 폴링
    getRecordings().then(setRecords).catch(() => {});
    pollRef.current = setInterval(() => {
      getRecordings().then(setRecords).catch(() => {});
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running]);

  const toggle = async () => {
    setError(null);
    if (running) {
      await stopProxy();
      setRunning(false);
      return;
    }
    try {
      const bp = await startProxy(target, port);
      setBoundPort(bp);
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("PORT_IN_USE") ? `포트 ${port}이(가) 사용 중입니다 (예: ${port + 1})` : `시작 실패: ${msg}`);
    }
  };

  const baseUrl = `http://localhost:${boundPort}`;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal proxy-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>프록시 녹화{running && <span className="proxy-running"> 실행 중 — {baseUrl}</span>}</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body proxy-body">
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
          {error && <div className="error-box">{error}</div>}
          {sendMsg && <div className="proxy-sendmsg">{sendMsg}</div>}
          <div className="proxy-records">
            {records.length === 0 && <div className="hint">{running ? `${baseUrl} 로 호출하면 여기에 녹화됩니다` : "시작 후 프록시로 호출하세요"}</div>}
            {[...records].reverse().map((r, i) => (
              <div className="proxy-rec-row" key={`${r.atMs}-${i}`}>
                <span className="method" style={{ color: methodColor(r.method) }}>{r.method}</span>
                <span className="proxy-rec-path">{r.path}</span>
                <span className="proxy-rec-status" style={{ color: r.error ? "#f85149" : "#3fb950" }}>
                  {r.error ? "ERR" : r.status}
                </span>
                <button className="btn small" onClick={() => setSendMsg(onSendToMock(r))}>Mock으로</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
