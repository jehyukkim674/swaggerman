// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, act, waitFor } from "@testing-library/react";
import type { ParsedSpec, ParsedOperation } from "../core/types";
import type { HistoryItem } from "../core/history";

// ────────────────────────────────────────────────
// Tauri API mock (invoke) — mock-client mock이 선행하지만,
// loadMockConfig → storage → invoke를 쓸 수 있으므로 전방 선언
// ────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ────────────────────────────────────────────────
// mock-client mock
// ────────────────────────────────────────────────

const mockStartMockServer = vi.fn();
const mockStopMockServer = vi.fn();
const mockGetMockStatus = vi.fn();

vi.mock("../core/mock-client", () => ({
  startMockServer: (...args: unknown[]) => mockStartMockServer(...args),
  stopMockServer: (...args: unknown[]) => mockStopMockServer(...args),
  getMockStatus: (...args: unknown[]) => mockGetMockStatus(...args),
}));

// ────────────────────────────────────────────────
// AI provider mock
// ────────────────────────────────────────────────

vi.mock("../core/ai/provider", () => ({
  getProvider: vi.fn(() => ({
    complete: vi.fn(async () => JSON.stringify([{ id: 1, name: "AI 생성 데이터" }])),
  })),
}));

// ────────────────────────────────────────────────
// mock-config mock (localStorage 의존 제거)
// ────────────────────────────────────────────────

vi.mock("../core/mock-config", async (importOriginal) => {
  const original = await importOriginal<typeof import("../core/mock-config")>();
  return {
    ...original,
    loadMockConfig: vi.fn((_specUrl: string, spec: ParsedSpec) =>
      original.defaultMockConfig(spec)
    ),
    saveMockConfig: vi.fn(),
  };
});

// ────────────────────────────────────────────────
// 테스트 픽스처
// ────────────────────────────────────────────────

function makeSpec(ops: Partial<ParsedOperation>[] = []): ParsedSpec {
  const operations: ParsedOperation[] = ops.map((o) => ({
    id: o.id ?? `${o.method ?? "GET"} ${o.path ?? "/items"}`,
    method: o.method ?? "GET",
    path: o.path ?? "/items",
    tags: o.tags ?? [],
    parameters: o.parameters ?? [],
    responses: o.responses ?? [
      {
        statusCode: "200",
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
            },
          },
        },
      },
    ],
    ...o,
  }));
  return {
    info: { title: "Test API", version: "1.0" },
    servers: ["https://api.example.com"],
    operations,
    securitySchemes: [],
    rawOperationCount: operations.length,
  };
}

// makeHistory kept for completeness (suppressed unused)
const _makeHistory = (overrides: Partial<HistoryItem> = {}): HistoryItem => ({
  id: "h1",
  opId: "GET /users",
  method: "GET",
  path: "/users",
  url: "https://api.example.com/users",
  status: 200,
  durationMs: 42,
  size: 100,
  executedAt: Date.now(),
  inputs: { pathParams: {}, queryParams: [], headers: [], body: "" },
  responseHeaders: {},
  responseBody: JSON.stringify([{ id: 1, name: "홍길동" }]),
  ...overrides,
});
void _makeHistory;

// ────────────────────────────────────────────────
// 임포트 (mock 후)
// ────────────────────────────────────────────────

import { MockServerModal } from "./MockServerModal";

// ────────────────────────────────────────────────
// 테스트 스위트
// ────────────────────────────────────────────────

