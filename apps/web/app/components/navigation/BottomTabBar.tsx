"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PieChart, ArrowLeftRight, CreditCard, User } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TABS = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "History", href: "/history", icon: PieChart },
  { name: "Payments", href: "/transactions", icon: ArrowLeftRight },
  { name: "Analytics", href: "/assets", icon: CreditCard },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-4 right-4 z-50 lg:hidden px-2 pt-2">
      {/* Glassmorphic Container, adhering to Luminous Precision token rules */}
      <div className="glass shadow-ambient flex items-center justify-between rounded-full px-6 py-4 outline outline-1 outline-outlineVariant/15">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            pathname === tab.href || pathname?.startsWith(tab.href + "/");

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center space-y-1 w-16 transition-all duration-300",
                isActive
                  ? "text-primary scale-110"
                  : "text-onSurfaceVariant hover:text-onSurface",
              )}
            >
              <div
                className={cn(
                  "p-2 rounded-full transition-colors",
                  isActive && "bg-surfaceContainerLowest shadow-sm",
                )}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span
                className={cn(
                  "text-[10px] font-sans font-medium tracking-wide",
                  isActive
                    ? "opacity-100"
                    : "opacity-0 h-0 w-0 overflow-hidden",
                )}
              >
                {tab.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
