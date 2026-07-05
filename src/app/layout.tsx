import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WhatsApp AI Bot - Admin",
  description: "Panel de administración",
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