describe("MockServerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본 성공 응답
    mockStartMockServer.mockResolvedValue(9090);
    mockStopMockServer.mockResolvedValue(undefined);
    mockGetMockStatus.mockResolvedValue({ running: true, port: 9090, logs: [] });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ── 테스트 1: operation 목록 + 서버 시작 버튼 렌더링 ──
  it("operation 목록과 서버 시작 버튼이 렌더된다", () => {
    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
      { id: "POST /users", method: "POST", path: "/users" },
    ]);
    const { container } = render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    // operation 목록 확인
    const rows = container.querySelectorAll(".mock-op-row");
    expect(rows.length).toBe(2);

    // 서버 시작 버튼
    const startBtn = screen.getByText("서버 시작");
    expect(startBtn).toBeTruthy();
  });

  // ── 테스트 2: 서버 시작 클릭 → startMockServer 호출 + "실행 중" 표시 ──
  it("서버 시작 버튼 클릭 시 startMockServer를 호출하고 실행 중 배지가 표시된다", async () => {
    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
    ]);

    const { container } = render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    const startBtn = screen.getByText("서버 시작");

    await act(async () => {
      fireEvent.click(startBtn);
    });

    // startMockServer 호출 확인
    expect(mockStartMockServer).toHaveBeenCalledWith(
      9090,
      expect.any(Array)
    );

    // "실행 중" 뱃지 표시
    const badge = container.querySelector(".mock-running-badge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain("실행 중");
  });

  // ── 테스트 3: operation 행 클릭 → 데이터셋 미리보기 표시 (자동 생성 데이터) ──
  it("operation 행 클릭 시 데이터셋 textarea가 자동 생성 데이터로 채워진다", async () => {
    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
      { id: "POST /items", method: "POST", path: "/items" },
    ]);

    const { container } = render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    // 두 번째 operation 행 클릭
    const rows = container.querySelectorAll(".mock-op-row");
    fireEvent.click(rows[1]!);

    // textarea에 데이터가 있어야 함
    await waitFor(() => {
      const textarea = container.querySelector<HTMLTextAreaElement>(".mock-dataset-textarea");
      expect(textarea).toBeTruthy();
      expect(textarea?.value).toBeTruthy();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>(".mock-dataset-textarea");
    // 배열 형태인지 확인
    const parsed = JSON.parse(textarea!.value);
    expect(Array.isArray(parsed)).toBe(true);
  });

  // ── 테스트 4: 포트 충돌 에러(PORT_IN_USE) → 에러 메시지 표시 ──
  it("PORT_IN_USE 에러 발생 시 포트 충돌 에러 메시지를 표시한다", async () => {
    mockStartMockServer.mockRejectedValueOnce(
      new Error("PORT_IN_USE: address already in use")
    );

    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
    ]);

    render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    const startBtn = screen.getByText("서버 시작");

    await act(async () => {
      fireEvent.click(startBtn);
    });

    // 에러 메시지 표시 — "포트 9090이(가) 사용 중입니다"
    const errorEl = screen.getByText(/포트.*사용 중/);
    expect(errorEl).toBeTruthy();
  });

  // ── 테스트 5: 서버 중지 버튼 ──
  it("서버 실행 중 서버 중지 버튼이 표시되고 클릭 시 stopMockServer 호출", async () => {
    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
    ]);

    render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    // 서버 시작
    await act(async () => {
      fireEvent.click(screen.getByText("서버 시작"));
    });

    // 중지 버튼 표시 확인
    const stopBtn = screen.getByText("서버 중지");
    expect(stopBtn).toBeTruthy();

    // 중지 클릭
    await act(async () => {
      fireEvent.click(stopBtn);
    });

    expect(mockStopMockServer).toHaveBeenCalled();
  });

  // ── 테스트 6: operation 체크박스 토글 ──
  it("operation 체크박스를 클릭하면 enabled 상태가 토글된다", () => {
    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
    ]);

    const { container } = render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    const checkbox = container.querySelector<HTMLInputElement>(
      ".mock-op-row input[type=checkbox]"
    );
    expect(checkbox).toBeTruthy();
    expect(checkbox?.checked).toBe(true); // 기본 enabled

    fireEvent.click(checkbox!);
    expect(checkbox?.checked).toBe(false);
  });

  // ── 테스트 6.5(I2): 마운트 시 서버 실행 중이면 "실행 중" 표시 + 서버 중지 버튼 ──
  it("마운트 시 getMockStatus가 running=true를 반환하면 즉시 실행 중 뱃지와 서버 중지 버튼이 표시된다", async () => {
    mockGetMockStatus.mockResolvedValue({ running: true, port: 9090, logs: [] });

    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
    ]);

    const { container } = render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    // 마운트 직후 getMockStatus 응답이 반영될 때까지 대기
    await waitFor(() => {
      const badge = container.querySelector(".mock-running-badge");
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toContain("실행 중");
    });

    // "서버 중지" 버튼이 표시되어야 함
    const stopBtn = screen.getByText("서버 중지");
    expect(stopBtn).toBeTruthy();
  });

  // ── 테스트 6.6(I1): AI 실패 시 자동 생성 폴백 + 에러 메시지 "대체했습니다" ──
  it("AI complete가 reject되면 자동 생성 데이터로 폴백되고 에러 메시지에 '대체했습니다'가 포함된다", async () => {
    const { getProvider } = await import("../core/ai/provider");
    vi.mocked(getProvider).mockReturnValueOnce({
      complete: vi.fn().mockRejectedValueOnce(new Error("API 키 없음")),
    } as unknown as ReturnType<typeof getProvider>);

    const spec = makeSpec([
      { id: "GET /users", method: "GET", path: "/users" },
    ]);

    const { container } = render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    // AI 소스 선택
    const trigger = container.querySelector(".cselect-trigger");
    expect(trigger).toBeTruthy();

    await act(async () => {
      fireEvent.click(trigger!);
    });

    await waitFor(() => {
      const aiOption = screen.getByText("AI 생성 (Claude)");
      expect(aiOption).toBeTruthy();
      fireEvent.mouseDown(aiOption);
    });

    // AI 생성 실패 후 에러 메시지에 "대체했습니다" 포함 확인
    await waitFor(() => {
      const errorEl = screen.getByText(/대체했습니다/);
      expect(errorEl).toBeTruthy();
    });

    // 데이터셋 textarea에 자동 생성 데이터가 있어야 함
    const textarea = container.querySelector<HTMLTextAreaElement>(".mock-dataset-textarea");
    expect(textarea).toBeTruthy();
    const parsed = JSON.parse(textarea!.value);
    expect(Array.isArray(parsed)).toBe(true);
  });

  // ── 테스트 7: 히스토리 없을 때 에러 표시 ──
  it("히스토리 소스 선택 시 성공 히스토리 없으면 에러 표시", async () => {
    const spec = makeSpec([
      { id: "GET /api/users", method: "GET", path: "/api/users" },
    ]);

    const { container } = render(
      <MockServerModal
        spec={spec}
        specUrl="https://api.example.com/openapi.json"
        history={[]}
        onClose={() => {}}
      />
    );

    // cselect-trigger 클릭 (커스텀 Select)
    const trigger = container.querySelector(".cselect-trigger");
    expect(trigger).toBeTruthy();

    await act(async () => {
      fireEvent.click(trigger!);
    });

    // cselect-panel에서 "히스토리에서 가져오기" 옵션 클릭
    await waitFor(() => {
      const historyOption = screen.getByText("히스토리에서 가져오기");
      expect(historyOption).toBeTruthy();
      fireEvent.mouseDown(historyOption);
    });

    // 에러 표시 확인
    await waitFor(() => {
      const errorEl = screen.getByText("이 API의 성공 히스토리가 없습니다");
      expect(errorEl).toBeTruthy();
    });
  });
});

