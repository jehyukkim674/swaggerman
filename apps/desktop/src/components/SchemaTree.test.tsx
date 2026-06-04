// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaTree } from "./SchemaTree";
import type { ParsedSchema } from "../core/types";

describe("SchemaTree", () => {
  it("primitive 스키마는 타입 라벨만 표시", () => {
    render(<SchemaTree schema={{ type: "string" }} />);
    expect(screen.getByText("string")).toBeTruthy();
  });

  it("object 스키마는 토글 가능하고 프로퍼티를 나열한다", () => {
    const schema: ParsedSchema = {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
      },
    };
    render(<SchemaTree schema={schema} />);
    expect(screen.getByText("id")).toBeTruthy();
    expect(screen.getByText("name")).toBeTruthy();
    // required가 먼저 정렬되어 required 배지 노출
    expect(screen.getByText("required")).toBeTruthy();
  });

  it("object 토글 클릭 시 접고 펼친다", () => {
    const schema: ParsedSchema = {
      type: "object",
      properties: { a: { type: "string" } },
    };
    render(<SchemaTree schema={schema} />);
    const toggle = screen.getByRole("button");
    expect(screen.getByText("a")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText("a")).toBeNull();
  });

  it("array[object]는 항목 스키마를 재귀 렌더한다", () => {
    const schema: ParsedSchema = {
      type: "array",
      items: { type: "object", properties: { x: { type: "number" } } },
    };
    render(<SchemaTree schema={schema} />);
    expect(screen.getByText("array[object]")).toBeTruthy();
    expect(screen.getByText("x")).toBeTruthy();
  });

  it("중첩 object 프로퍼티도 펼쳐 렌더한다", () => {
    const schema: ParsedSchema = {
      type: "object",
      properties: {
        nested: { type: "object", properties: { deep: { type: "string" } } },
      },
    };
    render(<SchemaTree schema={schema} />);
    expect(screen.getByText("nested")).toBeTruthy();
    expect(screen.getByText("deep")).toBeTruthy();
  });

  it("프로퍼티 없는 object는 타입 라벨로 폴백", () => {
    render(<SchemaTree schema={{ type: "object" }} />);
    expect(screen.getByText("object")).toBeTruthy();
  });
});
