import "./globals.css";
import { Manrope, Inter } from "next/font/google";
import { ThemeProvider } from "./providers";
import { BottomTabBar } from "./components/navigation/BottomTabBar";
import { Sidebar } from "./components/navigation/Sidebar";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Finhance - Luminous Precision",
  description: "Finance dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${manrope.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="app-container">
            <Sidebar />
            {/* Main Content Area */}
            <main className="main-content">{children}</main>
            <BottomTabBar />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
