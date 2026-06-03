# API 성능 추이 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** 히스토리를 operation별로 집계해 응답시간 통계 + SVG 스파크라인 추이를 보여주고 느려지는 API를 감지한다.

**Architecture:** 순수 집계 모듈(perf-trend.ts) + SVG 스파크라인 컴포넌트 + 성능 모달. 외부 라이브러리 0.

**Spec:** `docs/superpowers/specs/2026-06-03-perf-trend-design.md`

작업 디렉터리: `apps/desktop`. 브랜치 main. 한국어 주석/커밋. 자체 완결적이라 한 묶음으로 구현 가능.

---

### Task 1: core/perf-trend.ts

**Files:** Create `src/core/perf-trend.ts`, `src/core/perf-trend.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// src/core/perf-trend.test.ts
import { describe, it, expect } from "vitest";
import { computePerfTrends, detectTrend, percentile } from "./perf-trend";
import type { HistoryItem } from "./history";

function h(opId: string, durationMs: number, executedAt: number, over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: `${opId}-${executedAt}`, opId, method: opId.split(" ")[0], path: opId.split(" ")[1] ?? "/",
    url: "x", status: 200, durationMs, size: 0, executedAt,
    inputs: {} as HistoryItem["inputs"], responseHeaders: {}, responseBody: "",
    ...over,
  };
}

describe("percentile", () => {
  it("정렬된 값에서 백분위", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("detectTrend", () => {
  it("증가 추세는 slower", () => {
    expect(detectTrend([10, 10, 100, 100])).toBe("slower");
  });
  it("감소 추세는 faster", () => {
    expect(detectTrend([100, 100, 10, 10])).toBe("faster");
  });
  it("평탄은 stable", () => {
    expect(detectTrend([50, 52, 48, 51])).toBe("stable");
  });
  it("4건 미만은 insufficient", () => {
    expect(detectTrend([10, 20, 30])).toBe("insufficient");
  });
});

describe("computePerfTrends", () => {
  const hist: HistoryItem[] = [
    h("GET /a", 100, 1), h("GET /a", 200, 2), h("GET /a", 300, 3),
    h("GET /b", 50, 1),
  ];
  it("opId별로 분리 집계한다", () => {
    const r = computePerfTrends(hist);
    const a = r.find((s) => s.opId === "GET /a")!;
    expect(a.count).toBe(3);
    expect(a.avgMs).toBe(200);
    expect(a.minMs).toBe(100);
    expect(a.maxMs).toBe(300);
    expect(a.series).toEqual([100, 200, 300]); // executedAt 순
  });
  it("평균 내림차순 정렬(느린 API 위로)", () => {
    const r = computePerfTrends(hist);
    expect(r[0].opId).toBe("GET /a"); // avg 200 > 50
  });
});
```

- [ ] **Step 2: 실패 확인** `npx vitest run src/core/perf-trend.test.ts` → FAIL

- [ ] **Step 3: 구현**

```ts
// src/core/perf-trend.ts
// 히스토리를 operation별로 집계해 응답시간 통계·추이를 만든다. 외부 라이브러리 없음.
import type { HistoryItem } from "./history";

export type PerfTrend = "slower" | "faster" | "stable" | "insufficient";

export interface PerfStat {
  opId: string;
  method: string;
  path: string;
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  series: number[];
  trend: PerfTrend;
}

/** 정렬 안 된 값 배열의 백분위(0~100). 빈 배열은 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

/** 시계열(오래된→최근)에서 추이 판정. 4건 미만은 insufficient. */
export function detectTrend(series: number[]): PerfTrend {
  if (series.length < 4) return "insufficient";
  const mid = Math.floor(series.length / 2);
  const older = series.slice(0, mid);
  const recent = series.slice(mid);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const olderAvg = avg(older);
  const recentAvg = avg(recent);
  if (olderAvg === 0) return "stable";
  const ratio = recentAvg / olderAvg;
  if (ratio > 1.3) return "slower";
  if (ratio < 0.77) return "faster";
  return "stable";
}

/** 히스토리 → operation별 성능 통계. 평균 내림차순 정렬(느린 API 위로). */
export function computePerfTrends(history: HistoryItem[]): PerfStat[] {
  const groups = new Map<string, HistoryItem[]>();
  for (const h of history) {
    if (!groups.has(h.opId)) groups.set(h.opId, []);
    groups.get(h.opId)!.push(h);
  }
  const stats: PerfStat[] = [];
  for (const [opId, items] of groups) {
    const sorted = [...items].sort((a, b) => a.executedAt - b.executedAt);
    const series = sorted.map((i) => i.durationMs);
    const sum = series.reduce((s, x) => s + x, 0);
    stats.push({
      opId,
      method: sorted[0].method,
      path: sorted[0].path,
      count: series.length,
      avgMs: Math.round(sum / series.length),
      minMs: Math.min(...series),
      maxMs: Math.max(...series),
      p50Ms: percentile(series, 50),
      p95Ms: percentile(series, 95),
      series,
      trend: detectTrend(series),
    });
  }
  return stats.sort((a, b) => b.avgMs - a.avgMs);
}
```

