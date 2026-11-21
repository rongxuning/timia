import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginErrorKey, phoneLoginErrorKey, registerErrorKey } from "./authErrors.ts";

describe("loginErrorKey", () => {
  it("maps 401 and invalid_credentials", () => {
    assert.equal(loginErrorKey({ status: 401, message: "nope" }), "invalidCredentials");
    assert.equal(loginErrorKey({ status: 400, message: "invalid_credentials" }), "invalidCredentials");
  });

  it("maps 422 and 5xx", () => {
    assert.equal(loginErrorKey({ status: 422, message: "x" }), "invalidLoginFormat");
    assert.equal(loginErrorKey({ status: 503, message: "x" }), "serverUnavailable");
  });

  it("does not pass through Chinese detail", () => {
    assert.equal(loginErrorKey({ status: 400, message: "邮箱不对" }), "loginFailed");
  });

  it("falls back for empty/unknown", () => {
    assert.equal(loginErrorKey(null), "loginFailed");
    assert.equal(loginErrorKey({ status: 400, message: "weird_code" }), "loginFailed");
  });

  it("maps fetch TypeError to networkError", () => {
    assert.equal(loginErrorKey(new TypeError("Failed to fetch")), "networkError");
    assert.equal(loginErrorKey({ status: 0, message: "Failed to fetch" }), "networkError");
  });
});

describe("phoneLoginErrorKey", () => {
  it("maps phone and sms failures", () => {
    assert.equal(phoneLoginErrorKey({ status: 400, message: "invalid_phone" }), "invalidPhone");
    assert.equal(phoneLoginErrorKey({ status: 401, message: "invalid_code" }), "invalidCode");
    assert.equal(phoneLoginErrorKey({ status: 401, message: "invalid_challenge" }), "invalidCode");
    assert.equal(phoneLoginErrorKey({ status: 429, message: "resend_too_soon" }), "resendTooSoon");
    assert.equal(phoneLoginErrorKey({ status: 429, message: "phone_rate_limited" }), "phoneRateLimited");
    assert.equal(phoneLoginErrorKey({ status: 503, message: "sms_not_configured" }), "smsUnavailable");
    assert.equal(phoneLoginErrorKey({ status: 503, message: "sms_unavailable" }), "smsUnavailable");
  });

  it("falls back to the shared login errors", () => {
    assert.equal(phoneLoginErrorKey(new TypeError("Failed to fetch")), "networkError");
    assert.equal(phoneLoginErrorKey({ status: 500, message: "boom" }), "serverUnavailable");
  });
});

describe("registerErrorKey", () => {
  it("maps known codes", () => {
    assert.equal(registerErrorKey("email_taken"), "emailTaken");
    assert.equal(registerErrorKey("display_name_taken"), "displayNameTaken");
    assert.equal(registerErrorKey("password_too_short"), "passwordTooShort");
    assert.equal(registerErrorKey("display_name_required"), "displayNameRequired");
    assert.equal(registerErrorKey("display_name_too_long"), "displayNameTooLong");
  });

  it("unknown codes go to registerFailed", () => {
    assert.equal(registerErrorKey("nope"), "registerFailed");
    assert.equal(registerErrorKey("该邮箱已被注册"), "registerFailed");
  });
});
