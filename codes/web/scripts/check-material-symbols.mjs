import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_REL, HREF_REL, MANIFEST_REL, scanMaterialIconNames } from "./material-symbols.mjs";

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
const hrefSource = fs.readFileSync(path.join(root, HREF_REL), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.js"), "utf8");
const nginx = fs.readFileSync(path.join(root, "../../deploy/nginx.conf"), "utf8");
const href = hrefSource.match(/\/fonts\/material-symbols-outlined\.woff2\?v=([a-f0-9]+)/)?.[1];
if (layout.includes("fonts.googleapis.com") || layout.includes("fonts.gstatic.com")) {
  fail("app/layout.tsx still loads Material Symbols from Google Fonts");
}
if (!layout.includes("MATERIAL_SYMBOLS_HREF")) {
  fail("app/layout.tsx does not preload the server icon font");
}
if (href !== sha256.slice(0, 12)) {
  fail(`font href version ${href} does not match sha256 ${sha256.slice(0, 12)}`);
}
const cacheControl = "public, max-age=31536000, immutable";
if (!nextConfig.includes(cacheControl) || !nextConfig.includes("/fonts/:path*")) {
  fail("next.config.js does not cache /fonts/ in the browser");
}
if (!nginx.includes("location /fonts/") || !nginx.includes(cacheControl)) {
  fail("deploy/nginx.conf does not cache /fonts/ in the browser");
}

console.log(`material symbols ok (${scanned.length} icons, ${bytes.length} bytes)`);
