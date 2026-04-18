"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "../ThemeToggle";
import { Home, PieChart, ArrowLeftRight, Settings } from "lucide-react";

const NAV_LINKS = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Portfolio", href: "/portfolio", icon: PieChart },
  { name: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar-container">
      <div className="sidebar-header">
        <div className="flex-row items-center gap-3">
          <div className="avatar">
            <span className="font-heading font-bold" style={{ color: "white" }}>
              GV
            </span>
          </div>
          <div className="flex-col">
            <h1
              className="text-body font-bold text-gradient"
              style={{ letterSpacing: "-0.02em" }}
            >
              Finhance
            </h1>
            <p className="text-xs text-secondary">Elite Member</p>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_LINKS.map((link) => {
          const Icon = link.icon;
          const isActive =
            pathname === link.href ||
            (link.href !== "/" && pathname?.startsWith(link.href));

          return (
            <Link
              key={link.name}
              href={link.href}
              className={`sidebar-link ${isActive ? "active" : ""}`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span>{link.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle />
        <Link
          href="/transactions?new=true"
          className="btn btn-primary"
          style={{ width: "100%" }}
        >
          Add Transaction
        </Link>
      </div>
    </aside>
  );
}
