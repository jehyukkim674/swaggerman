// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ResponseView } from "./ResponseView";
import type { HTTPRequest, HTTPResponse, ParsedOperation } from "../core/types";

const saveMock = vi.fn();
const writeTextFileMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: (...a: unknown[]) => saveMock(...a) }));
vi.mock("../core/fs", () => ({ writeTextFile: (...a: unknown[]) => writeTextFileMock(...a) }));

const writeTextMock = vi.fn();

// jsdom에는 ResizeObserver가 없음(Minimap이 사용) → 스텁
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

beforeEach(() => {
  saveMock.mockReset();
  writeTextFileMock.mockReset();
  writeTextMock.mockReset();
});

const response: HTTPResponse = {
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ items: [{ id: 1, name: "alpha" }] }),
  durationMs: 42,
  size: 100,
};

function renderView() {
  return render(
    <ResponseView
      response={response}
      request={null}
      operation={null}
      sending={false}
      error={null}
      tab="response"
      onTab={() => {}}
      historyItem={null}
      schemaIssues={[]}
    />,
  );
}

describe("ResponseView UI 다듬기", () => {
  it("⌘F(또는 Ctrl+F)를 누르면 검색 입력으로 포커스된다", () => {
    const { container } = renderView();
    const searchInput = container.querySelector<HTMLInputElement>("input.search");
    expect(searchInput).toBeTruthy();
    expect(document.activeElement).not.toBe(searchInput);

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(document.activeElement).toBe(searchInput);
  });

  it("응답 본문 복사 버튼이 검색바 안에 있고 우하단 플로팅 버튼은 없다", () => {
    const { container } = renderView();
    const inBar = container.querySelector('.search-bar [aria-label="응답 본문 복사"]');
    expect(inBar).toBeTruthy();
    expect(container.querySelector(".body-copy-fab")).toBeNull();
  });

  it("검색 지우기 버튼은 동그라미 X(svg) 아이콘이다", () => {
    const { container } = renderView();
    const searchInput = container.querySelector<HTMLInputElement>("input.search")!;
    fireEvent.change(searchInput, { target: { value: "alpha" } });

    const clear = container.querySelector(".search-clear");
    expect(clear).toBeTruthy();
    // 텍스트 ✕ 대신 동그라미 안에 X가 든 svg
    expect(clear!.querySelector("svg")).toBeTruthy();
    expect(clear!.querySelector("circle")).toBeTruthy();
  });
});

// ── 확장 커버리지 ─────────────────────────────────────────────
const request: HTTPRequest = {
  method: "GET",
  url: "https://api.test/users",
  headers: { Accept: "application/json" },
};

function renderFull(over: Partial<Parameters<typeof ResponseView>[0]> = {}) {
  const props: Parameters<typeof ResponseView>[0] = {
    response,
    request,
    operation: null,
    sending: false,
    error: null,
    tab: "response",
    onTab: vi.fn(),
    historyItem: null,
    schemaIssues: [],
    ...over,
  };
  return { ...render(<ResponseView {...props} />), props };
}

describe("ResponseView 상태 표시", () => {
  it("sending 중에는 '요청 중…'", () => {
    renderFull({ sending: true });
    expect(screen.getByText("요청 중…")).toBeTruthy();
  });
  it("error가 있으면 실패 메시지", () => {
    renderFull({ error: "타임아웃" });
    expect(screen.getByText(/요청 실패: 타임아웃/)).toBeTruthy();
  });
  it("응답이 없으면 안내", () => {
    renderFull({ response: null });
    expect(screen.getByText(/Send를 눌러 요청을 실행/)).toBeTruthy();
  });
  it("상태코드·소요시간·크기를 표시", () => {
    renderFull();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("42ms")).toBeTruthy();
    expect(screen.getByText("100 B")).toBeTruthy();
  });
});

describe("ResponseView 뷰 모드", () => {
  it("Raw 모드는 원본 본문을 pre로 표시", () => {
    const { container } = renderFull();
    fireEvent.click(screen.getByText("Raw"));
    expect(container.querySelector(".resp-raw")).toBeTruthy();
  });
  it("HTML 응답은 Preview 버튼이 있고 iframe 미리보기", () => {
    const html: HTTPResponse = { ...response, headers: { "content-type": "text/html" }, body: "<h1>hi</h1>" };
    const { container } = renderFull({ response: html });
    fireEvent.click(screen.getByText("Preview"));
    expect(container.querySelector("iframe.resp-preview")).toBeTruthy();
  });
});

