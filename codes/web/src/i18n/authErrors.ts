type LoginErrorKey =
  | "loginFailed"
  | "invalidCredentials"
  | "invalidLoginFormat"
  | "serverUnavailable"
  | "networkError";

type RegisterErrorKey =
  | "registerFailed"
  | "emailTaken"
  | "displayNameTaken"
  | "passwordTooShort"
  | "displayNameRequired"
  | "displayNameTooLong";

type PhoneLoginErrorKey =
  | LoginErrorKey
  | "invalidPhone"
  | "invalidCode"
  | "resendTooSoon"
  | "phoneRateLimited"
  | "smsUnavailable";

const PHONE_ERROR_KEYS: Record<string, PhoneLoginErrorKey> = {
  invalid_phone: "invalidPhone",
  invalid_code: "invalidCode",
  invalid_challenge: "invalidCode",
  resend_too_soon: "resendTooSoon",
  phone_rate_limited: "phoneRateLimited",
  sms_not_configured: "smsUnavailable",
  sms_unavailable: "smsUnavailable",
};

export function phoneLoginErrorKey(error: unknown): PhoneLoginErrorKey {
  if (error && typeof error === "object") {
    const message = (error as { message?: string }).message;
    if (typeof message === "string" && message in PHONE_ERROR_KEYS) {
      return PHONE_ERROR_KEYS[message];
    }
  }
  return loginErrorKey(error);
}

export function loginErrorKey(error: unknown): LoginErrorKey {
  if (error instanceof TypeError) return "networkError";
  if (!error || typeof error !== "object") return "loginFailed";
  const apiError = error as { status?: number; message?: string };
  const message = typeof apiError.message === "string" ? apiError.message : "";
  if (message === "Failed to fetch") return "networkError";
  if (apiError.status === 401 || message === "invalid_credentials") return "invalidCredentials";
  if (apiError.status === 422) return "invalidLoginFormat";
  if (typeof apiError.status === "number" && apiError.status >= 500) return "serverUnavailable";
  return "loginFailed";
}

export function registerErrorKey(detail: string): RegisterErrorKey {
  switch (detail) {
    case "email_taken":
      return "emailTaken";
    case "display_name_taken":
      return "displayNameTaken";
    case "password_too_short":
      return "passwordTooShort";
    case "display_name_required":
      return "displayNameRequired";
    case "display_name_too_long":
      return "displayNameTooLong";
    default:
      return "registerFailed";
  }
}
