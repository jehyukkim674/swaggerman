import type { ParsedOperation } from "../core/types";
import { methodColor, statusColor } from "./method";
import { SchemaTree, schemaTypeLabel } from "./SchemaTree";

export function DocsPane({ operation }: { operation: ParsedOperation }) {
  const desc = operation.description ?? operation.summary;
  return (
    <div className="docs-pane">
      <div className="docs-overview">
        <span className="method-badge" style={{ color: methodColor(operation.method) }}>
          {operation.method}
        </span>
        <span className="docs-path">{operation.path}</span>
      </div>
      {desc && <p className="docs-desc">{desc}</p>}

      {operation.parameters.length > 0 && (
        <section className="docs-section">
          <h4>Parameters</h4>
          {operation.parameters.map((p) => (
            <div className="docs-param" key={p.id}>
              <span className="param-name">{p.name}</span>
              <span className="param-loc">{p.location}</span>
              <span className="schema-type">{schemaTypeLabel(p.schema)}</span>
              {p.required && <span className="req-badge">required</span>}
            </div>
          ))}
        </section>
      )}

      {operation.requestBody && (
        <section className="docs-section">
          <h4>Request Body</h4>
          <div className="docs-content-type">{operation.requestBody.contentType}</div>
          {operation.requestBody.schema && <SchemaTree schema={operation.requestBody.schema} />}
        </section>
      )}

      {operation.responses.length > 0 && (
        <section className="docs-section">
          <h4>Responses</h4>
          {operation.responses.map((r) => (
            <div className="docs-response" key={r.statusCode}>
              <div className="docs-response-head">
                <span style={{ color: statusColor(parseInt(r.statusCode, 10) || 0) }}>
                  {r.statusCode}
                </span>
                {r.description && <span className="muted">{r.description}</span>}
              </div>
              {r.schema && (
                <div className="docs-response-schema">
                  <SchemaTree schema={r.schema} />
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {operation.parameters.length === 0 &&
        !operation.requestBody &&
        operation.responses.length === 0 &&
        !desc && <div className="hint">문서 정보 없음</div>}
    </div>
  );
}
