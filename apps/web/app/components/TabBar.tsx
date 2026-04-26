"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  History,
  MoreHorizontal,
  TrendingUp,
  PieChart,
  Repeat,
  ClipboardCheck,
  Tag,
  Upload,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@components/ThemeProvider";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
  { href: "/accounts", label: "Wallets", icon: Wallet },
  { href: "/history", label: "History", icon: History },
] as const;

const MORE_ITEMS = [
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/import", label: "Import", icon: Upload },
] as const;

export default function TabBar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowMore(false);
  }, [pathname]);

  // Click outside to close "More" menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMore(false);
      }
    }

    if (showMore) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMore]);

  const glassStyle = {
    backgroundColor:
      theme === "light"
        ? "rgba(255, 255, 255, 0.15)"
        : "rgba(10, 10, 10, 0.22)",
    backdropFilter: "blur(64px) saturate(140%)",
    WebkitBackdropFilter: "blur(64px) saturate(140%)",
    border: `0.5px solid ${theme === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.1)"}`,
    borderRadius: "100px",
    boxShadow:
      theme === "light"
        ? "0 10px 40px rgba(0, 0, 0, 0.04)"
        : "0 12px 40px rgba(0, 0, 0, 0.3)",
  };

  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href),
  );

  return (
    <div className="fixed bottom-10 left-0 right-0 z-50 pointer-events-none flex justify-center">
      <motion.div
        ref={menuRef}
        drag
        dragConstraints={{ left: -150, right: 150, top: -150, bottom: 50 }}
        dragElastic={0.1}
        whileDrag={{ scale: 1.05, cursor: "grabbing" }}
        className="pointer-events-auto relative"
      >
        {/* Nuclear Style Override for True Glass Pill */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          #revolut-tabbar {
            background-color: ${theme === "light" ? "rgba(255, 255, 255, 0.15)" : "rgba(10, 10, 10, 0.22)"} !important;
            backdrop-filter: blur(64px) saturate(140%) !important;
            -webkit-backdrop-filter: blur(64px) saturate(140%) !important;
            border: 0.5px solid ${theme === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.1)"} !important;
            border-radius: 9999px !important;
            box-shadow: ${
              theme === "light"
                ? "0 10px 40px rgba(0, 0, 0, 0.04)"
                : "0 12px 40px rgba(0, 0, 0, 0.3)"
            } !important;
          }
          #revolut-more-panel {
            background-color: ${theme === "light" ? "rgba(255, 255, 255, 0.2)" : "rgba(10, 10, 10, 0.3)"} !important;
            backdrop-filter: blur(64px) saturate(140%) !important;
            -webkit-backdrop-filter: blur(64px) saturate(140%) !important;
            border: 0.5px solid ${theme === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.1)"} !important;
            border-radius: 24px !important;
          }
          [data-theme="dark"] #revolut-more-panel span,
          [data-theme="dark"] #revolut-more-panel svg {
            color: rgba(255, 255, 255, 0.9) !important;
          }
          [data-theme="dark"] #revolut-more-panel .group:hover span,
          [data-theme="dark"] #revolut-more-panel .group:hover svg {
            color: #ffffff !important;
          }
          [data-theme="dark"] .more-btn-icon {
            color: rgba(255, 255, 255, 0.7) !important;
          }
          [data-theme="dark"] .more-btn-icon:hover {
            color: #ffffff !important;
          }
          [data-theme="light"] .more-btn-icon {
            color: rgba(0, 0, 0, 0.4) !important;
          }
          [data-theme="light"] .more-btn-icon:hover {
            color: #000000 !important;
          }
        `,
          }}
        />

        {/* More Menu Popover */}
        <AnimatePresence>
          {showMore && (
            <motion.div
              id="revolut-more-panel"
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="absolute bottom-full mb-5 right-0 min-w-[180px] p-2 flex flex-col gap-1 overflow-hidden"
            >
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-[var(--tab-bg-highlight)] group"
                >
                  <item.icon
                    size={18}
                    className="text-[var(--tab-icon-inactive)] group-hover:text-[var(--tab-icon-hover)]"
                  />
                  <span className="text-[13px] font-medium text-[var(--tab-icon-inactive)] group-hover:text-[var(--tab-icon-hover)]">
                    {item.label}
                  </span>
                </Link>
              ))}

              <div
                className="h-px bg-[var(--tab-border)] my-1 mx-2"
                style={{ opacity: 0.5 }}
              />

              {/* Theme Toggle */}
              <button
                onClick={() => toggleTheme()}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--tab-bg-highlight)] transition-colors group"
              >
                {theme === "dark" ? (
                  <Sun size={18} className="text-amber-400" />
                ) : (
                  <Moon size={18} className="text-indigo-400" />
                )}
                <span className="text-[13px] font-medium text-[var(--tab-icon-inactive)] group-hover:text-[var(--tab-icon-hover)]">
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Tab Bar Container */}
        <div
          id="revolut-tabbar"
          className="relative flex items-center p-2 gap-1 cursor-grab active:cursor-grabbing"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Magic Slider Background */}
          <div className="absolute inset-2 flex pointer-events-none">
            <AnimatePresence>
              {(hoveredIndex !== null || activeIndex !== -1) && (
                <motion.div
                  layoutId="tab-highlight"
                  className="absolute h-full rounded-full bg-[var(--tab-bg-highlight)]"
                  initial={false}
                  animate={{
                    left: `${(hoveredIndex !== null ? hoveredIndex : activeIndex) * (100 / (NAV_ITEMS.length + 1))}%`,
                    width: `${100 / (NAV_ITEMS.length + 1)}%`,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 450,
                    damping: 35,
                    mass: 1,
                  }}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Tab Items */}
          {NAV_ITEMS.map((item, idx) => {
            const isActive = activeIndex === idx;
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHoveredIndex(idx)}
                className={cn(
                  "relative flex items-center justify-center w-14 h-14 rounded-full transition-all active:scale-90",
                  isActive
                    ? "text-[var(--tab-icon-active)]"
                    : "text-[var(--tab-icon-inactive)] hover:text-[var(--tab-icon-hover)]",
                )}
              >
                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {isActive && (
                  <motion.div
                    layoutId="active-dot"
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                  />
                )}
              </Link>
            );
          })}

          {/* More Button */}
          <button
            onClick={() => setShowMore(!showMore)}
            onMouseEnter={() => setHoveredIndex(NAV_ITEMS.length)}
            className={cn(
              "relative flex items-center justify-center w-14 h-14 rounded-full transition-all active:scale-90 more-btn-icon",
              showMore
                ? "text-[var(--tab-icon-active)]"
                : "text-[var(--tab-icon-inactive)] hover:text-[var(--tab-icon-hover)]",
            )}
          >
            <MoreHorizontal size={22} strokeWidth={showMore ? 2.5 : 2} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
