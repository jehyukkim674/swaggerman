import { useState } from "react";
import type { ParsedOperation } from "../core/types";
import { buildRequestUrl, type RequestInputs, type RequestParam } from "../core/request-builder";
import { relativeTime, type HistoryItem } from "../core/history";
import { methodColor, statusColor } from "./method";
import { TrashIcon } from "./icons";

interface Props {
  operation: ParsedOperation | null;
  inputs: RequestInputs | null;
  baseURL: string;
  globalHeaders: RequestParam[];
  sending: boolean;
  onChange: (inputs: RequestInputs) => void;
  onSend: () => void;
  onCancel: () => void;
  samples: { name: string; body: string }[];
  onSaveSample: (name: string) => void;
  onDeleteSample: (name: string) => void;
  historyItem: HistoryItem | null;
}

export function HistoryBanner({ item }: { item: HistoryItem }) {
  return (
    <div className="history-banner">
      <span className="hb-tag">🕘 히스토리 보기</span>
      <span className="hb-meta">
        {item.method} {item.path} · {relativeTime(item.executedAt)}
      </span>
      <span className="hb-status" style={{ color: statusColor(item.status) }}>
        {item.status}
      </span>
    </div>
  );
}

export function RequestEditor({
  operation,
  inputs,
  baseURL,
  globalHeaders,
  sending,
  onChange,
  onSend,
  onCancel,
  samples,
  onSaveSample,
  onDeleteSample,
  historyItem,
}: Props) {
  const [sampleName, setSampleName] = useState<string | null>(null);
  const [activeSample, setActiveSample] = useState("");
  if (!operation || !inputs) {
    return (
      <main className="request-pane">
        <div className="hint center">사이드바에서 endpoint를 선택하세요.</div>
      </main>
    );
  }

  const setPath = (key: string, value: string) =>
    onChange({ ...inputs, pathParams: { ...inputs.pathParams, [key]: value } });

  const setParamList = (
    field: "queryParams" | "headers",
    index: number,
    patch: Partial<RequestParam>,
  ) => {
    const list = inputs[field].map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange({ ...inputs, [field]: list });
  };

  const addRow = (field: "queryParams" | "headers") =>
    onChange({ ...inputs, [field]: [...inputs[field], { key: "", value: "", enabled: true }] });

  const removeRow = (field: "queryParams" | "headers", index: number) =>
    onChange({ ...inputs, [field]: inputs[field].filter((_, i) => i !== index) });

  const pathKeys = Object.keys(inputs.pathParams);

  return (
    <main className="request-pane">
      {historyItem && <HistoryBanner item={historyItem} />}
      <div className="request-header">
        <span className="method-badge" style={{ color: methodColor(operation.method) }}>
          {operation.method}
        </span>
        <span className="req-path">{operation.path}</span>
        {sending ? (
          <button className="btn send cancel" onClick={onCancel} title="요청 취소">
            ✕ 취소
          </button>
        ) : (
          <button className="btn primary send" onClick={onSend}>
            Send
          </button>
        )}
      </div>

      <div className="url-preview" title={buildRequestUrl(baseURL, operation, inputs)}>
        {buildRequestUrl(baseURL, operation, inputs)}
      </div>

      <div className="request-body-scroll">
        {operation.summary && <p className="op-desc">{operation.summary}</p>}

        {pathKeys.length > 0 && (
          <section className="section">
            <h4>Path Params</h4>
            {pathKeys.map((key) => (
              <div className="kv-row" key={key}>
                <span className="kv-key fixed">{key}</span>
                <input
                  className="kv-input"
                  value={inputs.pathParams[key]}
                  onChange={(e) => setPath(key, e.target.value)}
                  placeholder="값"
                  spellCheck={false}
                />
              </div>
            ))}
          </section>
        )}

        <ParamSection
          title="Query Params"
          list={inputs.queryParams}
          onToggle={(i, v) => setParamList("queryParams", i, { enabled: v })}
          onKey={(i, v) => setParamList("queryParams", i, { key: v })}
          onValue={(i, v) => setParamList("queryParams", i, { value: v })}
          onRemove={(i) => removeRow("queryParams", i)}
          onAdd={() => addRow("queryParams")}
        />

        {globalHeaders.filter((h) => h.enabled && h.key).length > 0 && (
          <section className="section">
            <h4>
              전역 헤더 <span className="section-note">모든 요청 적용 · “전역 헤더”에서 수정</span>
            </h4>
            {globalHeaders
              .filter((h) => h.enabled && h.key)
              .map((h, i) => (
                <div className="kv-row global-row" key={i}>
                  <span className="global-badge" title="전역 헤더(읽기 전용)">
                    🌐
                  </span>
                  <span className="kv-key fixed">{h.key}</span>
                  <span className="global-val">{h.value}</span>
                </div>
              ))}
          </section>
        )}

        <ParamSection
          title="Headers"
          list={inputs.headers}
          onToggle={(i, v) => setParamList("headers", i, { enabled: v })}
          onKey={(i, v) => setParamList("headers", i, { key: v })}
          onValue={(i, v) => setParamList("headers", i, { value: v })}
          onRemove={(i) => removeRow("headers", i)}
          onAdd={() => addRow("headers")}
        />

        {operation.requestBody && (
          <section className="section">
            <div className="body-head">
              <h4>Body ({operation.requestBody.contentType})</h4>
              <div className="sample-bar">
                {samples.length > 0 && (
                  <>
                    <select
                      className="sample-select"
                      value={activeSample}
                      onChange={(e) => {
                        setActiveSample(e.target.value);
                        const s = samples.find((x) => x.name === e.target.value);
                        if (s) onChange({ ...inputs, body: s.body });
                      }}
                      title="저장한 body 샘플 불러오기"
                    >
                      <option value="">샘플 선택…</option>
                      {samples.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {activeSample && (
                      <>
                        <button
                          className="btn small"
                          title="현재 body로 이 샘플 덮어쓰기(수정)"
                          onClick={() => onSaveSample(activeSample)}
                        >
                          수정
                        </button>
                        <button
                          className="btn small icon danger"
                          title="이 샘플 삭제"
                          onClick={() => {
                            onDeleteSample(activeSample);
                            setActiveSample("");
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </>
                )}
                {sampleName === null ? (
                  <button
                    className="btn small"
                    title="현재 body를 샘플로 저장"
                    onClick={() => setSampleName(`샘플 ${samples.length + 1}`)}
                  >
                    ＋샘플
                  </button>
                ) : (
                  <span className="sample-add">
                    <input
                      className="sample-name-input"
                      autoFocus
                      value={sampleName}
                      onChange={(e) => setSampleName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (sampleName.trim()) onSaveSample(sampleName.trim());
                          setSampleName(null);
                        }
                        if (e.key === "Escape") setSampleName(null);
                      }}
                      placeholder="샘플 이름"
                      spellCheck={false}
                    />
                    <button
                      className="btn small"
                      onClick={() => {
                        if (sampleName.trim()) onSaveSample(sampleName.trim());
                        setSampleName(null);
                      }}
                    >
                      ✓
                    </button>
                    <button className="btn small" onClick={() => setSampleName(null)}>
                      ✕
                    </button>
                  </span>
                )}
              </div>
            </div>
            <textarea
              className="body-input"
              value={inputs.body}
              onChange={(e) => onChange({ ...inputs, body: e.target.value })}
              spellCheck={false}
              rows={10}
            />
          </section>
        )}
      </div>
    </main>
  );
}

interface ParamSectionProps {
  title: string;
  list: RequestParam[];
  onToggle: (index: number, value: boolean) => void;
  onKey: (index: number, value: string) => void;
  onValue: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

function ParamSection({
  title,
  list,
  onToggle,
  onKey,
  onValue,
  onRemove,
  onAdd,
}: ParamSectionProps) {
  return (
    <section className="section">
      <h4>{title}</h4>
      {list.map((param, index) => (
        <div className="kv-row" key={index}>
          <input
            type="checkbox"
            checked={param.enabled}
            onChange={(e) => onToggle(index, e.target.checked)}
          />
          <input
            className="kv-input"
            value={param.key}
            onChange={(e) => onKey(index, e.target.value)}
            placeholder="key"
            spellCheck={false}
          />
          <input
            className="kv-input"
            value={param.value}
            onChange={(e) => onValue(index, e.target.value)}
            placeholder="value"
            spellCheck={false}
          />
          <button className="icon-btn" onClick={() => onRemove(index)} title="삭제">
            ✕
          </button>
        </div>
      ))}
      <button className="add-row" onClick={onAdd}>
        + 추가
      </button>
    </section>
  );
}
