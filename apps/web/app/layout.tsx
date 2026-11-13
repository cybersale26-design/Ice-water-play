import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const description = "A real-time online playground game for friends and public players. Run, freeze, rescue, repeat — no account needed.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "ICE & WATER — Play Together", template: "%s | ICE & WATER" },
  description,
  applicationName: "ICE & WATER",
  openGraph: { title: "ICE & WATER — The game we never forgot.", description, type: "website", siteName: "ICE & WATER" },
  twitter: { card: "summary", title: "ICE & WATER", description }
};
export const viewport: Viewport = {
  themeColor: "#101514",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
