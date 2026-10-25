import fs from "node:fs";
import path from "node:path";

export const FONT_REL = "public/fonts/material-symbols-outlined.woff2";
export const MANIFEST_REL = "app/fonts/material-symbols-icons.json";
export const HREF_REL = "src/lib/material-symbols-font.ts";

const ICON_NAME = /^[a-z][a-z0-9_]*$/;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

function skipQuoted(text, i) {
  const quote = text[i];
  i += 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function openingTagEnd(text, tagStart) {
  let brace = 0;
  for (let i = tagStart + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipQuoted(text, i) - 1;
      continue;
    }
    if (ch === "{") brace += 1;
    else if (ch === "}") brace = Math.max(0, brace - 1);
    else if (ch === ">" && brace === 0) return i;
  }
  return -1;
}

function matchingClose(text, from, tagName) {
  let depth = 1;
  let i = from;
  const openToken = `<${tagName}`;
  const closeToken = `</${tagName}>`;
  while (i < text.length && depth > 0) {
    const nextOpen = text.indexOf(openToken, i);
    const nextClose = text.indexOf(closeToken, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + openToken.length;
    } else {
      depth -= 1;
      if (depth === 0) return nextClose;
      i = nextClose + closeToken.length;
    }
  }
  return -1;
}

function iconsInInner(inner) {
  const names = new Set();
  const trimmed = inner.trim();
  if (ICON_NAME.test(trimmed)) names.add(trimmed);
  const stripped = inner.replace(/([!=]==?)\s*(["'`])([a-zA-Z0-9_]+)\2/g, "$1");
  const re = /(["'`])([a-z][a-z0-9_]*)\1/g;
  for (const match of stripped.matchAll(re)) names.add(match[2]);
  return names;
}

export function scanMaterialIconNames(root) {
  const names = new Set();
  const propRe = /\bicon\s*[:=]\s*(["'`])([a-z][a-z0-9_]*)\1/g;
  for (const file of walk(path.join(root, "app")).concat(walk(path.join(root, "src")))) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(propRe)) names.add(match[2]);
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf("material-symbols-outlined", from);
      if (at === -1) break;
      from = at + "material-symbols-outlined".length;
      const tagStart = text.lastIndexOf("<", at);
      if (tagStart === -1) continue;
      const tagMatch = /^<([A-Za-z][A-Za-z0-9.]*)/.exec(text.slice(tagStart));
      if (!tagMatch) continue;
      const tagEnd = openingTagEnd(text, tagStart);
      if (tagEnd === -1) continue;
      const closeAt = matchingClose(text, tagEnd + 1, tagMatch[1]);
      if (closeAt === -1) continue;
      for (const name of iconsInInner(text.slice(tagEnd + 1, closeAt))) names.add(name);
    }
  }
  return [...names].sort();
}
