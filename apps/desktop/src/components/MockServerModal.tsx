// Mock 서버 관리 UI 모달
// - 서버 시작/중지, operation별 활성화, 소스별 데이터 생성, 요청 로그 폴링

import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedSpec } from "../core/types";
import type { HistoryItem } from "../core/history";
import type { MockOperationConfig, MockServerConfig, MockPreset } from "../core/mock-config";
import {
  buildMockRoutes,
  loadMockConfig,
  saveMockConfig,
  applyPresetToConfig,
} from "../core/mock-config";
import { loadPresets, savePreset, deletePreset, renamePreset } from "../core/mock-presets-store";
import { generateDataset } from "../core/mock-generator";
import {
  getMockStatus,
  startMockServer,
  stopMockServer,
} from "../core/mock-client";
import type { MockLogEntry } from "../core/mock-client";
import { buildMockDatasetPrompt, parseMockDatasetResponse, MOCK_DATASET_SYSTEM } from "../core/ai/mock-prompt";
import { getProvider } from "../core/ai/provider";
import { COMPLETE_MODEL } from "../core/ai/models";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon, CopyIcon, TrashIcon, EditIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import { Select } from "./Select";

// ────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────

interface Props {
  spec: ParsedSpec;
  specUrl: string;
  history: HistoryItem[];
  onClose: () => void;
}

// ────────────────────────────────────────────────
// 소스 옵션
// ────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: "schema", label: "자동 생성 (스키마)" },
  { value: "ai", label: "AI 생성 (Claude)" },
  { value: "history", label: "히스토리에서 가져오기" },
  { value: "manual", label: "직접 편집" },
];

// ────────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────────

function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ────────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────────

