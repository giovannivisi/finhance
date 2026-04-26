import "./globals.css";

export const metadata = {
  title: "Finhance",
  description: "Finance dashboard",
};

import TabBar from "@components/TabBar";
import TopHeader from "@components/TopHeader";
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
          <div className="layout-app">
            <TopHeader />
            <main className="layout-main">{children}</main>
            <TabBar />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
