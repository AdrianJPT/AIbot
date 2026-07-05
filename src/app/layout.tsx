import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WhatsApp AI Bot - Admin",
  description: "Panel de administración",
  manifest: "/manifest.json",
  icons: {
    // Only an SVG source icon is available (see public/icon.svg) — no
    // dedicated raster PNGs were generated, so browsers/OSes that require
    // one for the home-screen icon (notably older iOS Safari) will fall
    // back to a screenshot instead of this icon. Good enough for the PWA
    // installability check; revisit with real PNG exports if that matters.
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020817" },
  ],
};

// Sets the `dark` class on <html> before React hydrates, based on a stored
// preference or `prefers-color-scheme`. Runs synchronously and blocks
// paint for a single instant so there is no flash of the wrong theme.
const noFlashScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("theme");
    var isDark =
      stored === "dark" ||
      (stored !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
