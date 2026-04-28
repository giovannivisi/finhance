import "./globals.css";

export const metadata = {
  title: "Finhance",
  description: "Finance dashboard",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

import TabBar from "@components/TabBar";
import TopHeader from "@components/TopHeader";
import Sidebar from "@components/Sidebar";
import { ThemeProvider } from "@components/ThemeProvider";
import Script from "next/script";

const themeScript = `
  (function() {
    try {
      var savedTheme = localStorage.getItem('finhance-theme');
      var theme = savedTheme || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <ThemeProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <div className="layout-app">
            <TopHeader />
            <div className="layout-shell">
              <Sidebar />
              <main id="main" className="layout-main">
                {children}
              </main>
            </div>
            <TabBar />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
