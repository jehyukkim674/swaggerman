import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ParsedOperation } from "../core/types";
import { validateRequestInputs } from "../core/schema-validate";
import {
  buildRequestUrl,
  defaultInputs,
  type BodyMode,
  type FormField,
  type RequestInputs,
  type RequestParam,
} from "../core/request-builder";
import { relativeTime, type HistoryItem } from "../core/history";
import { DYNAMIC_VARS, type Assertion, type AssertionResult, type ExtractRule } from "../core/variables";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon, TrashIcon } from "./icons";
import { TestPanel } from "./TestPanel";
import { VarInput } from "./VarInput";
import { JsonEditor } from "./JsonEditor";

interface Props {
  operation: ParsedOperation | null;
  inputs: RequestInputs | null;
  baseURL: string;
  globalHeaders: RequestParam[];
  vars: Record<string, string>;
  sending: boolean;
  onChange: (inputs: RequestInputs) => void;
  onSend: () => void;
  onCancel: () => void;
  samples: { name: string; body: string }[];
  onSaveSample: (name: string) => void;
  onDeleteSample: (name: string) => void;
  historyItem: HistoryItem | null;
  extractRules: ExtractRule[];
  assertions: Assertion[];
  assertResults: AssertionResult[];
  onExtractChange: (rules: ExtractRule[]) => void;
  onAssertChange: (asserts: Assertion[]) => void;
  highlightKeys?: string[];
  mentionKeys?: string[];
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
  vars,
  sending,
  onChange,
  onSend,
  onCancel,
  samples,
  onSaveSample,
  onDeleteSample,
  historyItem,
  extractRules,
  assertions,
  assertResults,
  onExtractChange,
  onAssertChange,
  highlightKeys = [],
  mentionKeys = [],
}: Props) {
  const [sampleName, setSampleName] = useState<string | null>(null);
  const [activeSample, setActiveSample] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const reqIssues = useMemo(
    () => (operation && inputs ? validateRequestInputs(operation, inputs) : []),
    [operation, inputs],
  );
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

  // 스펙 query 파라미터의 필수여부(이름→required) — 행에 필수/옵션 배지 표시용
  const queryMeta = new Map<string, boolean>();
  for (const p of operation.parameters) {
    if (p.location === "query") queryMeta.set(p.name, p.required);
  }

  // 자동완성 제안용 변수 이름(환경/체인 변수 + 동적 변수)
  const varNames = [...Object.keys(vars), ...DYNAMIC_VARS];

  const mode: BodyMode = inputs.bodyMode ?? (operation.requestBody ? "raw" : "none");
  const form = inputs.form ?? [];
  const showBody =
    !!operation.requestBody || ["POST", "PUT", "PATCH", "DELETE"].includes(operation.method);
  const setForm = (f: FormField[]) => onChange({ ...inputs, form: f });
  const pickFile = async (index: number) => {
    try {
      const path = await open({ multiple: false, title: "업로드할 파일 선택" });
      if (typeof path === "string") {
        setForm(form.map((x, j) => (j === index ? { ...x, filePath: path } : x)));
      }
    } catch {
      /* 취소 등 무시 */
    }
  };

  // 스펙 기본값으로 path/query 파라미터 초기화(삭제한 파라미터도 복원)
  const resetParams = () => {
    const fresh = defaultInputs(operation);
    onChange({ ...inputs, pathParams: fresh.pathParams, queryParams: fresh.queryParams });
    setConfirmReset(false);
  };

  return (
    <main className="request-pane">
      {historyItem && <HistoryBanner item={historyItem} />}
      <div className="request-header">
        <span className="method-badge" style={{ color: methodColor(operation.method) }}>
          {operation.method}
        </span>
        <span className="req-path">{operation.path}</span>
        <button
          className="btn small"
          title="path/query 파라미터를 스펙 기본값으로 초기화"
          onClick={() => setConfirmReset(true)}
        >
          ↺ 초기화
        </button>
        {sending ? (
          <button className="btn send cancel" onClick={onCancel} title="요청 취소">
            ✕ 취소
          </button>
        ) : (
          <button
            className="btn primary send"
            onClick={onSend}
            title="현재 요청을 전송합니다 (⌘/Ctrl+Enter)"
          >
            Send
          </button>
        )}
      </div>

      <div className="url-preview" title={buildRequestUrl(baseURL, operation, inputs, false, vars)}>
        {buildRequestUrl(baseURL, operation, inputs, false, vars)}
      </div>

      {confirmReset && (
        <div className="reset-warn">
          ⚠ 파라미터를 스펙 기본값으로 초기화합니다. 현재 입력값은 사라집니다.
          <button className="btn small danger" onClick={resetParams}>
            초기화
          </button>
          <button className="btn small" onClick={() => setConfirmReset(false)}>
            취소
          </button>
        </div>
      )}

      {reqIssues.length > 0 && (
        <div className="req-warn" title="스펙 기준 필수 항목 누락(전송은 가능)">
          ⚠ 필수 누락: {reqIssues.map((i) => i.path).join(", ")}
        </div>
      )}

      <div className="request-body-scroll">
        {operation.summary && <p className="op-desc">{operation.summary}</p>}

        {pathKeys.length > 0 && (
          <section className="section">
            <h4>Path Params</h4>
            {pathKeys.map((key) => (
              <div className={`kv-row${highlightKeys.includes(key) ? " kv-highlight" : ""}${mentionKeys.includes(key) ? " kv-mention" : ""}`} key={key}>
                <span className="kv-key fixed">{key}</span>
                <VarInput
                  className="kv-input"
                  value={inputs.pathParams[key]}
                  onChange={(v) => setPath(key, v)}
                  vars={varNames}
                  placeholder="값"
                />
              </div>
            ))}
          </section>
        )}

        <ParamSection
          title="Query Params"
          list={inputs.queryParams}
          meta={queryMeta}
          varNames={varNames}
          onToggle={(i, v) => setParamList("queryParams", i, { enabled: v })}
          onKey={(i, v) => setParamList("queryParams", i, { key: v })}
          onValue={(i, v) => setParamList("queryParams", i, { value: v })}
          onRemove={(i) => removeRow("queryParams", i)}
          onAdd={() => addRow("queryParams")}
          highlightKeys={highlightKeys}
          mentionKeys={mentionKeys}
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
          varNames={varNames}
          onToggle={(i, v) => setParamList("headers", i, { enabled: v })}
          onKey={(i, v) => setParamList("headers", i, { key: v })}
          onValue={(i, v) => setParamList("headers", i, { value: v })}
          onRemove={(i) => removeRow("headers", i)}
          onAdd={() => addRow("headers")}
          highlightKeys={highlightKeys}
          mentionKeys={mentionKeys}
        />

        {showBody && (
          <section className="section">
            <div className="body-head">
              <h4>Body</h4>
              <select
                className="body-mode"
                value={mode}
                onChange={(e) => onChange({ ...inputs, bodyMode: e.target.value as BodyMode })}
                title="Body 형식"
              >
                <option value="none">None</option>
                <option value="raw">JSON / Raw</option>
                <option value="urlencoded">form-urlencoded</option>
                <option value="multipart">multipart / 파일</option>
              </select>
              {mode === "raw" && (
                <span className="body-format-btns">
                  <button
                    className="btn small"
                    title="JSON 정렬(들여쓰기)"
                    onClick={() => {
                      try {
                        onChange({ ...inputs, body: JSON.stringify(JSON.parse(inputs.body), null, 2) });
                      } catch {
                        /* JSON 아니면 무시 */
                      }
                    }}
                  >
                    정렬
                  </button>
                  <button
                    className="btn small"
                    title="JSON 압축(한 줄)"
                    onClick={() => {
                      try {
                        onChange({ ...inputs, body: JSON.stringify(JSON.parse(inputs.body)) });
                      } catch {
                        /* JSON 아니면 무시 */
                      }
                    }}
                  >
                    압축
                  </button>
                </span>
              )}
            </div>

            {mode === "raw" && (
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
                    <button
                      className="btn small btn-icon"
                      onClick={() => setSampleName(null)}
                      title="취소"
                    >
                      <CloseCircleIcon size={14} />
                    </button>
                  </span>
                )}
              </div>
            )}
            {mode === "raw" && (
              <JsonEditor
                value={inputs.body}
                onChange={(v) => onChange({ ...inputs, body: v })}
                rows={12}
              />
            )}
            {(mode === "urlencoded" || mode === "multipart") && (
              <FormEditor
                form={form}
                multipart={mode === "multipart"}
                onChange={setForm}
                onPickFile={pickFile}
              />
            )}
          </section>
        )}

        <TestPanel
          extractRules={extractRules}
          assertions={assertions}
          results={assertResults}
          onExtractChange={onExtractChange}
          onAssertChange={onAssertChange}
        />
      </div>
    </main>
  );
}