export function MockServerModal({ spec, specUrl, history, onClose }: Props) {
  useEscToClose(onClose);

  // 서버 상태
  const [running, setRunning] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [logs, setLogs] = useState<MockLogEntry[]>([]);

  // 설정 (localStorage)
  const [config, setConfig] = useState<MockServerConfig>(() =>
    loadMockConfig(specUrl, spec)
  );

  // 프리셋
  const [presets, setPresets] = useState<MockPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetTitle, setPresetTitle] = useState("");

  // 프리셋은 IndexedDB(대용량)에 저장 → 마운트 시 비동기 로드
  useEffect(() => {
    let alive = true;
    loadPresets(specUrl).then((p) => { if (alive) setPresets(p); }).catch(() => {});
    return () => { alive = false; };
  }, [specUrl]);

  // 선택된 operation
  const [selectedOpId, setSelectedOpId] = useState<string | null>(
    spec.operations[0]?.id ?? null
  );

  // 우측 패널: AI 생성 중 여부, 에러
  const [aiGenerating, setAiGenerating] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  // 데이터셋 텍스트 편집 (직접 편집 모드)
  const [datasetText, setDatasetText] = useState<string>("");
  const [datasetParseError, setDatasetParseError] = useState<string | null>(null);

  // 폴링 타이머 ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─ 설정 변경 시 자동 저장 (디바운스 400ms) ─
  useEffect(() => {
    const timer = setTimeout(() => saveMockConfig(specUrl, config), 400);
    return () => clearTimeout(timer);
  }, [config, specUrl]);

  // ─ 선택 operation 변경 시 데이터셋 텍스트 갱신 ─
  useEffect(() => {
    if (!selectedOpId) return;
    const opCfg = config.operations.find((o) => o.opId === selectedOpId);
    if (!opCfg) return;

    const ds = opCfg.dataset ?? opCfg.body;
    if (ds !== undefined) {
      setDatasetText(JSON.stringify(ds, null, 2));
    } else {
      // 아직 생성 안 됨 → 자동 생성해서 보여줌
      const op = spec.operations.find((o) => o.id === selectedOpId);
      if (op) {
        const generated = generateDataset(op, opCfg.itemCount, opCfg.seed);
        setDatasetText(JSON.stringify(generated, null, 2));
      }
    }
    setDatasetParseError(null);
    setPanelError(null);
  }, [selectedOpId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ 폴링 시작/중지 ─
  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPoll = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await getMockStatus();
        setLogs(status.logs);
        if (!status.running) {
          setRunning(false);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // 폴링 에러는 무시
      }
    }, 1000);
  }, []);

  useEffect(() => {
    return () => stopPoll();
  }, [stopPoll]);

  // ─ 마운트 시 실제 서버 상태로 동기화 (모달 재오픈 시 불일치 방지) ─
  useEffect(() => {
    let cancelled = false;
    getMockStatus()
      .then((status) => {
        if (cancelled) return;
        setRunning(status.running);
        setLogs(status.logs);
        if (status.running) {
          // 포트도 실제 값으로 맞춤
          setConfig((prev) => ({ ...prev, port: status.port }));
          startPoll();
        }
      })
      .catch(() => {
        // 상태 조회 실패는 무시 (Tauri 미초기화 등)
      });
    return () => {
      cancelled = true;
    };
  }, [startPoll]);  

  // ─ 서버 시작 ─
  async function handleStart() {
    setServerError(null);
    const portNum = config.port;
    const routes = buildMockRoutes(spec, config);
    try {
      const boundPort = await startMockServer(portNum, routes);
      // OS가 실제로 바인딩한 포트가 다를 경우 config.port를 갱신
      if (typeof boundPort === "number" && boundPort !== portNum) {
        setConfig((prev) => ({ ...prev, port: boundPort }));
      }
      setRunning(true);
      setLogs([]);
      startPoll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("PORT_IN_USE")) {
        setServerError(`포트 ${portNum}이(가) 사용 중입니다. 다른 포트를 입력하세요`);
      } else {
        setServerError(`서버 시작 실패: ${msg}`);
      }
    }
  }

  // ─ 서버 중지 ─
  async function handleStop() {
    try {
      await stopMockServer();
    } catch {
      // 무시
    }
    setRunning(false);
    stopPoll();
  }

  // ─ operation 활성화/비활성화 토글 ─
  function toggleEnabled(opId: string) {
    setConfig((prev) => ({
      ...prev,
      operations: prev.operations.map((o) =>
        o.opId === opId ? { ...o, enabled: !o.enabled } : o
      ),
    }));
  }

  // ─ 현재 선택된 opCfg ─
  const selectedOpCfg = config.operations.find((o) => o.opId === selectedOpId) ?? null;
  const selectedOp = spec.operations.find((o) => o.id === selectedOpId) ?? null;

  // ─ opCfg 필드 업데이트 헬퍼 ─
  function updateOpCfg(opId: string, patch: Partial<MockOperationConfig>) {
    setConfig((prev) => ({
      ...prev,
      operations: prev.operations.map((o) =>
        o.opId === opId ? { ...o, ...patch } : o
      ),
    }));
  }

  // ─ 소스 변경 → 자동으로 데이터 생성 ─
  async function handleSourceChange(opId: string, source: string) {
    if (!selectedOp) return;
    setPanelError(null);

    if (source === "schema") {
      const op = spec.operations.find((o) => o.id === opId);
      if (!op) return;
      const opCfg = config.operations.find((o) => o.opId === opId);
      const newSeed = (opCfg?.seed ?? 1) + 1;
      const generated = generateDataset(op, opCfg?.itemCount ?? 20, newSeed);
      updateOpCfg(opId, { source: "schema", dataset: generated, seed: newSeed });
      setDatasetText(JSON.stringify(generated, null, 2));
    } else if (source === "ai") {
      await generateAiDataset(opId);
    } else if (source === "history") {
      loadFromHistory(opId);
    } else if (source === "manual") {
      updateOpCfg(opId, { source: "manual" });
    }
  }

  // ─ AI 생성 ─
  async function generateAiDataset(opId: string) {
    const op = spec.operations.find((o) => o.id === opId);
    const opCfg = config.operations.find((o) => o.opId === opId);
    if (!op || !opCfg) return;

    setAiGenerating(true);
    setPanelError(null);
    try {
      const provider = getProvider("claude");
      const prompt = buildMockDatasetPrompt(op, opCfg.itemCount);
      const raw = await provider.complete({
        prompt,
        system: MOCK_DATASET_SYSTEM,
        model: COMPLETE_MODEL,
        schema: JSON.stringify({ type: "array", items: { type: "object" } }),
      });
      const dataset = parseMockDatasetResponse(raw);
      updateOpCfg(opId, { source: "ai", dataset });
      setDatasetText(JSON.stringify(dataset, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // AI 실패 시 스키마 기반 자동 생성으로 폴백
      const opCfgFallback = config.operations.find((o) => o.opId === opId);
      const fallbackDataset = generateDataset(
        op,
        opCfgFallback?.itemCount ?? 20,
        opCfgFallback?.seed ?? 1
      );
      updateOpCfg(opId, { source: "schema", dataset: fallbackDataset });
      setDatasetText(JSON.stringify(fallbackDataset, null, 2));
      setPanelError(`AI 생성 실패: ${msg} — 자동 생성 데이터로 대체했습니다`);
    } finally {
      setAiGenerating(false);
    }
  }

  // ─ 히스토리에서 가져오기 ─
  function loadFromHistory(opId: string) {
    const op = spec.operations.find((o) => o.id === opId);
    if (!op) return;

    // 해당 opId의 성공(2xx) 히스토리 최신 1건
    const matched = history
      .filter((h) => h.opId === opId && h.status >= 200 && h.status < 300)
      .sort((a, b) => b.executedAt - a.executedAt)[0];

    if (!matched) {
      setPanelError("이 API의 성공 히스토리가 없습니다");
      return;
    }

    try {
      const parsed = JSON.parse(matched.responseBody);
      if (Array.isArray(parsed)) {
        updateOpCfg(opId, { source: "history", dataset: parsed });
        setDatasetText(JSON.stringify(parsed, null, 2));
      } else {
        updateOpCfg(opId, { source: "history", body: parsed });
        setDatasetText(JSON.stringify(parsed, null, 2));
      }
    } catch {
      setPanelError("히스토리 응답 본문을 JSON으로 파싱할 수 없습니다");
    }
  }

  // ─ 재생성 버튼 ─
  async function handleRegenerate() {
    if (!selectedOpId || !selectedOpCfg) return;
    const src = selectedOpCfg.source;
    if (src === "schema") {
      const op = spec.operations.find((o) => o.id === selectedOpId);
      if (!op) return;
      const newSeed = selectedOpCfg.seed + 1;
      const generated = generateDataset(op, selectedOpCfg.itemCount, newSeed);
      updateOpCfg(selectedOpId, { dataset: generated, seed: newSeed });
      setDatasetText(JSON.stringify(generated, null, 2));
    } else if (src === "ai") {
      await generateAiDataset(selectedOpId);
    } else if (src === "history") {
      loadFromHistory(selectedOpId);
    }
  }

  // ─ 데이터셋 텍스트 변경 (직접 편집) ─
  function handleDatasetTextChange(text: string) {
    setDatasetText(text);
    if (!selectedOpId) return;
    try {
      const parsed = JSON.parse(text);
      setDatasetParseError(null);
      if (Array.isArray(parsed)) {
        updateOpCfg(selectedOpId, { source: "manual", dataset: parsed });
      } else {
        updateOpCfg(selectedOpId, { source: "manual", body: parsed });
      }
    } catch {
      setDatasetParseError("JSON 파싱 오류 — 저장되지 않습니다");
    }
  }

  // ─ Base URL 복사 ─
  function copyBaseUrl() {
    navigator.clipboard.writeText(`http://localhost:${config.port}`).catch(() => {});
  }

  // ─ 프리셋 핸들러 (IndexedDB — 모두 async) ─
  const refreshPresets = async () => setPresets(await loadPresets(specUrl));

  const handleSavePreset = async () => {
    const t = presetTitle.trim();
    if (!t) return;
    const saved = await savePreset(specUrl, t, config.operations, config.requests);
    setSaveOpen(false);
    setPresetTitle("");
    if (!saved) {
      setPanelError("프리셋 저장 실패 — 저장소에 기록하지 못했습니다");
      return;
    }
    await refreshPresets();
  };

  const handleSelectPreset = (id: string) => {
    if (!id) return;
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    if (!window.confirm(`현재 Mock 설정을 '${preset.title}' 프리셋으로 덮어씁니다. 계속할까요?`)) return;
    setConfig((prev) => applyPresetToConfig(prev, preset));
    setSelectedPresetId(id);
  };

  const handleDeletePreset = async () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    if (!window.confirm(`프리셋 '${preset.title}'을(를) 삭제할까요?`)) return;
    await deletePreset(specUrl, preset.id);
    setSelectedPresetId("");
    await refreshPresets();
  };

  const handleRenamePreset = async () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    const next = window.prompt("새 제목", preset.title);
    if (next && next.trim()) {
      await renamePreset(specUrl, preset.id, next.trim());
      await refreshPresets();
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal mock-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="modal-head">
          <div className="mock-head-left">
            <h3>Mock 서버</h3>
            {running && (
              <span className="mock-running-badge">
                실행 중 — http://localhost:{config.port}
                <button
                  className="icon-btn"
                  onClick={copyBaseUrl}
                  title="Base URL 복사"
                >
                  <CopyIcon size={13} />
                </button>
              </span>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        {/* ── 제어 바 ── */}
        <div className="mock-control-bar">
          <label className="mock-port-label">포트</label>
          <input
            type="number"
            className="mock-port-input"
            value={config.port}
            min={1024}
            max={65535}
            disabled={running}
            onChange={(e) => setConfig((prev) => ({ ...prev, port: Number(e.target.value) }))}
          />
          {!running ? (
            <button className="btn primary small" onClick={handleStart}>
              서버 시작
            </button>
          ) : (
            <button className="btn danger small" onClick={handleStop}>
              서버 중지
            </button>
          )}
          {serverError && (
            <span className="mock-error-inline">{serverError}</span>
          )}
        </div>

        {/* ── 프리셋 바 ── */}
        <div className="mock-preset-bar">
          {presets.length > 0 ? (
            <select className="mock-preset-select" value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}>
              <option value="">프리셋 불러오기…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · {new Date(p.savedAt).toLocaleString()}
                </option>
              ))}
            </select>
          ) : (
            <span className="hint">저장된 프리셋 없음</span>
          )}
          {selectedPresetId && (
            <>
              <button className="icon-btn" title="이름변경" onClick={handleRenamePreset}><EditIcon size={14} /></button>
              <button className="icon-btn" title="삭제" onClick={handleDeletePreset}><TrashIcon size={14} /></button>
            </>
          )}
          {!saveOpen ? (
            <button className="btn small" onClick={() => { setSaveOpen(true); setPresetTitle(""); }}>현재 설정 저장</button>
          ) : (
            <>
              <input className="mock-preset-title" value={presetTitle} autoFocus
                placeholder="프리셋 제목" onChange={(e) => setPresetTitle(e.target.value)} />
              <button className="btn small primary" disabled={!presetTitle.trim()} onClick={handleSavePreset}>저장</button>
              <button className="btn small" onClick={() => setSaveOpen(false)}>취소</button>
            </>
          )}
        </div>

        {/* ── 바디 (좌/우 2단) ── */}
        <div className="mock-body">
          {/* 좌측: operation 목록 */}
          <div className="mock-op-list">
            {spec.operations.map((op) => {
              const opCfg = config.operations.find((o) => o.opId === op.id);
              const isSelected = selectedOpId === op.id;
              return (
                <div
                  key={op.id}
                  className={`mock-op-row${isSelected ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedOpId(op.id);
                    setPanelError(null);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={opCfg?.enabled ?? true}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleEnabled(op.id)}
                    title="mock 포함"
                  />
                  <span
                    className="mock-method"
                    style={{ color: methodColor(op.method) }}
                  >
                    {op.method}
                  </span>
                  <span className="mock-path">{op.path}</span>
                </div>
              );
            })}
          </div>

          {/* 우측: 선택된 operation 설정 */}
          <div className="mock-detail">
            {selectedOp && selectedOpCfg ? (
              <>
                <div className="mock-detail-header">
                  <span
                    className="mock-method"
                    style={{ color: methodColor(selectedOp.method) }}
                  >
                    {selectedOp.method}
                  </span>
                  <span className="mock-path">{selectedOp.path}</span>
                </div>

                {/* 소스 선택 */}
                <div className="mock-field-row">
                  <label className="mock-field-label">데이터 소스</label>
                  <Select
                    options={SOURCE_OPTIONS}
                    value={selectedOpCfg.source}
                    onChange={(v) => handleSourceChange(selectedOpCfg.opId, v)}
                    disabled={aiGenerating}
                  />
                </div>

                {/* 개수 / 지연 / 상태코드 */}
                <div className="mock-field-row">
                  <label className="mock-field-label">개수</label>
                  <input
                    type="number"
                    className="mock-num-input"
                    min={1}
                    max={200}
                    value={selectedOpCfg.itemCount}
                    onChange={(e) =>
                      updateOpCfg(selectedOpCfg.opId, {
                        itemCount: Number(e.target.value),
                      })
                    }
                  />
                  <label className="mock-field-label">지연(ms)</label>
                  <input
                    type="number"
                    className="mock-num-input"
                    min={0}
                    max={30000}
                    value={selectedOpCfg.delayMs}
                    onChange={(e) =>
                      updateOpCfg(selectedOpCfg.opId, {
                        delayMs: Number(e.target.value),
                      })
                    }
                  />
                  <label className="mock-field-label">상태코드</label>
                  <input
                    type="number"
                    className="mock-num-input"
                    min={100}
                    max={599}
                    value={selectedOpCfg.status}
                    onChange={(e) =>
                      updateOpCfg(selectedOpCfg.opId, {
                        status: Number(e.target.value),
                      })
                    }
                  />
                </div>

                {/* 재생성 버튼 */}
                {selectedOpCfg.source !== "manual" && (
                  <div className="mock-regen-row">
                    <button
                      className="btn small"
                      onClick={handleRegenerate}
                      disabled={aiGenerating}
                      title="데이터 재생성"
                    >
                      {aiGenerating ? "AI 생성 중…" : "↻ 재생성"}
                    </button>
                  </div>
                )}

                {/* 패널 에러 */}
                {panelError && (
                  <div className="mock-error-block">{panelError}</div>
                )}

                {/* 데이터셋 미리보기 / 직접 편집 */}
                <div className="mock-dataset-label">데이터셋 미리보기</div>
                <textarea
                  className="mock-dataset-textarea"
                  value={datasetText}
                  spellCheck={false}
                  onChange={(e) => handleDatasetTextChange(e.target.value)}
                />
                {datasetParseError && (
                  <div className="mock-error-block">{datasetParseError}</div>
                )}
              </>
            ) : (
              <div className="mock-no-selection">
                왼쪽에서 operation을 선택하세요
              </div>
            )}
          </div>
        </div>

        {/* ── 로그 (실행 중) ── */}
        {(running || logs.length > 0) && (
          <div className="mock-log-section">
            <div className="mock-log-header">요청 로그</div>
            {logs.length === 0 ? (
              <div className="mock-log-empty">
                아직 요청이 없습니다 — http://localhost:{config.port} 로 호출해보세요
              </div>
            ) : (
              <div className="mock-log-list">
                {logs.map((log, i) => (
                  <div key={`${log.atMs}-${i}`} className="mock-log-row">
                    <span
                      className="mock-method mock-log-method"
                      style={{ color: methodColor(log.method) }}
                    >
                      {log.method}
                    </span>
                    <span className="mock-log-path">{log.path}</span>
                    <span
                      className="mock-log-status"
                      style={{ color: statusColor(log.status) }}
                    >
                      {log.status}
                    </span>
                    <span className="mock-log-time muted">
                      {formatTime(log.atMs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
