import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FONT_REL, MANIFEST_REL, scanMaterialIconNames } from "./material-symbols.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const icons = scanMaterialIconNames(root);
if (icons.length === 0) {
  console.error("no Material Symbols icons found");
  process.exit(1);
}

const cssUrl =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,0" +
  `&icon_names=${icons.join(",")}&display=block`;
const cssRes = await fetch(cssUrl, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
});
if (!cssRes.ok) {
  console.error(`Google Fonts CSS failed: ${cssRes.status}`);
  process.exit(1);
}
const css = await cssRes.text();
const fontUrl = css.match(/url\((https:[^)]+)\)/)?.[1];
if (!fontUrl) {
  console.error("Google Fonts CSS did not include a woff2 url");
  process.exit(1);
}
const fontRes = await fetch(fontUrl);
if (!fontRes.ok) {
  console.error(`font download failed: ${fontRes.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await fontRes.arrayBuffer());
if (bytes.subarray(0, 4).toString() !== "wOF2") {
  console.error("downloaded file is not woff2");
  process.exit(1);
}

const fontPath = path.join(root, FONT_REL);
fs.writeFileSync(fontPath, bytes);
const check = spawnSync(
  "python3",
  [
    "-c",
    `
from fontTools.ttLib import TTFont
import sys
font = TTFont(sys.argv[1])
axes = {axis.axisTag for axis in font["fvar"].axes}
missing_axes = [axis for axis in ("FILL", "opsz", "wght") if axis not in axes]
if missing_axes:
    raise SystemExit("missing axes: " + ",".join(missing_axes))
gsub = font["GSUB"].table
wanted = set(sys.argv[2].split(","))
found = set()
for rec in gsub.FeatureList.FeatureRecord:
    if rec.FeatureTag != "rlig":
        continue
    for index in rec.Feature.LookupListIndex:
        lookup = gsub.LookupList.Lookup[index]
        for subtable in lookup.SubTable:
            table = getattr(subtable, "ExtSubTable", subtable)
            ligatures = getattr(table, "ligatures", None)
            if not ligatures:
                continue
            for first, ligs in ligatures.items():
                for lig in ligs:
                    chars = []
                    for glyph in [first, *lig.Component]:
                        if glyph == "underscore":
                            chars.append("_")
                        elif glyph == "two":
                            chars.append("2")
                        elif len(glyph) == 1:
                            chars.append(glyph)
                    found.add("".join(chars))
missing = sorted(wanted - found)
if missing:
    raise SystemExit("font is missing ligatures: " + ", ".join(missing))
`,
    fontPath,
    icons.join(","),
  ],
  { encoding: "utf8" },
);
if (check.status !== 0) {
  console.error(check.stderr || check.stdout || "fontTools check failed");
  process.exit(check.status || 1);
}

const manifest = {
  sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  icons,
};
fs.writeFileSync(path.join(root, MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${FONT_REL} (${bytes.length} bytes, ${icons.length} icons)`);
