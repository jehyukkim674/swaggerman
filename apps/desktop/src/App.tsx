import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "./App.css";
import { loadSpec as loadSpecFromUrl } from "./core/spec-loader";
import { executeRequest } from "./core/http-client";
import { buildRequest, defaultInputs, deriveBaseURL, type RequestInputs } from "./core/request-builder";
import { computeSecurityHeaders } from "./core/security";
import { loadJSON, saveJSON } from "./core/storage";
import { newId, type HistoryItem } from "./core/history";
import type { HTTPRequest, HTTPResponse, ParsedOperation, ParsedSpec } from "./core/types";
import { Sidebar } from "./components/Sidebar";
import { RequestEditor } from "./components/RequestEditor";
import { ResponseView } from "./components/ResponseView";
import { AuthorizePanel } from "./components/AuthorizePanel";

const DEFAULT_SPEC_URL = "http://localhost:8000/v3/api-docs";

interface Project {
  url: string;
  title: string;
}

export default function App() {
  const [specUrl, setSpecUrl] = useState(() =>
    loadJSON("swaggerman.lastSpecUrl", DEFAULT_SPEC_URL),
  );
  const [activeSpecUrl, setActiveSpecUrl] = useState("");
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [baseURL, setBaseURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ParsedOperation | null>(null);
  const [inputs, setInputs] = useState<RequestInputs | null>(null);

  const [response, setResponse] = useState<HTTPResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<HTTPRequest | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [responseTab, setResponseTab] = useState<"docs" | "response">("docs");

  // 환경(여러 baseURL) — 프로젝트별 저장
  const [envs, setEnvs] = useState<{ name: string; baseURL: string }[]>([]);
  const [newEnvName, setNewEnvName] = useState<string | null>(null);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.envs.${activeSpecUrl}`, envs);
  }, [envs, activeSpecUrl]);

  function confirmAddEnv() {
    const name = (newEnvName ?? "").trim();
    if (name) {
      setEnvs((prev) => [...prev.filter((e) => e.name !== name), { name, baseURL }]);
    }
    setNewEnvName(null);
  }

  // 프로젝트(spec URL) 목록 — 전역 저장
  const [projects, setProjects] = useState<Project[]>(() =>
    loadJSON("swaggerman.projects", [] as Project[]),
  );
  useEffect(() => {
    saveJSON("swaggerman.projects", projects);
  }, [projects]);

  // 전역 줌 (Cmd/Ctrl +/-/0)
  const [zoom, setZoom] = useState<number>(() => loadJSON("swaggerman.zoom", 1));
  useEffect(() => {
    saveJSON("swaggerman.zoom", zoom);
    getCurrentWebview()
      .setZoom(zoom)
      .catch(() => {});
  }, [zoom]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 요청 취소(소프트): 진행 중 요청 id가 바뀌면 결과를 무시한다.
  const sendIdRef = useRef(0);

  // 영속화: 스펙별 키로 저장
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.fav.${activeSpecUrl}`, favorites);
  }, [favorites, activeSpecUrl]);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.hist.${activeSpecUrl}`, history);
  }, [history, activeSpecUrl]);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.auth.${activeSpecUrl}`, authValues);
  }, [authValues, activeSpecUrl]);

  async function loadSpec(targetUrl: string = specUrl) {
    setSpecUrl(targetUrl);
    setLoading(true);
    setLoadError(null);
    try {
      const parsed = await loadSpecFromUrl(targetUrl);
      setSpec(parsed);
      setBaseURL(deriveBaseURL(targetUrl, parsed.servers));
      setActiveSpecUrl(targetUrl);
      saveJSON("swaggerman.lastSpecUrl", targetUrl);
      // 프로젝트 목록에 upsert(최근 것을 맨 앞으로)
      setProjects((prev) => [
        { url: targetUrl, title: parsed.info.title || targetUrl },
        ...prev.filter((p) => p.url !== targetUrl),
      ]);
      setFavorites(loadJSON(`swaggerman.fav.${targetUrl}`, [] as string[]));
      setHistory(loadJSON(`swaggerman.hist.${targetUrl}`, [] as HistoryItem[]));
      setAuthValues(loadJSON(`swaggerman.auth.${targetUrl}`, {} as Record<string, string>));
      setEnvs(loadJSON(`swaggerman.envs.${targetUrl}`, [] as { name: string; baseURL: string }[]));
      setSelected(null);
      setInputs(null);
      setResponse(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setSpec(null);
    } finally {
      setLoading(false);
    }
  }

  function removeProject(url: string) {
    setProjects((prev) => prev.filter((p) => p.url !== url));
    localStorage.removeItem(`swaggerman.fav.${url}`);
    localStorage.removeItem(`swaggerman.hist.${url}`);
    localStorage.removeItem(`swaggerman.auth.${url}`);
  }

  function selectOperation(op: ParsedOperation) {
    setSelected(op);
    setInputs(defaultInputs(op));
    setResponse(null);
    setSendError(null);
    setResponseTab("docs");
  }

  async function sendWith(op: ParsedOperation, ins: RequestInputs) {
    const myId = ++sendIdRef.current;
    setSending(true);
    setSendError(null);
    try {
      const securityHeaders = computeSecurityHeaders(spec?.securitySchemes ?? [], authValues);
      const request = buildRequest(baseURL, op, ins, securityHeaders);
      setLastRequest(request);
      const res = await executeRequest(request);
      if (sendIdRef.current !== myId) return; // 취소됨
      setResponse(res);
      setResponseTab("response");
      const item: HistoryItem = {
        id: newId(),
        opId: op.id,
        method: op.method,
        path: op.path,
        url: request.url,
        status: res.statusCode,
        durationMs: res.durationMs,
        size: res.size,
        executedAt: Date.now(),
        inputs: ins,
        responseHeaders: res.headers,
        responseBody: res.body,
      };
      setHistory((prev) => [item, ...prev].slice(0, 200));
    } catch (e) {
      if (sendIdRef.current !== myId) return; // 취소됨
      setSendError(e instanceof Error ? e.message : String(e));
      setResponse(null);
    } finally {
      if (sendIdRef.current === myId) setSending(false);
    }
  }

  function send() {
    if (selected && inputs) sendWith(selected, inputs);
  }

  function cancelSend() {
    sendIdRef.current += 1;
    setSending(false);
  }

  function toggleFavorite(opId: string) {
    setFavorites((prev) =>
      prev.includes(opId) ? prev.filter((x) => x !== opId) : [...prev, opId],
    );
  }

  function selectHistory(item: HistoryItem) {
    const op = spec?.operations.find((o) => o.id === item.opId);
    if (op) {
      setSelected(op);
      setInputs(item.inputs);
    }
    setResponse({
      statusCode: item.status,
      headers: item.responseHeaders,
      body: item.responseBody,
      durationMs: item.durationMs,
      size: item.size,
    });
    setSendError(null);
    setResponseTab("response");
  }

  function replayHistory(item: HistoryItem) {
    const op = spec?.operations.find((o) => o.id === item.opId);
    if (!op) return;
    setSelected(op);
    setInputs(item.inputs);
    sendWith(op, item.inputs);
  }

  const title = useMemo(() => spec?.info.title ?? "Swagger Man", [spec]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{title}</span>
        {projects.length > 0 && (
          <select
            className="project-select"
            value={activeSpecUrl}
            onChange={(e) => loadSpec(e.target.value)}
            title="저장된 프로젝트 전환"
          >
            {!activeSpecUrl && <option value="">프로젝트 선택…</option>}
            {projects.map((p) => (
              <option key={p.url} value={p.url}>
                {p.title}
              </option>
            ))}
          </select>
        )}
        <input
          className="spec-url"
          value={specUrl}
          onChange={(e) => setSpecUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadSpec()}
          placeholder="OpenAPI spec URL (예: /v3/api-docs, /swagger-ui/index.html)"
          spellCheck={false}
        />
        <button className="btn primary" onClick={() => loadSpec()} disabled={loading}>
          {loading ? "로딩…" : "Load"}
        </button>
        {activeSpecUrl && projects.some((p) => p.url === activeSpecUrl) && (
          <button
            className="btn"
            title="이 프로젝트를 목록에서 삭제(히스토리/즐겨찾기 포함)"
            onClick={() => removeProject(activeSpecUrl)}
          >
            ✕
          </button>
        )}
      </header>

      {spec && (
        <div className="config-bar">
          <button
            className="btn small"
            title="명세 새로고침(다시 불러오기)"
            onClick={() => loadSpec(activeSpecUrl || specUrl)}
            disabled={loading}
          >
            ↻
          </button>
          <label className="config-field">
            <span className="config-label">Base URL</span>
            <input
              className="base-url"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.example.com"
              spellCheck={false}
            />
          </label>
          <div className="env-bar">
            <select
              className="env-select"
              value={envs.find((e) => e.baseURL === baseURL)?.name ?? ""}
              onChange={(e) => {
                const env = envs.find((x) => x.name === e.target.value);
                if (env) setBaseURL(env.baseURL);
              }}
              title="환경(Base URL) 전환"
            >
              <option value="">사용자 지정</option>
              {envs.map((env) => (
                <option key={env.name} value={env.name}>
                  {env.name}
                </option>
              ))}
            </select>
            {newEnvName === null ? (
              <button
                className="btn small"
                title="현재 Base URL을 환경으로 저장"
                onClick={() => setNewEnvName(`환경 ${envs.length + 1}`)}
              >
                ＋환경
              </button>
            ) : (
              <span className="env-add">
                <input
                  className="env-name-input"
                  autoFocus
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAddEnv();
                    if (e.key === "Escape") setNewEnvName(null);
                  }}
                  placeholder="환경 이름"
                  spellCheck={false}
                />
                <button className="btn small" onClick={confirmAddEnv} title="저장">
                  ✓
                </button>
                <button className="btn small" onClick={() => setNewEnvName(null)} title="취소">
                  ✕
                </button>
              </span>
            )}
          </div>
          <AuthorizePanel schemes={spec.securitySchemes} values={authValues} onChange={setAuthValues} />
          <div className="zoom-controls">
            <button
              className="btn small"
              onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
            >
              −
            </button>
            <span className="muted">{Math.round(zoom * 100)}%</span>
            <button
              className="btn small"
              onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
            >
              +
            </button>
          </div>
        </div>
      )}

      <PanelGroup direction="horizontal" className="panes" autoSaveId="swaggerman-panes">
        <Panel defaultSize={24} minSize={14} className="pane">
          <Sidebar
            spec={spec}
            loading={loading}
            error={loadError}
            selectedId={selected?.id ?? null}
            onSelect={selectOperation}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            history={history}
            onSelectHistory={selectHistory}
            onReplayHistory={replayHistory}
            onDeleteHistory={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
            onClearHistory={() => setHistory([])}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={38} minSize={20} className="pane">
          <RequestEditor
            operation={selected}
            inputs={inputs}
            baseURL={baseURL}
            sending={sending}
            onChange={setInputs}
            onSend={send}
            onCancel={cancelSend}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={38} minSize={20} className="pane">
          <ResponseView
            response={response}
            request={lastRequest}
            operation={selected}
            sending={sending}
            error={sendError}
            tab={responseTab}
            onTab={setResponseTab}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
