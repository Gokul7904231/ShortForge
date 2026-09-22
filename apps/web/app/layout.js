import "./globals.css";
import { AuthProvider } from "@/lib/auth/providers";
import Script from "next/script";

export const metadata = {
  title: "ShortForge — Forge viral Shorts",
  description: "Enterprise Automated Content Generation & Quality Orchestration Engine",
  icons: {
    icon: [
      {
        url: "/favicon-black.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon-white.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    shortcut: "/favicon-black.png",
    apple: "/favicon-black.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon-black.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon-white.png" media="(prefers-color-scheme: dark)" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
        <Script
          id="theme-favicon-resolver"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = JSON.parse(localStorage.getItem('shortfactory-theme-preference') || '{}');
                var theme = stored.state && stored.state.theme ? stored.state.theme : 'dark';
                var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                var resolvedFavicon = isDark ? '/favicon-white.png' : '/favicon-black.png';
                var links = document.querySelectorAll("link[rel*='icon']");
                links.forEach(function(l) { l.removeAttribute('media'); l.href = resolvedFavicon; });
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="bg-[#f5f5f7] dark:bg-zinc-950 text-[#1d1d1f] dark:text-zinc-50 font-body-base antialiased min-h-screen w-full selection:bg-[#0071e3]/20" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