interface ParamSectionProps {
  title: string;
  list: RequestParam[];
  meta?: Map<string, boolean>; // key -> required (스펙 파라미터일 때만)
  varNames?: string[]; // 값 입력 자동완성용 변수 이름
  onToggle: (index: number, value: boolean) => void;
  onKey: (index: number, value: string) => void;
  onValue: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  highlightKeys?: string[];
  mentionKeys?: string[];
}

function ParamSection({
  title,
  list,
  meta,
  varNames,
  onToggle,
  onKey,
  onValue,
  onRemove,
  onAdd,
  highlightKeys = [],
  mentionKeys = [],
}: ParamSectionProps) {
  return (
    <details className="section param-section" open>
      <summary>
        {title} <span className="muted">({list.length})</span>
      </summary>
      {list.map((param, index) => {
        const required = meta?.get(param.key);
        return (
          <div className={`kv-row${highlightKeys.includes(param.key) ? " kv-highlight" : ""}${mentionKeys.includes(param.key) ? " kv-mention" : ""}`} key={index}>
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
            {required === true && <span className="req-badge">필수</span>}
            {required === false && <span className="opt-badge">옵션</span>}
            <VarInput
              className="kv-input"
              value={param.value}
              onChange={(v) => onValue(index, v)}
              vars={varNames ?? []}
              placeholder="value"
            />
            <button className="icon-btn" onClick={() => onRemove(index)} title="삭제">
              <CloseCircleIcon size={15} />
            </button>
          </div>
        );
      })}
      <button className="add-row" onClick={onAdd}>
        + 추가
      </button>
    </details>
  );
}

