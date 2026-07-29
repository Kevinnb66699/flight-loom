import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://flight-loom.vercel.app"),
  title: {
    default: "Flight Loom",
    template: "%s",
  },
  description:
    "Turn the visible motion and colors of a drone flight into a living digital textile.",
  openGraph: {
    title: "Flight Loom — Every flight leaves a hidden textile",
    description:
      "Play a drone flight, see its motion sampled, and watch it become interactive digital art.",
    url: "https://flight-loom.vercel.app",
    siteName: "Flight Loom",
    images: [
      {
        url: "/og.png",
        width: 1730,
        height: 909,
        alt: "A drone flight becoming a woven digital textile",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flight Loom — Every flight leaves a hidden textile",
    description:
      "Play a drone flight, see its motion sampled, and watch it become interactive digital art.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
