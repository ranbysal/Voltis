import type { Metadata } from "next";
import { IBM_Plex_Mono, Tinos } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
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

// Upright transitional serif used for the brand wordmark and display headings
// on the login + settings surfaces. Tinos is metric-compatible with Times New
// Roman, so it reproduces the reference mockups faithfully on every platform.
const displaySerif = Tinos({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display",
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

/**
 * Runs before hydration: when the landing hand-off flag is present the boot
 * choreography owns the first frame, so dashboard regions must be hidden
 * before the workspace client component mounts.
 */
const BOOT_PREPAINT = `try{if(sessionStorage.getItem("voltis-boot")){var r=matchMedia("(prefers-reduced-motion: reduce)").matches;document.documentElement.setAttribute(r?"data-vboot-reduced":"data-vboot","1")}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${editorialNew.variable} ${displaySerif.variable}`}
    >
      <body>
        <Script
          id="voltis-boot-prepaint"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: BOOT_PREPAINT }}
        />
        {children}
      </body>
    </html>
  );
}
