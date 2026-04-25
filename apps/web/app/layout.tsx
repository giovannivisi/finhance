import "./globals.css";

export const metadata = {
  title: "Finhance",
  description: "Finance dashboard",
};

import Sidebar from "@components/Sidebar";
import TopHeader from "@components/TopHeader";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="layout-app">
          <TopHeader />
          <Sidebar />
          <main className="layout-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