interface FormEditorProps {
  form: FormField[];
  multipart: boolean;
  onChange: (form: FormField[]) => void;
  onPickFile: (index: number) => void;
}

function FormEditor({ form, multipart, onChange, onPickFile }: FormEditorProps) {
  const patch = (i: number, p: Partial<FormField>) =>
    onChange(form.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div className="form-editor">
      {form.map((field, i) => (
        <div className="form-row" key={i}>
          <input
            type="checkbox"
            checked={field.enabled}
            onChange={(e) => patch(i, { enabled: e.target.checked })}
          />
          <input
            className="kv-input"
            value={field.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            placeholder="이름"
            spellCheck={false}
          />
          {multipart && field.filePath ? (
            <span className="form-file" title={field.filePath}>
              📎 {field.filePath.split(/[\\/]/).pop()}
            </span>
          ) : (
            <input
              className="kv-input"
              value={field.value}
              onChange={(e) => patch(i, { value: e.target.value })}
              placeholder="값"
              spellCheck={false}
            />
          )}
          {multipart && (
            <button
              className="btn small"
              title="파일 선택(멀티파트 파일 파트)"
              onClick={() => onPickFile(i)}
            >
              파일
            </button>
          )}
          {multipart && field.filePath && (
            <button
              className="btn small"
              title="파일 해제(텍스트 값으로)"
              onClick={() => patch(i, { filePath: undefined })}
            >
              ✕파일
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => onChange(form.filter((_, j) => j !== i))}
            title="삭제"
          >
            <CloseCircleIcon size={15} />
          </button>
        </div>
      ))}
      <button
        className="add-row"
        onClick={() => onChange([...form, { name: "", value: "", enabled: true }])}
      >
        + 필드
      </button>
    </div>
  );
}
