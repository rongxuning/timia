import localFont from "next/font/local";

export const epilogue = localFont({
  src: "./fonts/epilogue-latin-wght-normal.woff2",
  variable: "--font-epilogue",
  display: "swap",
  weight: "100 900",
});

export const beVietnamPro = localFont({
  src: [
    { path: "./fonts/be-vietnam-pro-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/be-vietnam-pro-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/be-vietnam-pro-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/be-vietnam-pro-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-be-vietnam",
  display: "swap",
});

export const jetBrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: "100 800",
});