// ── 확장 커버리지: 상세 패널 편집 ──────────────────────────────
describe("MockServerModal 상세 패널", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartMockServer.mockResolvedValue(9090);
    mockStopMockServer.mockResolvedValue(undefined);
    mockGetMockStatus.mockResolvedValue({ running: false, port: 9090, logs: [] });
  });

  function setup() {
    const spec = makeSpec([{ id: "GET /users", method: "GET", path: "/users" }]);
    const utils = render(
      <MockServerModal spec={spec} specUrl="https://api.example.com/openapi.json" history={[]} onClose={() => {}} />,
    );
    fireEvent.click(utils.container.querySelector(".mock-op-row")!);
    return utils;
  }

  it("선택된 operation이 없으면 안내 문구를 보여준다", () => {
    const spec = makeSpec([]); // operation 없음 → 자동 선택 대상 없음
    render(
      <MockServerModal spec={spec} specUrl="u" history={[]} onClose={() => {}} />,
    );
    expect(screen.getByText(/operation을 선택하세요/)).toBeTruthy();
  });

  it("개수/지연/상태코드를 편집할 수 있다", () => {
    const { container } = setup();
    const nums = container.querySelectorAll<HTMLInputElement>(".mock-num-input");
    expect(nums.length).toBe(3);
    fireEvent.change(nums[0], { target: { value: "5" } });
    fireEvent.change(nums[1], { target: { value: "100" } });
    fireEvent.change(nums[2], { target: { value: "404" } });
    expect(nums[0].value).toBe("5");
    expect(nums[2].value).toBe("404");
  });

  it("잘못된 JSON 입력 시 파싱 오류 메시지를 표시", () => {
    const { container } = setup();
    const ta = container.querySelector<HTMLTextAreaElement>(".mock-dataset-textarea")!;
    fireEvent.change(ta, { target: { value: "{ invalid json" } });
    expect(screen.getByText(/JSON 파싱 오류/)).toBeTruthy();
  });

  it("유효한 배열 JSON 입력 시 오류 없이 반영", () => {
    const { container } = setup();
    const ta = container.querySelector<HTMLTextAreaElement>(".mock-dataset-textarea")!;
    fireEvent.change(ta, { target: { value: '[{"id":9}]' } });
    expect(screen.queryByText(/JSON 파싱 오류/)).toBeNull();
  });

  it("source가 schema면 재생성 버튼을 노출", () => {
    setup();
    expect(screen.getByText(/재생성/)).toBeTruthy();
  });

  it("포트 입력을 변경할 수 있다", () => {
    const { container } = setup();
    const port = container.querySelector<HTMLInputElement>(".mock-port-input")!;
    fireEvent.change(port, { target: { value: "8081" } });
    expect(port.value).toBe("8081");
  });

  it("실행 중이면 Base URL 복사 버튼이 동작한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mockGetMockStatus.mockResolvedValue({ running: true, port: 9090, logs: [] });
    setup();
    await act(async () => {
      fireEvent.click(screen.getByText("서버 시작"));
    });
    fireEvent.click(screen.getByTitle("Base URL 복사"));
    expect(writeText).toHaveBeenCalledWith("http://localhost:9090");
  });
});

