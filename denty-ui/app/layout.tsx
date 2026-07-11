import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DENTY — AI Dental Assistant",
  description:
    "DENTY is an Apple-quality AI assistant for dental clinics — voice, chat, patients, treatment planning, WhatsApp & lab orders.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#08090c" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Set the theme class before paint to avoid a flash of the wrong theme.
const noFlash = `
(function(){try{
  var t = localStorage.getItem('denty-theme');
  var m = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (t === 'dark' || (!t && m)) document.documentElement.classList.add('dark');
}catch(e){}})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
