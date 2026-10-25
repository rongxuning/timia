import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_REL, MANIFEST_REL, scanMaterialIconNames } from "./material-symbols.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontPath = path.join(root, FONT_REL);
const manifestPath = path.join(root, MANIFEST_REL);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const scanned = scanMaterialIconNames(root);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const declared = [...manifest.icons].sort();
const missing = scanned.filter((name) => !declared.includes(name));
const stale = declared.filter((name) => !scanned.includes(name));
if (missing.length || stale.length) {
  fail(
    [
      "Material Symbols subset is out of date.",
      missing.length ? `used but not in the font manifest: ${missing.join(", ")}` : "",
      stale.length ? `in the font manifest but unused: ${stale.join(", ")}` : "",
      "Run: node scripts/update-material-symbols.mjs",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const bytes = fs.readFileSync(fontPath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
if (sha256 !== manifest.sha256) {
  fail(`font sha256 ${sha256} does not match manifest ${manifest.sha256}`);
}
if (bytes.length < 1000 || bytes.subarray(0, 4).toString() !== "wOF2") {
  fail("material-symbols-outlined.woff2 is not a woff2 font");
}

const layout = fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8");
const fonts = fs.readFileSync(path.join(root, "app/fonts.ts"), "utf8");
if (layout.includes("fonts.googleapis.com") || layout.includes("fonts.gstatic.com")) {
  fail("app/layout.tsx still loads Material Symbols from Google Fonts");
}
if (!fonts.includes("material-symbols-outlined.woff2")) {
  fail("app/fonts.ts does not load the self-hosted Material Symbols file");
}

console.log(`material symbols ok (${scanned.length} icons, ${bytes.length} bytes)`);