// ── MockServerModal 프리셋 바 ──────────────────────────────
describe("MockServerModal 프리셋", () => {
  const SPEC_URL = "https://api.example.com/openapi.json";

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStartMockServer.mockResolvedValue(9090);
    mockStopMockServer.mockResolvedValue(undefined);
    mockGetMockStatus.mockResolvedValue({ running: false, port: 9090, logs: [] });
  });

  function renderModal() {
    const spec = makeSpec([{ id: "GET /users", method: "GET", path: "/users" }]);
    return render(
      <MockServerModal spec={spec} specUrl={SPEC_URL} history={[]} onClose={() => {}} />,
    );
  }

  it("'현재 설정 저장'으로 제목을 넣으면 드롭다운에 프리셋이 나타난다", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "현재 설정 저장" }));
    const input = await screen.findByPlaceholderText("프리셋 제목");
    fireEvent.change(input, { target: { value: "기본세트" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    // 드롭다운(select)에 옵션으로 노출
    expect(await screen.findByRole("option", { name: /기본세트/ })).toBeTruthy();
  });

  it("프리셋 선택 시 confirm 후 설정에 적용한다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "현재 설정 저장" }));
    fireEvent.change(await screen.findByPlaceholderText("프리셋 제목"), { target: { value: "세트A" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const select = await screen.findByRole("combobox");
    const option = await screen.findByRole("option", { name: /세트A/ }) as HTMLOptionElement;
    fireEvent.change(select, { target: { value: option.value } });
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
