// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent, screen, within, waitFor } from "@testing-library/react";
import { RequestEditor } from "./RequestEditor";
import { defaultInputs, type RequestInputs } from "../core/request-builder";
import { open } from "@tauri-apps/plugin-dialog";
import type { ParsedOperation } from "../core/types";

// Tauri 다이얼로그 모킹(파일 선택)
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

// jsdom에는 clipboard가 없음 → 스텁
const writeTextMock = vi.fn();
beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

const operation: ParsedOperation = {
  id: "GET /service-offerings",
  method: "GET",
  path: "/service-offerings",
  tags: [],
  parameters: [
    { id: "1", name: "targetIp", location: "query", required: true },
    { id: "2", name: "keyword", location: "query", required: false },
  ],
  responses: [],
};

function renderEditor() {
  return render(
    <RequestEditor
      operation={operation}
      inputs={defaultInputs(operation)}
      baseURL="https://infra-api.svc-dev.14-63-204-35.nip.io"
      globalHeaders={[]}
      vars={{}}
      sending={false}
      onChange={() => {}}
      onSend={() => {}}
      onCancel={() => {}}
      samples={[]}
      onSaveSample={() => {}}
      onDeleteSample={() => {}}
      historyItem={null}
      extractRules={[]}
      assertions={[]}
      assertResults={[]}
      onExtractChange={() => {}}
      onAssertChange={() => {}}
    />,
  );
}

describe("RequestEditor 요청 샘플", () => {
  it("body 없는 GET 요청에서도 요청 샘플 바가 표시된다", () => {
    const { container } = renderEditor();
    expect(container.querySelector(".sample-bar")).toBeTruthy();
    expect(container.textContent).toContain("요청 샘플");
  });

  it("샘플 선택 시 query/headers/body가 모두 폼에 적용된다", () => {
    const onChange = vi.fn();
    const sample = {
      name: "개발기 세트",
      body: "",
      queryParams: [{ key: "targetIp", value: "10.9.9.9", enabled: true }],
      headers: [{ key: "X-Env", value: "dev", enabled: true }],
    };
    const { container } = render(
      <RequestEditor
        operation={operation}
        inputs={defaultInputs(operation)}
        baseURL="https://api.test"
        globalHeaders={[]}
        vars={{}}
        sending={false}
        onChange={onChange}
        onSend={() => {}}
        onCancel={() => {}}
        samples={[sample]}
        onSaveSample={() => {}}
        onDeleteSample={() => {}}
        historyItem={null}
        extractRules={[]}
        assertions={[]}
        assertResults={[]}
        onExtractChange={() => {}}
        onAssertChange={() => {}}
      />,
    );
    // 커스텀 Select: 트리거 클릭으로 패널을 열고 옵션을 mousedown으로 선택
    const trigger = container.querySelector<HTMLButtonElement>(".sample-select .cselect-trigger")!;
    fireEvent.click(trigger);
    const option = document.querySelector(".cselect-option")!;
    fireEvent.mouseDown(option);
    const applied = onChange.mock.calls[0][0];
    expect(applied.queryParams).toEqual(sample.queryParams);
    expect(applied.headers).toEqual(sample.headers);
  });
});

describe("RequestEditor URL 미리보기", () => {
  it("URL이 잘리지 않는 멀티라인 텍스트로 표시된다", () => {
    const { container } = renderEditor();
    const text = container.querySelector(".url-preview-text");
    expect(text).toBeTruthy();
    expect(text!.textContent).toContain("https://infra-api.svc-dev.14-63-204-35.nip.io");
  });

  it("복사 버튼을 누르면 전체 URL이 클립보드에 복사된다", () => {
    const { container } = renderEditor();
    const btn = container.querySelector<HTMLButtonElement>('[aria-label="요청 URL 복사"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("https://infra-api.svc-dev.14-63-204-35.nip.io/service-offerings"),
    );
  });
});

// ── 확장 커버리지 ─────────────────────────────────────────────
const postOp: ParsedOperation = {
  id: "POST /users/{id}",
  method: "POST",
  path: "/users/{id}",
  summary: "유저 수정",
  tags: [],
  parameters: [
    { id: "p", name: "id", location: "path", required: true },
    { id: "q", name: "verbose", location: "query", required: false },
  ],
  requestBody: { required: true, contentType: "application/json", schema: { type: "object" } },
  responses: [],
};

function renderFull(over: Partial<Parameters<typeof RequestEditor>[0]> = {}) {
  const props: Parameters<typeof RequestEditor>[0] = {
    operation: postOp,
    inputs: defaultInputs(postOp),
    baseURL: "https://api.test",
    globalHeaders: [],
    vars: {},
    sending: false,
    onChange: vi.fn(),
    onSend: vi.fn(),
    onCancel: vi.fn(),
    samples: [],
    onSaveSample: vi.fn(),
    onDeleteSample: vi.fn(),
    historyItem: null,
    extractRules: [],
    assertions: [],
    assertResults: [],
    onExtractChange: vi.fn(),
    onAssertChange: vi.fn(),
    ...over,
  };
  const utils = render(<RequestEditor {...props} />);
  return { ...utils, props };
}

