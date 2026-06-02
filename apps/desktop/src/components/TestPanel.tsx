import type {
  Assertion,
  AssertionKind,
  AssertionOp,
  AssertionResult,
  ExtractRule,
} from "../core/variables";
import { CloseCircleIcon } from "./icons";
import { Select } from "./Select";

interface Props {
  extractRules: ExtractRule[];
  assertions: Assertion[];
  results: AssertionResult[];
  onExtractChange: (rules: ExtractRule[]) => void;
  onAssertChange: (asserts: Assertion[]) => void;
}

/** 응답 → 변수 추출(체이닝) + 어서션(응답 검증) 편집 패널. */
export function TestPanel({
  extractRules,
  assertions,
  results,
  onExtractChange,
  onAssertChange,
}: Props) {
  return (
    <details className="section test-panel">
      <summary>
        테스트 &amp; 체이닝
        {assertions.length > 0 && results.length > 0 && (
          <span
            className={results.every((r) => r.ok) ? "test-badge pass" : "test-badge fail"}
          >
            {results.filter((r) => r.ok).length}/{results.length}
          </span>
        )}
      </summary>

      <div className="test-block">
        <div className="test-block-head">
          응답 → 변수 추출 <span className="section-note">{"{{이름}}"} 으로 다음 요청에 사용</span>
        </div>
        {extractRules.map((rule, i) => (
          <div className="kv-row" key={i}>
            <input
              className="kv-input"
              value={rule.varName}
              onChange={(e) =>
                onExtractChange(
                  extractRules.map((r, j) => (j === i ? { ...r, varName: e.target.value } : r)),
                )
              }
              placeholder="변수 이름 (예: token)"
              spellCheck={false}
            />
            <input
              className="kv-input"
              value={rule.path}
              onChange={(e) =>
                onExtractChange(
                  extractRules.map((r, j) => (j === i ? { ...r, path: e.target.value } : r)),
                )
              }
              placeholder="JSONPath (예: data.access_token)"
              spellCheck={false}
            />
            <button
              className="icon-btn"
              onClick={() => onExtractChange(extractRules.filter((_, j) => j !== i))}
              title="삭제"
            >
              <CloseCircleIcon size={15} />
            </button>
          </div>
        ))}
        <button
          className="add-row"
          onClick={() => onExtractChange([...extractRules, { varName: "", path: "" }])}
        >
          + 추출 규칙
        </button>
      </div>

      <div className="test-block">
        <div className="test-block-head">
          어서션 <span className="section-note">전송 후 응답을 검증</span>
        </div>
        {assertions.map((a, i) => {
          const result = results[i];
          const patch = (p: Partial<Assertion>) =>
            onAssertChange(assertions.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div className="assert-row" key={i}>
              <Select
                className="assert-kind"
                value={a.kind}
                onChange={(v) => patch({ kind: v as AssertionKind })}
                options={[
                  { value: "status", label: "status" },
                  { value: "jsonpath", label: "jsonpath" },
                ]}
              />
              {a.kind === "jsonpath" && (
                <input
                  className="kv-input"
                  value={a.path ?? ""}
                  onChange={(e) => patch({ path: e.target.value })}
                  placeholder="JSONPath"
                  spellCheck={false}
                />
              )}
              <Select
                className="assert-op"
                value={a.op}
                onChange={(v) => patch({ op: v as AssertionOp })}
                options={[
                  { value: "equals", label: "=" },
                  { value: "contains", label: "포함" },
                  { value: "exists", label: "존재" },
                ]}
              />
              {a.op !== "exists" && (
                <input
                  className="kv-input"
                  value={a.expected ?? ""}
                  onChange={(e) => patch({ expected: e.target.value })}
                  placeholder="기대값"
                  spellCheck={false}
                />
              )}
              {result && (
                <span className={result.ok ? "assert-ok" : "assert-bad"} title={result.detail}>
                  {result.ok ? "✓" : "✕"}
                </span>
              )}
              <button
                className="icon-btn"
                onClick={() => onAssertChange(assertions.filter((_, j) => j !== i))}
                title="삭제"
              >
                <CloseCircleIcon size={15} />
              </button>
            </div>
          );
        })}
        <button
          className="add-row"
          onClick={() => onAssertChange([...assertions, { kind: "status", op: "equals", expected: "200" }])}
        >
          + 어서션
        </button>
      </div>
    </details>
  );
}
