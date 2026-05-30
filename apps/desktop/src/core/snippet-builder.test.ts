import { describe, it, expect } from "vitest";
import { buildSnippet } from "./snippet-builder";
import type { HTTPRequest } from "./types";

const req: HTTPRequest = {
  method: "POST",
  url: "https://api.com/users",
  headers: { "Content-Type": "application/json" },
  body: '{"name":"Alice"}',
};

describe("buildSnippet", () => {
  it("cURL", () => {
    expect(buildSnippet(req, "cURL")).toContain("curl -X POST");
  });

  it("JavaScript fetch", () => {
    const s = buildSnippet(req, "JavaScript");
    expect(s).toContain("await fetch(");
    expect(s).toContain('method: "POST"');
    expect(s).toContain("await response.json()");
  });

  it("Python requests", () => {
    const s = buildSnippet(req, "Python");
    expect(s).toContain("import requests");
    expect(s).toContain('requests.request("POST"');
    expect(s).toContain("response.json()");
  });
});