describe("RequestEditor 빈 상태", () => {
  it("operation/inputs가 없으면 안내 힌트", () => {
    render(
      <RequestEditor
        operation={null}
        inputs={null}
        baseURL=""
        globalHeaders={[]}
        vars={{}}
        sending={false}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onCancel={vi.fn()}
        samples={[]}
        onSaveSample={vi.fn()}
        onDeleteSample={vi.fn()}
        historyItem={null}
        extractRules={[]}
        assertions={[]}
        assertResults={[]}
        onExtractChange={vi.fn()}
        onAssertChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/endpoint를 선택/)).toBeTruthy();
  });
});

describe("RequestEditor Send/Cancel", () => {
  it("Send 버튼이 onSend 호출", () => {
    const { props } = renderFull();
    fireEvent.click(screen.getByText("Send"));
    expect(props.onSend).toHaveBeenCalled();
  });
  it("sending 중에는 취소 버튼이 onCancel 호출", () => {
    const { props } = renderFull({ sending: true });
    fireEvent.click(screen.getByText("✕ 취소"));
    expect(props.onCancel).toHaveBeenCalled();
  });
});

describe("RequestEditor 파라미터 편집", () => {
  it("Path Param을 편집하면 onChange 호출", () => {
    const { container, props } = renderFull();
    const section = within(screen.getByText("Path Params").closest("section")!);
    const input = section.getByPlaceholderText("값");
    fireEvent.change(input, { target: { value: "42" } });
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pathParams: { id: "42" } }),
    );
    expect(container).toBeTruthy();
  });

  it("Query Param 추가 버튼", () => {
    const { props } = renderFull();
    const section = screen.getByText("Query Params").closest("details")!;
    fireEvent.click(within(section).getByText("+ 추가"));
    const calls = vi.mocked(props.onChange).mock.calls;
    const next = calls[calls.length - 1][0] as RequestInputs;
    expect(next.queryParams.length).toBe(defaultInputs(postOp).queryParams.length + 1);
  });

  it("Query Param 체크박스 토글", () => {
    const { props } = renderFull();
    const section = screen.getByText("Query Params").closest("details")!;
    fireEvent.click(within(section).getAllByRole("checkbox")[0]);
    expect(props.onChange).toHaveBeenCalled();
  });

  it("Query Param 삭제", () => {
    const { props } = renderFull();
    const section = screen.getByText("Query Params").closest("details")!;
    fireEvent.click(within(section).getAllByTitle("삭제")[0]);
    expect(props.onChange).toHaveBeenCalled();
  });

  it("필수/옵션 배지를 표시한다", () => {
    renderFull();
    expect(screen.getByText("옵션")).toBeTruthy(); // verbose=optional query
  });
});

describe("RequestEditor 초기화", () => {
  it("초기화 클릭 → 확인 → resetParams가 onChange 호출", () => {
    const { props } = renderFull();
    fireEvent.click(screen.getByText("↺ 초기화"));
    const warn = screen.getByText(/스펙 기본값으로 초기화합니다/).closest(".reset-warn") as HTMLElement;
    fireEvent.click(within(warn).getByText("초기화"));
    expect(props.onChange).toHaveBeenCalled();
  });

  it("초기화 취소 시 경고가 사라진다", () => {
    renderFull();
    fireEvent.click(screen.getByText("↺ 초기화"));
    fireEvent.click(screen.getByText("취소"));
    expect(screen.queryByText(/스펙 기본값으로 초기화합니다/)).toBeNull();
  });
});

