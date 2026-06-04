// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocsPane } from "./DocsPane";
import type { ParsedOperation } from "../core/types";

function op(over: Partial<ParsedOperation> = {}): ParsedOperation {
  return {
    id: "GET /users",
    method: "GET",
    path: "/users",
    tags: [],
    parameters: [],
    responses: [],
    ...over,
  };
}

describe("DocsPane", () => {
  it("메서드와 경로를 표시한다", () => {
    render(<DocsPane operation={op()} />);
    expect(screen.getByText("GET")).toBeTruthy();
    expect(screen.getByText("/users")).toBeTruthy();
  });

  it("description이 있으면 표시(summary 폴백 포함)", () => {
    render(<DocsPane operation={op({ summary: "유저 목록" })} />);
    expect(screen.getByText("유저 목록")).toBeTruthy();
  });

  it("파라미터 섹션을 렌더한다", () => {
    render(
      <DocsPane
        operation={op({
          parameters: [
            { id: "p1", name: "page", location: "query", required: true, schema: { type: "integer" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.getByText("page")).toBeTruthy();
    expect(screen.getByText("required")).toBeTruthy();
  });

  it("requestBody 섹션을 렌더한다", () => {
    render(
      <DocsPane
        operation={op({
          method: "POST",
          requestBody: {
            required: true,
            contentType: "application/json",
            schema: { type: "object", properties: { name: { type: "string" } } },
          },
        })}
      />,
    );
    expect(screen.getByText("Request Body")).toBeTruthy();
    expect(screen.getByText("application/json")).toBeTruthy();
  });

  it("응답 섹션과 예제를 렌더한다", () => {
    render(
      <DocsPane
        operation={op({
          responses: [
            { statusCode: "200", description: "성공", schema: { type: "string" }, example: { ok: true } },
            { statusCode: "404", example: "not found" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Responses")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("성공")).toBeTruthy();
    expect(screen.getAllByText("예제 응답").length).toBe(2);
  });

  it("정보가 전혀 없으면 '문서 정보 없음' 힌트", () => {
    render(<DocsPane operation={op()} />);
    expect(screen.getByText("문서 정보 없음")).toBeTruthy();
  });
});
