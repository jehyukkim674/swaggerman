import type { ParsedOperation } from "../core/types";
import { buildRequestUrl, type RequestInputs, type RequestParam } from "../core/request-builder";
import { methodColor } from "./method";

interface Props {
  operation: ParsedOperation | null;
  inputs: RequestInputs | null;
  baseURL: string;
  sending: boolean;
  onChange: (inputs: RequestInputs) => void;
  onSend: () => void;
}

export function RequestEditor({ operation, inputs, baseURL, sending, onChange, onSend }: Props) {
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
      <div className="request-header">
        <span className="method-badge" style={{ color: methodColor(operation.method) }}>
          {operation.method}
        </span>
        <span className="req-path">{operation.path}</span>
        <button className="btn primary send" onClick={onSend} disabled={sending}>
          {sending ? "전송 중…" : "Send"}
        </button>
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
            <h4>Body ({operation.requestBody.contentType})</h4>
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
