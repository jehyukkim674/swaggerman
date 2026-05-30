import type { HTTPMethod } from "../core/types";

export function methodColor(method: HTTPMethod | string): string {
  switch (method) {
    case "GET":
      return "#3fb950";
    case "POST":
      return "#388bfd";
    case "PUT":
      return "#d29922";
    case "DELETE":
      return "#f85149";
    case "PATCH":
      return "#a371f7";
    default:
      return "#8b949e";
  }
}

export function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "#3fb950";
  if (status >= 300 && status < 400) return "#d29922";
  if (status >= 400 && status < 500) return "#f0883e";
  if (status >= 500) return "#f85149";
  return "#8b949e";
}
