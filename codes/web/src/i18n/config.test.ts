import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LOCALE, htmlLang, isLocale, resolveLocale } from "./config.ts";

describe("resolveLocale", () => {
  it("returns zh when value is missing", () => {
    assert.equal(resolveLocale(undefined), "zh");
    assert.equal(resolveLocale(null), "zh");
    assert.equal(resolveLocale(""), "zh");
  });

  it("accepts zh and en", () => {
    assert.equal(resolveLocale("zh"), "zh");
    assert.equal(resolveLocale("en"), "en");
  });

  it("rejects zh-CN, en-US, and junk", () => {
    assert.equal(resolveLocale("zh-CN"), "zh");
    assert.equal(resolveLocale("en-US"), "zh");
    assert.equal(resolveLocale("fr"), "zh");
  });
});

describe("isLocale", () => {
  it("is a type guard for zh and en only", () => {
    assert.equal(isLocale("zh"), true);
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("zh-CN"), false);
  });
});

describe("htmlLang", () => {
  it("maps zh to zh-CN and en to en", () => {
    assert.equal(htmlLang("zh"), "zh-CN");
    assert.equal(htmlLang("en"), "en");
  });
});

describe("DEFAULT_LOCALE", () => {
  it("is zh", () => {
    assert.equal(DEFAULT_LOCALE, "zh");
  });
});
