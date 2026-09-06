"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_MAX_AGE, isLocale, type Locale } from "./config";

export async function changeLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
}
