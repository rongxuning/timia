import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro, Epilogue, JetBrains_Mono } from "next/font/google";

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

export const metadata: Metadata = {
  title: "Timia · 协作管理",
  icons: {
    icon: [{ url: "/icon.png?v=20260720-t", sizes: "512x512", type: "image/png" }],
    shortcut: [{ url: "/favicon.ico?v=20260720-t", type: "image/x-icon" }],
    apple: [{ url: "/icon.png?v=20260720-t", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
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
        {children}
      </body>
    </html>
  );
}
