import { useEffect, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
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

  async function loadSpec() {
    setLoading(true);
    setLoadError(null);
    try {
      const parsed = await loadSpecFromUrl(specUrl);
      setSpec(parsed);
      setBaseURL(deriveBaseURL(specUrl, parsed.servers));
      setActiveSpecUrl(specUrl);
      saveJSON("swaggerman.lastSpecUrl", specUrl);
      setFavorites(loadJSON(`swaggerman.fav.${specUrl}`, [] as string[]));
      setHistory(loadJSON(`swaggerman.hist.${specUrl}`, [] as HistoryItem[]));
      setAuthValues(loadJSON(`swaggerman.auth.${specUrl}`, {} as Record<string, string>));
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

  function selectOperation(op: ParsedOperation) {
    setSelected(op);
    setInputs(defaultInputs(op));
    setResponse(null);
    setSendError(null);
  }

  async function sendWith(op: ParsedOperation, ins: RequestInputs) {
    setSending(true);
    setSendError(null);
    try {
      const securityHeaders = computeSecurityHeaders(spec?.securitySchemes ?? [], authValues);
      const request = buildRequest(baseURL, op, ins, securityHeaders);
      setLastRequest(request);
      const res = await executeRequest(request);
      setResponse(res);
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
      setSendError(e instanceof Error ? e.message : String(e));
      setResponse(null);
    } finally {
      setSending(false);
    }
  }

  function send() {
    if (selected && inputs) sendWith(selected, inputs);
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
        <input
          className="spec-url"
          value={specUrl}
          onChange={(e) => setSpecUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadSpec()}
          placeholder="OpenAPI spec URL (예: /v3/api-docs, /swagger-ui/index.html)"
          spellCheck={false}
        />
        <button className="btn primary" onClick={loadSpec} disabled={loading}>
          {loading ? "로딩…" : "Load"}
        </button>
      </header>

      {spec && (
        <div className="config-bar">
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
          <AuthorizePanel schemes={spec.securitySchemes} values={authValues} onChange={setAuthValues} />
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
          />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={38} minSize={20} className="pane">
          <ResponseView response={response} request={lastRequest} sending={sending} error={sendError} />
        </Panel>
      </PanelGroup>
    </div>
  );
}
