import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { ApiUsageHit, HttpMethod } from "@/lib/api-catalog";
import { API_CATALOG, openApiPathToSegments } from "@/lib/api-catalog";

function lineNumberAt(content: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) n++;
  }
  return n;
}

function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const p = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      out.push(...walkTsFiles(p));
    } else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

/** 将模板字面量中的 ${…} 替换为 *，并去掉 query */
function templateToWildcardPath(raw: string): string {
  const noQuery = raw.split("?")[0] ?? raw;
  return noQuery.replace(/\$\{[^}]+\}/g, "*");
}

function stringLiteralPath(raw: string): string {
  return (raw.split("?")[0] ?? raw).trim();
}

function extractMethodFromOptionsSlice(rest: string): HttpMethod {
  const m = /method\s*:\s*["'](GET|POST|PATCH|DELETE)["']/i.exec(rest);
  if (m?.[1]) return m[1].toUpperCase() as HttpMethod;
  return "GET";
}

/**
 * 从 apiFetch( 之后的位置解析第一个参数原文（到与参数列表匹配的逗号为止）。
 * 假定第一个参数不含顶层逗号（路径表达式）。
 */
function extractFirstApiFetchArg(source: string, openParenIdx: number): { arg: string; end: number } | null {
  let i = openParenIdx + 1;
  const len = source.length;
  while (i < len && /\s/.test(source[i]!)) i++;

  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inStr: '"' | "'" | "`" | null = null;
  let escape = false;
  const start = i;

  for (; i < len; i++) {
    const c = source[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inStr) {
      if (c === "\\" && inStr !== "`") {
        escape = true;
        continue;
      }
      if (c === inStr) {
        inStr = null;
        continue;
      }
      if (inStr === "`" && c === "$" && source[i + 1] === "{") {
        let j = i + 2;
        let bd = 1;
        while (j < len && bd > 0) {
          const ch = source[j]!;
          if (ch === "{") bd++;
          else if (ch === "}") bd--;
          j++;
        }
        i = j - 1;
        continue;
      }
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(") depthParen++;
    else if (c === ")") {
      if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
        return { arg: source.slice(start, i).trim(), end: i };
      }
      depthParen--;
    } else if (c === "[") depthBracket++;
    else if (c === "]") depthBracket--;
    else if (c === "{") depthBrace++;
    else if (c === "}") depthBrace--;
    else if (c === "," && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      return { arg: source.slice(start, i).trim(), end: i };
    }
  }
  return null;
}

function extractMatchingCloseParen(source: string, openIdx: number): number | null {
  let depth = 0;
  let inStr: '"' | "'" | "`" | null = null;
  let escape = false;
  for (let i = openIdx; i < source.length; i++) {
    const c = source[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inStr) {
      if (c === "\\" && inStr !== "`") {
        escape = true;
        continue;
      }
      if (c === inStr) {
        inStr = null;
        continue;
      }
      if (inStr === "`" && c === "$" && source[i + 1] === "{") {
        let j = i + 2;
        let bd = 1;
        while (j < source.length && bd > 0) {
          const ch = source[j]!;
          if (ch === "{") bd++;
          else if (ch === "}") bd--;
          j++;
        }
        i = j - 1;
        continue;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function tryResolveReturnTemplate(source: string, fnName: string): string | null {
  const esc = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`function\\s+${esc}\\s*\\([^)]*\\)\\s*\\{[^]*?return\\s+\`([^\`]*)\`\\s*;`, "m"),
    new RegExp(
      `const\\s+${esc}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{[^]*?return\\s+\`([^\`]*)\`\\s*;`,
      "m",
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(source);
    if (m?.[1]) return m[1]!;
  }
  return null;
}

function pathExprToWildcardSegments(expr: string, fileSource: string): string[] | null {
  const e = expr.trim();
  if (!e) return null;

  if ((e.startsWith('"') && e.endsWith('"')) || (e.startsWith("'") && e.endsWith("'"))) {
    const inner = e.slice(1, -1);
    return stringLiteralPath(inner).split("/").filter(Boolean);
  }

  if (e.startsWith("`") && e.endsWith("`")) {
    const inner = e.slice(1, -1);
    return templateToWildcardPath(inner).split("/").filter(Boolean);
  }

  const call = /^(\w+)\s*\([^)]*\)\s*$/.exec(e);
  if (call?.[1]) {
    const tpl = tryResolveReturnTemplate(fileSource, call[1]);
    if (tpl) return templateToWildcardPath(tpl).split("/").filter(Boolean);
  }

  return null;
}

function catalogKey(method: HttpMethod, openApiPath: string): string {
  return `${method} ${openApiPath}`;
}

function usageMatchesCatalog(usageSegs: string[], catalogSegs: string[]): boolean {
  if (usageSegs.length !== catalogSegs.length) return false;
  for (let i = 0; i < usageSegs.length; i++) {
    const u = usageSegs[i]!;
    const c = catalogSegs[i]!;
    if (c === "*") continue;
    if (u === "*") continue;
    if (u !== c) return false;
  }
  return true;
}

function findCatalogForUsage(method: HttpMethod, usageSegs: string[]): string | null {
  const candidates: { path: string; len: number }[] = [];
  for (const row of API_CATALOG) {
    if (row.method !== method) continue;
    const segs = openApiPathToSegments(row.path);
    if (usageMatchesCatalog(usageSegs, segs)) {
      candidates.push({ path: row.path, len: segs.length });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.len - a.len);
  return catalogKey(method, candidates[0]!.path);
}

function aggregateScan(webRoot: string, files: string[]): Map<string, ApiUsageHit[]> {
  const rawByKey = new Map<string, ApiUsageHit[]>();
  for (const abs of files) {
    const source = fs.readFileSync(abs, "utf8");
    const rel = path.relative(webRoot, abs).split(path.sep).join("/");
    let pos = 0;
    while (pos < source.length) {
      const idx = source.indexOf("apiFetch", pos);
      if (idx === -1) break;
      if (idx > 0 && /[\w.]/.test(source[idx - 1]!)) {
        pos = idx + 8;
        continue;
      }

      let j = idx + 8;
      while (j < source.length && /\s/.test(source[j]!)) j++;
      if (source[j] === "<") {
        let depth = 1;
        j++;
        while (j < source.length && depth > 0) {
          const ch = source[j]!;
          if (ch === "<") depth++;
          else if (ch === ">") depth--;
          j++;
        }
      }
      while (j < source.length && /\s/.test(source[j]!)) j++;
      if (source[j] !== "(") {
        pos = idx + 8;
        continue;
      }

      const first = extractFirstApiFetchArg(source, j);
      if (!first) {
        pos = idx + 8;
        continue;
      }
      const close = extractMatchingCloseParen(source, j);
      if (close === null) {
        pos = idx + 8;
        continue;
      }

      const inner = source.slice(j, close + 1);
      const rest = inner.slice(first.end - j + 1);
      const method = extractMethodFromOptionsSlice(rest);

      const segs = pathExprToWildcardSegments(first.arg, source);
      if (segs) {
        const key = findCatalogForUsage(method, segs);
        if (key) {
          const line = lineNumberAt(source, idx);
          const arr = rawByKey.get(key) ?? [];
          arr.push({ file: rel, line });
          rawByKey.set(key, arr);
        }
      }

      pos = close + 1;
    }
  }

  const deduped = new Map<string, ApiUsageHit[]>();
  for (const [k, arr] of rawByKey) {
    const seen = new Set<string>();
    const out: ApiUsageHit[] = [];
    for (const h of arr) {
      const sig = `${h.file}:${h.line}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(h);
    }
    deduped.set(k, out);
  }
  return deduped;
}

export function buildApiUsageIndex(): Map<string, ApiUsageHit[]> {
  const webRoot = process.cwd();
  const dirs = [path.join(webRoot, "app"), path.join(webRoot, "src")];
  const files = dirs.flatMap((d) => walkTsFiles(d));
  return aggregateScan(webRoot, files);
}
