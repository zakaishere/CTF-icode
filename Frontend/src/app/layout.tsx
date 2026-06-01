import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { ToastContainer } from "@/components/ui/PSPToast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageTransition } from "@/components/ui/PageTransition";
import "./globals.css";

export const metadata: Metadata = {
  title: "iCODE CTF — Capture The Flag Platform",
  description: "Prepare. Solve. Capture. Compete in CTF challenges and sharpen your security skills.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('icode-ctf-theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
        {/* iCODE CTF design system fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icode-logo.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>
          <ErrorBoundary context="RootLayout">
            <PageTransition>
              {children}
            </PageTransition>
          </ErrorBoundary>
        </Providers>
        <ToastContainer />
      </body>
    </html>
  );
}
