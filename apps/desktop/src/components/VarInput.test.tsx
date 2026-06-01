// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VarInput } from "./VarInput";

const VARS = ["targetIp", "$timestamp", "$randomInt"];

describe("VarInput 호버 툴팁", () => {
  it("{{변수}}가 있는 입력에 호버하면 출처와 실제 값을 보여준다", () => {
    const { container } = render(
      <VarInput
        value="http://{{targetIp}}/api"
        onChange={() => {}}
        vars={VARS}
        varDetails={{ targetIp: { value: "10.0.0.1", source: "환경: 운영" } }}
      />,
    );
    const wrap = container.querySelector(".var-input-wrap")!;
    fireEvent.mouseEnter(wrap);
    expect(screen.getByText("{{targetIp}}")).toBeTruthy();
    expect(screen.getByText("환경: 운영")).toBeTruthy();
    expect(screen.getByText("10.0.0.1")).toBeTruthy();
  });

  it("정의되지 않은 변수는 경고를 표시한다", () => {
    const { container } = render(
      <VarInput value="{{nope}}" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    fireEvent.mouseEnter(container.querySelector(".var-input-wrap")!);
    expect(screen.getByText(/정의되지 않음/)).toBeTruthy();
  });

  it("동적 변수($timestamp 등)는 예시 값을 보여준다", () => {
    const { container } = render(
      <VarInput value="{{$timestamp}}" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    fireEvent.mouseEnter(container.querySelector(".var-input-wrap")!);
    expect(screen.getByText("{{$timestamp}}")).toBeTruthy();
    expect(screen.getByText("동적 변수")).toBeTruthy();
    expect(screen.getByText(/예시/)).toBeTruthy();
  });

  it("변수가 없는 값은 호버해도 툴팁이 안 뜬다", () => {
    const { container } = render(
      <VarInput value="http://example.com" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    fireEvent.mouseEnter(container.querySelector(".var-input-wrap")!);
    expect(container.querySelector(".var-tooltip")).toBeNull();
  });

  it("기존 자동완성 동작은 그대로 동작한다", () => {
    const { container } = render(
      <VarInput value="" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "{{target" } });
    expect(screen.getByText("{{targetIp}}")).toBeTruthy();
  });
});
