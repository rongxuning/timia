import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function flatten(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

const zh = JSON.parse(fs.readFileSync(path.join(root, "messages/zh.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8"));
const zhKeys = new Set(flatten(zh));
const enKeys = new Set(flatten(en));
const missingEn = [...zhKeys].filter((key) => !enKeys.has(key));
const missingZh = [...enKeys].filter((key) => !zhKeys.has(key));
if (missingEn.length || missingZh.length) {
  console.error("zh extra vs en:", missingEn);
  console.error("en extra vs zh:", missingZh);
  process.exit(1);
}
if (zh.locale.zh !== "中文" || en.locale.zh !== "中文" || zh.locale.en !== "English" || en.locale.en !== "English") {
  console.error("locale.zh / locale.en must be identical in both files");
  process.exit(1);
}
console.log(`i18n keys ok (${zhKeys.size})`);