- [ ] **Step 4: 통과 확인** `npx vitest run src/core/perf-trend.test.ts` → PASS
- [ ] **Step 5: 커밋** `기능: API 성능 추이 코어 — operation별 응답시간 집계·백분위·추이 판정`

---

### Task 2: Sparkline 컴포넌트

**Files:** Create `src/components/Sparkline.tsx`, `src/components/Sparkline.test.tsx`

- [ ] **Step 1: 테스트**

```tsx
// src/components/Sparkline.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("값 배열로 polyline points를 만든다", () => {
    const { container } = render(<Sparkline values={[10, 20, 15, 30]} />);
    const poly = container.querySelector("polyline");
    expect(poly).toBeTruthy();
    // 4개 점 → "x,y x,y x,y x,y" (공백 3개)
    expect(poly!.getAttribute("points")!.trim().split(/\s+/).length).toBe(4);
  });
  it("빈 배열은 polyline 없음", () => {
    const { container } = render(<Sparkline values={[]} />);
    expect(container.querySelector("polyline")).toBeNull();
  });
  it("단일 값은 수평선(점 2개 또는 1개)", () => {
    const { container } = render(<Sparkline values={[42]} />);
    const poly = container.querySelector("polyline");
    expect(poly).toBeTruthy();
  });
  it("color prop을 stroke에 적용", () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="#f85149" />);
    expect(container.querySelector("polyline")!.getAttribute("stroke")).toBe("#f85149");
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**

```tsx
// src/components/Sparkline.tsx
// 숫자 배열을 SVG polyline 미니차트로. 외부 라이브러리 없음.
interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ values, width = 80, height = 22, color = "var(--muted)" }: Props) {
  if (values.length === 0) {
    return <svg className="sparkline" width={width} height={height} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const points = values
    .map((v, i) => {
      const x = n === 1 ? width / 2 : (i / (n - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // 단일 값은 수평선이 되도록 양 끝점 복제
  const finalPoints = n === 1 ? `1,${(height / 2).toFixed(1)} ${width - 1},${(height / 2).toFixed(1)}` : points;
  return (
    <svg className="sparkline" width={width} height={height} aria-hidden>
      <polyline points={finalPoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 4: 통과 확인** (단일값 테스트는 points 2개 — 위 코드가 만족)
- [ ] **Step 5: 커밋** `기능: SVG 스파크라인 미니차트 컴포넌트`

---

### Task 3: PerfModal + App 통합

**Files:** Create `src/components/PerfModal.tsx`, `src/components/PerfModal.test.tsx`. Modify `src/App.tsx`, `src/App.css`

- [ ] **Step 1: PerfModal 테스트**

```tsx
// src/components/PerfModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PerfModal } from "./PerfModal";
import type { HistoryItem } from "../core/history";

function h(opId: string, d: number, t: number): HistoryItem {
  return { id: `${opId}-${t}`, opId, method: opId.split(" ")[0], path: opId.split(" ")[1], url: "x",
    status: 200, durationMs: d, size: 0, executedAt: t, inputs: {} as HistoryItem["inputs"], responseHeaders: {}, responseBody: "" };
}
const hist = [h("GET /a", 10, 1), h("GET /a", 10, 2), h("GET /a", 100, 3), h("GET /a", 100, 4), h("GET /b", 30, 1)];

describe("PerfModal", () => {
  it("op별 행과 통계를 표시한다", () => {
    render(<PerfModal history={hist} onClose={vi.fn()} />);
    expect(screen.getByText("/a")).toBeTruthy();
    expect(screen.getByText("/b")).toBeTruthy();
  });
  it("느려지는 op에 경고 뱃지를 표시한다", () => {
    render(<PerfModal history={hist} onClose={vi.fn()} />);
    expect(screen.getByText(/느려지는 중/)).toBeTruthy(); // GET /a: 10,10→100,100
  });
  it("스파크라인을 렌더한다", () => {
    const { container } = render(<PerfModal history={hist} onClose={vi.fn()} />);
    expect(container.querySelectorAll(".sparkline").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: PerfModal 구현**

```tsx
// src/components/PerfModal.tsx
// API 성능 추이: 히스토리 기반 operation별 응답시간 통계·스파크라인·추이.
import { useMemo, useState } from "react";
import type { HistoryItem } from "../core/history";
import { computePerfTrends, type PerfStat, type PerfTrend } from "../core/perf-trend";
import { Sparkline } from "./Sparkline";
import { methodColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  history: HistoryItem[];
  onClose: () => void;
}

const TREND_META: Record<PerfTrend, { label: string; color: string }> = {
  slower: { label: "⚠️ 느려지는 중", color: "#f85149" },
  faster: { label: "✅ 빨라짐", color: "#3fb950" },
  stable: { label: "— 안정", color: "var(--muted)" },
  insufficient: { label: "—", color: "var(--muted)" },
};

type SortKey = "avgMs" | "p95Ms" | "count";

export function PerfModal({ history, onClose }: Props) {
  useEscToClose(onClose);
  const [sortKey, setSortKey] = useState<SortKey>("avgMs");
  const stats = useMemo(() => {
    const base = computePerfTrends(history);
    return [...base].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [history, sortKey]);

  const trendColor = (t: PerfTrend) => TREND_META[t].color;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal perf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>API 성능 추이</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body perf-body">
          {stats.length === 0 ? (
            <div className="hint center">기록이 없습니다. 요청을 보내면 응답시간이 집계됩니다.</div>
          ) : (
            <table className="perf-table">
              <thead>
                <tr>
                  <th>API</th>
                  <th className="perf-sortable" onClick={() => setSortKey("count")}>호출</th>
                  <th className="perf-sortable" onClick={() => setSortKey("avgMs")}>평균</th>
                  <th className="perf-sortable" onClick={() => setSortKey("p95Ms")}>p95</th>
                  <th>추이</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s: PerfStat) => (
                  <tr key={s.opId}>
                    <td className="perf-op">
                      <span className="method" style={{ color: methodColor(s.method) }}>{s.method}</span> {s.path}
                    </td>
                    <td>{s.count}</td>
                    <td>{s.avgMs}ms</td>
                    <td>{s.p95Ms}ms</td>
                    <td className="perf-trend-cell">
                      <Sparkline values={s.series} color={trendColor(s.trend)} />
                      <span style={{ color: TREND_META[s.trend].color }}>{TREND_META[s.trend].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: App.tsx 통합**

import: `import { PerfModal } from "./components/PerfModal";`
state: `const [perfOpen, setPerfOpen] = useState(false);` (proxyOpen 근처)
상단바 버튼("프록시" 근처): 
```tsx
        <button className="btn" title="API 성능 추이 — 히스토리 기반 응답시간 통계" onClick={() => setPerfOpen(true)} disabled={history.length === 0}>
          성능
        </button>
```
모달 렌더(proxyOpen 근처): `{perfOpen && <PerfModal history={history} onClose={() => setPerfOpen(false)} />}`

- [ ] **Step 5: App.css 추가**

```css
/* API 성능 추이 모달 */
.modal.perf-modal { width: 680px; max-width: 94vw; max-height: 82vh; }
.perf-body { overflow: auto; }
.perf-table { border-collapse: collapse; width: 100%; font-size: 12px; }
.perf-table th, .perf-table td { border-bottom: 1px solid var(--border); padding: 6px 8px; text-align: right; }
.perf-table th:first-child, .perf-table td.perf-op { text-align: left; }
.perf-table th { color: var(--muted); font-weight: 600; }
.perf-sortable { cursor: pointer; user-select: none; }
.perf-sortable:hover { color: var(--text); }
.perf-op { font-family: ui-monospace, monospace; white-space: nowrap; }
.perf-trend-cell { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
.sparkline { display: block; }
```

- [ ] **Step 6: 검증 + 커밋**

```
npx vitest run && npx tsc --noEmit && npx eslint src/App.tsx src/components/PerfModal.tsx && npm run build 2>&1 | tail -1
```
커밋: `기능: API 성능 추이 모달 + 상단바 성능 버튼`

---

## Self-Review
- 스펙 커버리지: 집계/백분위/추이(Task1) ✓ / 스파크라인 SVG(Task2) ✓ / 모달 표·정렬·뱃지(Task3) ✓ / 상단바 버튼(Task3) ✓ / 히스토리 0건 처리(Task3) ✓
- 타입: PerfStat/PerfTrend perf-trend.ts 정의, Sparkline/PerfModal/App 일치 ✓
- 플레이스홀더 없음 ✓
