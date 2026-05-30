import { useMemo, useState } from "react";
import "./App.css";
import { parseSpecText } from "./core/openapi-parser";
import { fetchSpecText, executeRequest } from "./core/http-client";
import {
  buildRequest,
  defaultInputs,
  deriveBaseURL,
  type RequestInputs,
} from "./core/request-builder";
import type { HTTPResponse, ParsedOperation, ParsedSpec } from "./core/types";
import { Sidebar } from "./components/Sidebar";
import { RequestEditor } from "./components/RequestEditor";
import { ResponseView } from "./components/ResponseView";

export default function App() {
  const [specUrl, setSpecUrl] = useState("http://localhost:8000/v3/api-docs");
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [baseURL, setBaseURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ParsedOperation | null>(null);
  const [inputs, setInputs] = useState<RequestInputs | null>(null);

  const [response, setResponse] = useState<HTTPResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function loadSpec() {
    setLoading(true);
    setLoadError(null);
    try {
      const text = await fetchSpecText(specUrl);
      const parsed = parseSpecText(text);
      setSpec(parsed);
      setBaseURL(deriveBaseURL(specUrl, parsed.servers));
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

  async function send() {
    if (!selected || !inputs) return;
    setSending(true);
    setSendError(null);
    try {
      const request = buildRequest(baseURL, selected, inputs);
      const res = await executeRequest(request);
      setResponse(res);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
      setResponse(null);
    } finally {
      setSending(false);
    }
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
          placeholder="OpenAPI JSON spec URL (예: /v3/api-docs)"
          spellCheck={false}
        />
        <button className="btn primary" onClick={loadSpec} disabled={loading}>
          {loading ? "로딩…" : "Load"}
        </button>
        {spec && (
          <input
            className="base-url"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="Base URL"
            spellCheck={false}
          />
        )}
      </header>

      <div className="panes">
        <Sidebar
          spec={spec}
          loading={loading}
          error={loadError}
          selectedId={selected?.id ?? null}
          onSelect={selectOperation}
        />
        <RequestEditor
          operation={selected}
          inputs={inputs}
          sending={sending}
          onChange={setInputs}
          onSend={send}
        />
        <ResponseView response={response} sending={sending} error={sendError} />
      </div>
    </div>
  );
}
