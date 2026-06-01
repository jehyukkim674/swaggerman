// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ResponseView } from "./ResponseView";
import type { HTTPResponse } from "../core/types";

// jsdom에는 ResizeObserver가 없음(Minimap이 사용) → 스텁
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
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
