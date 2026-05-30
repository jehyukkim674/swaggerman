import type { HTTPRequest } from "./types";
import { buildCurl } from "./curl-builder";

export type SnippetLang = "cURL" | "JavaScript" | "Python";

export const SNIPPET_LANGS: SnippetLang[] = ["cURL", "JavaScript", "Python"];

export function buildSnippet(request: HTTPRequest, lang: SnippetLang): string {
  switch (lang) {
    case "cURL":
      return buildCurl(request);
    case "JavaScript":
      return jsFetch(request);
    case "Python":
      return pythonRequests(request);
  }
}

function jsFetch(request: HTTPRequest): string {
  const headers = JSON.stringify(request.headers, null, 2);
  const lines = [
    `const response = await fetch(${JSON.stringify(request.url)}, {`,
    `  method: ${JSON.stringify(request.method)},`,
    `  headers: ${headers.replace(/\n/g, "\n  ")},`,
  ];
  if (request.body) lines.push(`  body: ${JSON.stringify(request.body)},`);
  lines.push("});", "const data = await response.json();", "console.log(data);");
  return lines.join("\n");
}

function pythonRequests(request: HTTPRequest): string {
  const headers = JSON.stringify(request.headers, null, 4);
  const lines = ["import requests", "", `url = ${JSON.stringify(request.url)}`, `headers = ${headers}`];
  if (request.body) lines.push(`data = ${JSON.stringify(request.body)}`);
  const args = ["url", "headers=headers"];
  if (request.body) args.push("data=data");
  lines.push(
    "",
    `response = requests.request(${JSON.stringify(request.method)}, ${args.join(", ")})`,
    "print(response.status_code)",
    "print(response.json())",
  );
  return lines.join("\n");
}
