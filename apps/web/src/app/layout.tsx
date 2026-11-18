import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Providers } from "@/components/Providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const DESCRIPTION = "A shedding card game in the Crazy Eights family where nobody can peek. Hands and deck are Zama FHE ciphertexts on Sepolia. Veil, Spyglass, Sonar and a secret colour.";

export const metadata: Metadata = {
  metadataBase: new URL("https://kryphochroma.unitynodes.com"),
  title: { default: "Kryphochroma", template: "%s · Kryphochroma" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Kryphochroma",
    title: "Kryphochroma, the card game nobody can peek at",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Kryphochroma: sealed cards on a felt table" }],
  },
  twitter: { card: "summary_large_image", title: "Kryphochroma", description: DESCRIPTION, images: ["/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#07130e" };

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
          <Providers>{children}</Providers>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