describe("ResponseView 복사/저장/스니펫", () => {
  it("cURL 버튼이 클립보드에 복사", () => {
    renderFull();
    fireEvent.click(screen.getByText("cURL"));
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("curl"));
  });
  it("Code 드롭다운에서 언어를 고르면 스니펫 복사", () => {
    renderFull();
    fireEvent.click(screen.getByText("Code ▾"));
    const langBtn = document.querySelector(".snippet-dropdown button") as HTMLButtonElement;
    fireEvent.click(langBtn);
    expect(writeTextMock).toHaveBeenCalled();
  });
  it("본문 복사 버튼", () => {
    renderFull();
    fireEvent.click(screen.getByLabelText("응답 본문 복사"));
    expect(writeTextMock).toHaveBeenCalled();
  });
  it("저장 버튼이 파일 다이얼로그 + writeTextFile 호출", async () => {
    saveMock.mockResolvedValue("/tmp/response.json");
    writeTextFileMock.mockResolvedValue(undefined);
    renderFull();
    fireEvent.click(screen.getByText("저장"));
    await waitFor(() => expect(writeTextFileMock).toHaveBeenCalledWith("/tmp/response.json", response.body));
  });
  it("저장 취소(경로 없음) 시 파일을 쓰지 않는다", async () => {
    saveMock.mockResolvedValue(null);
    renderFull();
    fireEvent.click(screen.getByText("저장"));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});

describe("ResponseView AI 액션", () => {
  it("onAskAi 설명 버튼", () => {
    const onAskAi = vi.fn();
    renderFull({ onAskAi });
    fireEvent.click(screen.getByText("✦ 설명"));
    expect(onAskAi).toHaveBeenCalledWith("explain");
  });
  it("4xx 이상이면 진단 버튼 노출", () => {
    const onAskAi = vi.fn();
    renderFull({ onAskAi, response: { ...response, statusCode: 500 } });
    fireEvent.click(screen.getByText("✦ 진단"));
    expect(onAskAi).toHaveBeenCalledWith("diagnose");
  });
  it("2xx면 진단 버튼 없음", () => {
    renderFull({ onAskAi: vi.fn() });
    expect(screen.queryByText("✦ 진단")).toBeNull();
  });
});

describe("ResponseView 검색", () => {
  it("검색어 Enter로 매치 카운트, 다음/이전 이동", () => {
    const body = JSON.stringify({ a: "x", b: "x", c: "x" }, null, 2);
    renderFull({ response: { ...response, body } });
    const input = screen.getByPlaceholderText("검색 후 Enter (⌘F)");
    fireEvent.change(input, { target: { value: '"x"' } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText(/1\/3/)).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" }); // 다음
    expect(screen.getByText(/2\/3/)).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true }); // 이전
    expect(screen.getByText(/1\/3/)).toBeTruthy();
  });
  it("일치 없으면 '일치 없음'", () => {
    renderFull();
    const input = screen.getByPlaceholderText("검색 후 Enter (⌘F)");
    fireEvent.change(input, { target: { value: "zzzzzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("일치 없음")).toBeTruthy();
  });
  it("Escape로 검색 초기화", () => {
    renderFull();
    const input = screen.getByPlaceholderText("검색 후 Enter (⌘F)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });
});

describe("ResponseView 스키마/헤더/탭", () => {
  const opWithSchema: ParsedOperation = {
    id: "GET /users", method: "GET", path: "/users", tags: [], parameters: [],
    responses: [{ statusCode: "200", schema: { type: "object" } }],
  };
  it("스키마 불일치 건수를 표시", () => {
    renderFull({
      operation: opWithSchema,
      schemaIssues: [{ path: "data.id", message: "타입 불일치" }],
    });
    expect(screen.getByText(/1건 불일치/)).toBeTruthy();
  });
  it("스키마 일치 시 ✓ 일치", () => {
    renderFull({ operation: opWithSchema, schemaIssues: [] });
    expect(screen.getByText("✓ 일치")).toBeTruthy();
  });
  it("응답 헤더 개수를 요약에 표시", () => {
    renderFull();
    expect(screen.getByText(/Response Headers \(1\)/)).toBeTruthy();
  });
  it("operation이 있으면 Docs/Response 탭, Docs 클릭 시 onTab", () => {
    const { props } = renderFull({ operation: opWithSchema, tab: "response" });
    fireEvent.click(screen.getByText("Docs"));
    expect(props.onTab).toHaveBeenCalledWith("docs");
  });
  it("Docs 탭이면 DocsPane을 렌더", () => {
    renderFull({ operation: opWithSchema, tab: "docs" });
    expect(screen.getByText("Responses")).toBeTruthy();
  });
});
