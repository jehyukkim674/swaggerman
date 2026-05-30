import { useState } from "react";
import type { ParsedSchema } from "../core/types";
import { schemaTypeLabel } from "../core/schema-format";

interface Props {
  schema: ParsedSchema;
  depth?: number;
}

export function SchemaTree({ schema, depth = 0 }: Props) {
  const [open, setOpen] = useState(depth < 2);

  if (schema.type === "object" && schema.properties && Object.keys(schema.properties).length > 0) {
    const required = new Set(schema.required ?? []);
    const entries = Object.entries(schema.properties).sort((a, b) => {
      const ra = required.has(a[0]);
      const rb = required.has(b[0]);
      if (ra !== rb) return ra ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });
    return (
      <div className="schema-node">
        <button className="schema-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"} object
        </button>
        {open && (
          <div className="schema-children">
            {entries.map(([key, prop]) => (
              <div className="schema-prop" key={key}>
                <span className="schema-key">{key}</span>
                <span className="schema-type">{schemaTypeLabel(prop)}</span>
                {required.has(key) && <span className="req-badge">required</span>}
                {prop.type === "object" && prop.properties && depth < 4 && (
                  <SchemaTree schema={prop} depth={depth + 1} />
                )}
                {prop.type === "array" &&
                  prop.items &&
                  prop.items.type === "object" &&
                  depth < 4 && <SchemaTree schema={prop.items} depth={depth + 1} />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (schema.type === "array" && schema.items && schema.items.type === "object") {
    return (
      <div className="schema-node">
        <span className="schema-type">array[object]</span>
        <SchemaTree schema={schema.items} depth={depth + 1} />
      </div>
    );
  }

  return <span className="schema-type">{schemaTypeLabel(schema)}</span>;
}
