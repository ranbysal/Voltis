import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
});

const editorialNew = localFont({
  src: "../fonts/PPEditorialNew-Italic.woff2",
  style: "italic",
  weight: "400",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Voltis | Futures Workspace",
  description:
    "A private multi-timeframe futures workspace for Dow and Nasdaq analysis.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexMono.variable} ${editorialNew.variable}`}>
      <body>{children}</body>
    </html>
  );
}
