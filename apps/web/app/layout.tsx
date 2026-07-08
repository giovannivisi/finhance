import "./globals.css";

export const preferredRegion = "fra1";

export const metadata = {
  title: "Finhance",
  description: "Finance dashboard",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

import TabBar from "@components/TabBar";
import TopHeader from "@components/TopHeader";
import Sidebar from "@components/Sidebar";
import NavigationPrefetchCoordinator from "@components/NavigationPrefetchCoordinator";
import NavigationTransitionOverlay from "@components/NavigationTransitionOverlay";
import { ThemeProvider } from "@components/ThemeProvider";
import { headers } from "next/headers";

const themeScript = `
  (function() {
    try {
      var savedTheme = localStorage.getItem('finhance-theme');
      var theme = savedTheme || 'dark';
      var hideMoney = localStorage.getItem('finhance-hide-money') === 'true';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-hide-money', String(hideMoney));
    } catch (e) {}
  })();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="theme-script"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <ThemeProvider>
          <NavigationPrefetchCoordinator />
          <NavigationTransitionOverlay />
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
