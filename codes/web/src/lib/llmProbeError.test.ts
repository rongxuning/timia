import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { llmProbeHintKey } from "../lib/llmProbeError.ts";

describe("llmProbeHintKey", () => {
  it("maps SSL unexpected EOF", () => {
    assert.equal(
      llmProbeHintKey(
        "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1010)",
      ),
      "sslEof",
    );
  });

  it("maps balance and auth fragments", () => {
    assert.equal(llmProbeHintKey('HTTP 500: insufficient balance (1008)'), "balance");
    assert.equal(llmProbeHintKey("HTTP 401: invalid api key"), "auth");
  });

  it("falls back to generic", () => {
    assert.equal(llmProbeHintKey("something weird happened"), "generic");
  });
});
