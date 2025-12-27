import type { Metadata } from "next";
import Link from "next/link";
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

const navLinks = [
  { href: "/overview", label: "Overview" },
  { href: "/analytics", label: "Analytics" },
  { href: "/optimization", label: "Optimization" },
  { href: "/simulator", label: "Simulator" },
];

export const metadata: Metadata = {
  title: "Traffic Coordination Console",
  description: "Monitor, optimize, and simulate signal timing in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100`}
      >
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_60%)] text-slate-100">
          <header className="border-b border-white/5 bg-slate-900/60 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
              <Link href="/" className="text-lg font-semibold tracking-tight text-sky-100">
                Traffic Ops
              </Link>
              <nav className="flex items-center gap-6 text-sm font-medium text-slate-300">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="transition hover:text-white">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
          <footer className="border-t border-white/5 bg-slate-900/50 text-center text-xs text-slate-400">
            <div className="mx-auto max-w-6xl px-6 py-4">
              Live corridor data refreshes every 10 seconds.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
