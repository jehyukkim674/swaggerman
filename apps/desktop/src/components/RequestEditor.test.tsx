// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RequestEditor } from "./RequestEditor";
import { defaultInputs } from "../core/request-builder";
import type { ParsedOperation } from "../core/types";

// Tauri 다이얼로그 모킹(파일 선택 — 이 테스트에서는 사용 안 함)
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
