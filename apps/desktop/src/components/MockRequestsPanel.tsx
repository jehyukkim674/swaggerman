// Mock 요청 엔트리(캡처/커스텀) 표시·편집 패널.
// 캡처를 "전체 Mock으로" 저장하면 각 요청이 엔트리로 들어오고, 여기서 보고/수정/추가/삭제한다.
import { useEffect, useState } from "react";
import type { MockRequestEntry, MockMatch } from "../core/mock-config";
import { methodColor } from "./method";
import { TrashIcon } from "./icons";

interface Props {
  requests: MockRequestEntry[];
  onChange: (next: MockRequestEntry[]) => void;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function MockRequestsPanel({ requests, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");

  // 펼친 엔트리가 바뀌면 응답 본문 텍스트를 초기화(편집 중 thrash 방지)
  useEffect(() => {
    if (!openId) return;
    const r = requests.find((x) => x.id === openId);
    setBodyDraft(r ? bodyToText(r.body) : "");
    // requests 참조는 의도적으로 의존성에서 제외 — openId 변경 시에만 초기화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const update = (id: string, patch: Partial<MockRequestEntry>) =>
    onChange(requests.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => {
    onChange(requests.filter((r) => r.id !== id));
    if (openId === id) setOpenId(null);
  };
  const add = () => {
    const e: MockRequestEntry = { id: crypto.randomUUID(), method: "GET", path: "/", status: 200, body: {}, delayMs: 0 };
    onChange([e, ...requests]);
    setOpenId(e.id);
  };

  const setBody = (id: string, text: string) => {
    setBodyDraft(text);
    // 비우면 빈 응답 — ""를 JSON 문자열로 서빙하지 않는다
    if (text.trim() === "") {
      update(id, { body: undefined });
      return;
    }
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    update(id, { body });
  };

  const matchEditor = (id: string, key: "query" | "headers", list: MockMatch[] | undefined) => {
    const rows = list ?? [];
    const setRows = (next: MockMatch[]) =>
      update(id, { [key]: next.length ? next : undefined } as Partial<MockRequestEntry>);
    return (
      <div className="mock-req-matches">
        {rows.map((m, i) => (
          <div key={i} className="mock-req-match-row">
            <input placeholder="이름" value={m.name}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input placeholder="값" value={m.value}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <button className="btn small" title="삭제" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="btn small" onClick={() => setRows([...rows, { name: "", value: "" }])}>
          + {key === "query" ? "쿼리" : "헤더"} 조건
        </button>
      </div>
    );
  };

  return (
    <div className="mock-requests-panel">
      <div className="mock-requests-head">
        <span className="mock-requests-title">요청 엔트리 (캡처·커스텀) · {requests.length}</span>
        <button className="btn small primary" onClick={add}>+ 요청 추가</button>
      </div>
      {requests.length === 0 ? (
        <div className="hint">캡처를 "전체 Mock으로" 저장하거나 "+ 요청 추가"로 만드세요.</div>
      ) : (
        <div className="mock-requests-list">
          {requests.map((r) => {
            const open = openId === r.id;
            const qStr = r.query?.length ? `?${r.query.map((q) => `${q.name}=${q.value}`).join("&")}` : "";
            return (
              <div key={r.id} className={`mock-req-item${open ? " open" : ""}`}>
                <div className="mock-req-row" onClick={() => setOpenId(open ? null : r.id)}>
                  <span className="mock-method" style={{ color: methodColor(r.method) }}>{r.method}</span>
                  <span className="mock-req-path" title={r.path + qStr}>{r.path}{qStr}</span>
                  <span className="mock-req-status">{r.status}</span>
                  <button className="icon-btn" title="요청 엔트리 삭제"
                    onClick={(e) => { e.stopPropagation(); remove(r.id); }}><TrashIcon size={13} /></button>
                </div>
                {open && (
                  <div className="mock-req-edit">
                    <div className="mock-req-fields">
                      <label>메서드
                        <select value={r.method} onChange={(e) => update(r.id, { method: e.target.value })}>
                          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      <label className="grow">경로
                        <input value={r.path} placeholder="/api/v1/..." spellCheck={false}
                          onChange={(e) => update(r.id, { path: e.target.value })} />
                      </label>
                      <label>상태
                        <input type="number" value={r.status} min={100} max={599} style={{ width: 72 }}
                          onChange={(e) => update(r.id, { status: Number(e.target.value) || 200 })} />
                      </label>
                      <label>지연(ms)
                        <input type="number" value={r.delayMs} min={0} max={30000} style={{ width: 84 }}
                          onChange={(e) => update(r.id, { delayMs: Number(e.target.value) || 0 })} />
                      </label>
                    </div>
                    <div className="mock-req-section"><span className="mock-req-label">쿼리 매칭(부분일치)</span>{matchEditor(r.id, "query", r.query)}</div>
                    <div className="mock-req-section"><span className="mock-req-label">헤더 매칭(부분일치)</span>{matchEditor(r.id, "headers", r.headers)}</div>
                    <div className="mock-req-section"><span className="mock-req-label">응답 본문(JSON)</span>
                      <textarea className="mock-req-body" value={bodyDraft} rows={8} spellCheck={false}
                        onChange={(e) => setBody(r.id, e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 응답 body를 텍스트로(객체는 보기 좋은 JSON, 문자열은 그대로). */
function bodyToText(body: unknown): string {
  if (body === undefined || body === null) return "";
  return typeof body === "string" ? body : JSON.stringify(body, null, 2);
}
