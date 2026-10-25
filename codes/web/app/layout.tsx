import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { htmlLang, type Locale } from "@/i18n/config";
import { MATERIAL_SYMBOLS_HREF } from "@/lib/material-symbols-font";
import { beVietnamPro, epilogue, jetBrainsMono } from "./fonts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    icons: {
      icon: [{ url: "/icon.png?v=20260724-t", sizes: "512x512", type: "image/png" }],
      shortcut: [{ url: "/favicon.ico?v=20260724-t", type: "image/x-icon" }],
      apple: [{ url: "/icon.png?v=20260724-t", sizes: "512x512", type: "image/png" }],
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  return (
    <html lang={htmlLang(locale)}>
      <head>
        <link
          rel="preload"
          href={MATERIAL_SYMBOLS_HREF}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <style>{`
          @font-face {
            font-family: "Material Symbols Outlined";
            font-style: normal;
            font-weight: 100 700;
            font-display: block;
            src: url("${MATERIAL_SYMBOLS_HREF}") format("woff2");
          }
        `}</style>
      </head>
      <body
        className={[
          epilogue.variable,
          beVietnamPro.variable,
          jetBrainsMono.variable,
          "bg-background font-body text-on-background selection:bg-primary-fixed selection:text-on-primary-fixed",
        ].join(" ")}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
