import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro, Epilogue, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { htmlLang, type Locale } from "@/i18n/config";

const epilogue = Epilogue({
  subsets: ["latin"],
  variable: "--font-epilogue",
  weight: ["400", "500", "600", "700", "800"],
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin"],
  variable: "--font-be-vietnam",
  weight: ["400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600", "700"],
});

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
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
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
