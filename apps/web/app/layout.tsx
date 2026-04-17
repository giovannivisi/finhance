import "./globals.css";
import { Manrope, Inter } from "next/font/google";
import { ThemeProvider } from "./providers";
import { BottomTabBar } from "./components/navigation/BottomTabBar";

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
          <div className="flex flex-col min-h-screen pb-24 lg:flex-row lg:pb-0 mx-auto max-w-[1200px]">
            {/* Desktop Sidebar / Header */}
            {/* Main Content Area */}
            <main className="flex-1 w-full p-4 md:p-8 overflow-hidden">
              {children}
            </main>
            <BottomTabBar />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
