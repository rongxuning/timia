/** Map probe/provider failure text to an i18n explanation key under llmKeys.probeHints. */

export type LlmProbeHintKey =
  | "sslEof"
  | "sslCert"
  | "timeout"
  | "connection"
  | "dns"
  | "auth"
  | "balance"
  | "rateLimit"
  | "http"
  | "generic";

export function llmProbeHintKey(raw: string): LlmProbeHintKey {
  const text = raw.toLowerCase();
  if (
    text.includes("unexpected_eof_while_reading") ||
    text.includes("eof occurred in violation of protocol") ||
    (text.includes("ssl") && text.includes("eof"))
  ) {
    return "sslEof";
  }
  if (
    text.includes("certificate_verify_failed") ||
    text.includes("sslcertverificationerror") ||
    text.includes("certificate verify failed")
  ) {
    return "sslCert";
  }
  if (text.includes("timed out") || text.includes("timeout") || text.includes("readtimeout")) {
    return "timeout";
  }
  if (
    text.includes("name or service not known") ||
    text.includes("nodename nor servname") ||
    text.includes("getaddrinfo") ||
    text.includes("name resolution")
  ) {
    return "dns";
  }
  if (
    text.includes("connection refused") ||
    text.includes("connecterror") ||
    text.includes("network is unreachable") ||
    text.includes("connection reset")
  ) {
    return "connection";
  }
  if (
    text.includes("http 401") ||
    text.includes("http 403") ||
    text.includes("1004") ||
    text.includes("not authorized") ||
    text.includes("invalid api key") ||
    text.includes("authentication")
  ) {
    return "auth";
  }
  if (text.includes("1008") || text.includes("insufficient balance") || text.includes("http 402")) {
    return "balance";
  }
  if (text.includes("1002") || text.includes("rate limit") || text.includes("http 429")) {
    return "rateLimit";
  }
  if (/^http \d{3}:/i.test(raw.trim())) {
    return "http";
  }
  return "generic";
}
