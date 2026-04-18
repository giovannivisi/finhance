"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PieChart, ArrowLeftRight, CreditCard } from "lucide-react";

const TABS = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "History", href: "/history", icon: PieChart },
  { name: "Payments", href: "/transactions", icon: ArrowLeftRight },
  { name: "Analytics", href: "/assets", icon: CreditCard },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="tab-bar-nav">
      <div className="glass-card tab-bar-inner">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            pathname === tab.href || pathname?.startsWith(tab.href + "/");

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`tab-item ${isActive ? "active" : ""}`}
            >
              <div className="tab-icon-wrapper">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="tab-label">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
