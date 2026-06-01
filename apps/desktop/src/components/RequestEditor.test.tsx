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