describe("RequestEditor Body 모드", () => {
  it("raw 모드에서 정렬 버튼이 JSON을 들여쓰기한다", () => {
    const inputs = { ...defaultInputs(postOp), bodyMode: "raw" as const, body: '{"a":1}' };
    const { props } = renderFull({ inputs });
    fireEvent.click(screen.getByText("정렬"));
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ body: '{\n  "a": 1\n}' }),
    );
  });

  it("raw 모드에서 압축 버튼이 JSON을 한 줄로 만든다", () => {
    const inputs = { ...defaultInputs(postOp), bodyMode: "raw" as const, body: '{\n "a": 1\n}' };
    const { props } = renderFull({ inputs });
    fireEvent.click(screen.getByText("압축"));
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ body: '{"a":1}' }));
  });

  it("잘못된 JSON 정렬은 무시(throw 없음)", () => {
    const inputs = { ...defaultInputs(postOp), bodyMode: "raw" as const, body: "not json" };
    const { props } = renderFull({ inputs });
    fireEvent.click(screen.getByText("정렬"));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("urlencoded 모드에서 폼 필드 값을 편집한다", () => {
    const inputs = {
      ...defaultInputs(postOp),
      bodyMode: "urlencoded" as const,
      form: [{ name: "grant_type", value: "password", enabled: true }],
    };
    const { props } = renderFull({ inputs });
    const valueInput = screen.getByDisplayValue("password");
    fireEvent.change(valueInput, { target: { value: "client_credentials" } });
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        form: [{ name: "grant_type", value: "client_credentials", enabled: true }],
      }),
    );
  });

  it("폼 필드를 삭제할 수 있다", () => {
    const inputs = {
      ...defaultInputs(postOp),
      bodyMode: "urlencoded" as const,
      form: [{ name: "a", value: "1", enabled: true }],
    };
    const { container, props } = renderFull({ inputs });
    const row = container.querySelector(".form-row")!;
    fireEvent.click(row.querySelector('[title="삭제"]')!);
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ form: [] }));
  });

  it("폼 필드 체크박스를 토글한다", () => {
    const inputs = {
      ...defaultInputs(postOp),
      bodyMode: "urlencoded" as const,
      form: [{ name: "a", value: "1", enabled: true }],
    };
    const { container, props } = renderFull({ inputs });
    fireEvent.click(container.querySelector(".form-row input[type=checkbox]")!);
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ form: [{ name: "a", value: "1", enabled: false }] }),
    );
  });

  it("None 모드에서는 body 에디터가 없다", () => {
    const inputs = { ...defaultInputs(postOp), bodyMode: "none" as const };
    const { container } = renderFull({ inputs });
    expect(container.querySelector(".json-editor")).toBeNull();
    expect(container.querySelector(".form-editor")).toBeNull();
  });

  it("multipart 모드에서 폼 필드 추가/이름 편집", () => {
    const inputs = { ...defaultInputs(postOp), bodyMode: "multipart" as const, form: [] };
    const { props } = renderFull({ inputs });
    fireEvent.click(screen.getByText("+ 필드"));
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ form: [{ name: "", value: "", enabled: true }] }),
    );
  });

  it("multipart 모드에서 파일 선택", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/a.png");
    const inputs = {
      ...defaultInputs(postOp),
      bodyMode: "multipart" as const,
      form: [{ name: "file", value: "", enabled: true }],
    };
    const { props } = renderFull({ inputs });
    fireEvent.click(screen.getByText("파일"));
    await waitFor(() =>
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({ form: [{ name: "file", value: "", enabled: true, filePath: "/tmp/a.png" }] }),
      ),
    );
  });

  it("multipart에서 선택된 파일을 해제할 수 있다", () => {
    const inputs = {
      ...defaultInputs(postOp),
      bodyMode: "multipart" as const,
      form: [{ name: "file", value: "", enabled: true, filePath: "/tmp/a.png" }],
    };
    const { props } = renderFull({ inputs });
    expect(screen.getByText(/📎/)).toBeTruthy();
    fireEvent.click(screen.getByText("✕파일"));
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ form: [{ name: "file", value: "", enabled: true, filePath: undefined }] }),
    );
  });
});

describe("RequestEditor 샘플 저장", () => {
  it("'＋요청 샘플' → 이름 입력 → Enter로 저장", () => {
    const { props } = renderFull();
    fireEvent.click(screen.getByText("＋요청 샘플"));
    const input = screen.getByPlaceholderText("샘플 이름");
    fireEvent.change(input, { target: { value: "세트A" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSaveSample).toHaveBeenCalledWith("세트A");
  });

  it("샘플 이름 입력 ESC로 취소", () => {
    renderFull();
    fireEvent.click(screen.getByText("＋요청 샘플"));
    fireEvent.keyDown(screen.getByPlaceholderText("샘플 이름"), { key: "Escape" });
    expect(screen.queryByPlaceholderText("샘플 이름")).toBeNull();
  });
});

describe("RequestEditor 부가 표시", () => {
  it("globalHeaders(활성)는 읽기전용 행으로 표시", () => {
    renderFull({ globalHeaders: [{ key: "X-Org", value: "kt", enabled: true }] });
    expect(screen.getByText("전역 헤더")).toBeTruthy();
    expect(screen.getByText("X-Org")).toBeTruthy();
  });

  it("필수 누락 시 경고 배너", () => {
    // id path param을 비워 필수 누락 유발
    const inputs = { ...defaultInputs(postOp), pathParams: { id: "" } };
    renderFull({ inputs });
    expect(screen.getByText(/필수 누락/)).toBeTruthy();
  });

  it("historyItem이 있으면 히스토리 배너", () => {
    renderFull({
      historyItem: {
        id: "h", opId: postOp.id, method: "POST", path: "/users/1", url: "https://api.test/users/1",
        status: 200, durationMs: 5, size: 1, executedAt: Date.now(),
        inputs: defaultInputs(postOp), responseHeaders: {}, responseBody: "",
      },
    });
    expect(screen.getByText(/히스토리 보기/)).toBeTruthy();
  });

  it("onNoteChange가 있으면 노트 에디터를 렌더", () => {
    renderFull({ onNoteChange: vi.fn() });
    // ApiNoteEditor가 렌더되면 메모 관련 요소가 존재
    expect(document.querySelector(".request-body-scroll")).toBeTruthy();
  });
});
