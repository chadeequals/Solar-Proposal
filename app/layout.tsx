import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sundial — Instant Solar Proposals | Victory Energy",
  description:
    "Get a professional solar proposal for your home in minutes. See your exact system size, savings, and financing options — instantly.",
  keywords: "solar panels, solar quote, solar proposal, home solar, solar savings, Victory Energy",
  openGraph: {
    title: "Sundial — Instant Solar Proposals",
    description: "Your personalized solar proposal, generated in real time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Google Fonts loaded inline — Next.js App Router doesn't use _document */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Sundial favicon — minimal sun SVG */}
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='6' fill='%23f59e0b'/><line x1='16' y1='2' x2='16' y2='8' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/><line x1='16' y1='24' x2='16' y2='30' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/><line x1='2' y1='16' x2='8' y2='16' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/><line x1='24' y1='16' x2='30' y2='16' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/><line x1='6.1' y1='6.1' x2='10.3' y2='10.3' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/><line x1='21.7' y1='21.7' x2='25.9' y2='25.9' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/><line x1='25.9' y1='6.1' x2='21.7' y2='10.3' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/><line x1='10.3' y1='21.7' x2='6.1' y2='25.9' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round'/></svg>"
        />
      </head>
      <body className="min-h-screen bg-navy-900 text-slate-200 bg-solar-grid">
        {/* Radial glow at top for atmosphere */}
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center top, rgba(245,158,11,0.06) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />
        {children}
      </body>
    </html>
  );
}
