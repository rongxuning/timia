import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLocaleChange } from "./applyLocaleChange.ts";

describe("applyLocaleChange", () => {
  it("closes the overlay without reloading when the locale is unchanged", async () => {
    const calls: string[] = [];
    await applyLocaleChange({
      current: "en",
      next: "en",
      persistCookie: () => calls.push("cookie"),
      persistServer: async () => {
        calls.push("server");
      },
      closeOverlay: () => calls.push("close"),
      reload: () => calls.push("reload"),
    });
    assert.deepEqual(calls, ["close"]);
  });

  it("writes the cookie, closes the overlay, then reloads after a change", async () => {
    const calls: string[] = [];
    await applyLocaleChange({
      current: "en",
      next: "zh",
      persistCookie: (locale) => calls.push(`cookie:${locale}`),
      persistServer: async (locale) => {
        calls.push(`server:${locale}`);
      },
      closeOverlay: () => calls.push("close"),
      reload: () => calls.push("reload"),
    });
    assert.deepEqual(calls, ["cookie:zh", "server:zh", "close", "reload"]);
  });
});
