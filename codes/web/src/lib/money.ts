const CURRENCY_DIGITS: Record<string, number> = {
  CNY: 2,
  HKD: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KRW: 0,
};

const MAX_MINOR = 9_007_199_254_740_991;

export function currencyDigits(currency: string): number {
  return CURRENCY_DIGITS[currency] ?? 2;
}

export function formatMinor(amountMinor: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  const value = amountMinor / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function minorToInput(amountMinor: number, currency: string): string {
  const digits = currencyDigits(currency);
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const factor = 10 ** digits;
  const whole = Math.trunc(abs / factor);
  if (digits === 0) return `${negative ? "-" : ""}${whole}`;
  const frac = String(abs % factor).padStart(digits, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function parseAmountToMinor(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const cleaned = input.replace(/[\s,]/g, "").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const frac = match[2] ?? "";
  if (frac.length > digits) return null;
  const padded = digits === 0 ? "" : frac.padEnd(digits, "0");
  const minor = Number(match[1]) * 10 ** digits + (padded ? Number(padded) : 0);
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return null;
  return minor;
}

/** Stock quotes keep three decimal places. 200.819 is 200819. */
export const STOCK_QUOTE_SCALE = 1000;

export function parseQuoteToMinor(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const frac = match[3] ?? "";
  if (frac.length > 3) return null;
  const minor = Number(match[2]) * STOCK_QUOTE_SCALE + Number(frac.padEnd(3, "0"));
  const signed = match[1] ? -minor : minor;
  if (!Number.isSafeInteger(signed) || Math.abs(signed) > MAX_MINOR) return null;
  return signed;
}

export function formatQuote(amountMinor: number): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const whole = Math.trunc(abs / STOCK_QUOTE_SCALE);
  const frac = String(abs % STOCK_QUOTE_SCALE).padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function nowLocalInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function formatStamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
