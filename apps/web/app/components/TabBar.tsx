"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileText, MoreHorizontal, Moon, Sun } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useTheme } from "@components/ThemeProvider";
import {
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  isActivePath,
  isRedundantTabNavigation,
} from "@lib/navigation";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TAB_COUNT = PRIMARY_NAV_ITEMS.length + 1;

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);

  const currentPath = pathname ?? "/";
  const activePendingPath = isPending ? pendingPath : null;
  const activePrimaryIndex = PRIMARY_NAV_ITEMS.findIndex((item) =>
    isActivePath(currentPath, item.href),
  );
  const moreIsActive =
    activePrimaryIndex === -1 ||
    SECONDARY_NAV_ITEMS.some((item) => isActivePath(currentPath, item.href));
  const visualActiveIndex = showMore
    ? PRIMARY_NAV_ITEMS.length
    : activePrimaryIndex === -1
      ? PRIMARY_NAV_ITEMS.length
      : activePrimaryIndex;

  useEffect(() => {
    if (!showMore) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMore(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowMore(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMore]);

  function handleNavigate(nextPath: string) {
    if (
      isRedundantTabNavigation({
        currentPath,
        targetPath: nextPath,
        pendingPath: activePendingPath,
      })
    ) {
      setShowMore(false);
      return;
    }

    setPendingPath(nextPath);
    setShowMore(false);
    startTransition(() => {
      router.push(nextPath);
    });
  }

  return (
    <nav aria-label="Primary" className="tab-bar-nav">
      <div ref={menuRef} className="tab-bar-menu-anchor">
        <AnimatePresence>
          {showMore ? (
            <motion.div
              id="revolut-more-panel"
              aria-label="More navigation"
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 12, scale: 0.96 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 12, scale: 0.96 }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { type: "spring", damping: 24, stiffness: 380 }
              }
              className="tab-more-panel"
            >
              {SECONDARY_NAV_ITEMS.map((item) => {
                const isActive = isActivePath(currentPath, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={(event) => {
                      event.preventDefault();
                      handleNavigate(item.href);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className="tab-menu-link group"
                  >
                    <item.icon
                      size={18}
                      aria-hidden="true"
                      className="tab-menu-icon"
                    />
                    <span className="tab-menu-label">{item.label}</span>
                  </Link>
                );
              })}

              <div className="tab-more-divider" aria-hidden="true" />

              <Link
                href="/privacy"
                prefetch={false}
                onClick={(event) => {
                  event.preventDefault();
                  handleNavigate("/privacy");
                }}
                aria-current={
                  isActivePath(currentPath, "/privacy") ? "page" : undefined
                }
                className="tab-menu-link group"
              >
                <FileText
                  size={18}
                  aria-hidden="true"
                  className="tab-menu-icon"
                />
                <span className="tab-menu-label">Privacy notice</span>
              </Link>

              <div className="tab-more-divider" aria-hidden="true" />

              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                  setShowMore(false);
                }}
                aria-label={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
                className="tab-menu-link group"
              >
                {theme === "dark" ? (
                  <Sun size={18} aria-hidden="true" className="tab-menu-icon" />
                ) : (
                  <Moon
                    size={18}
                    aria-hidden="true"
                    className="tab-menu-icon"
                  />
                )}
                <span className="tab-menu-label">
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </span>
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="tab-bar-pill">
          <motion.div
            aria-hidden="true"
            className="tab-active-pill"
            animate={{
              left: `${(visualActiveIndex / TAB_COUNT) * 100}%`,
              width: `${100 / TAB_COUNT}%`,
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 360, damping: 30, mass: 0.75 }
            }
          >
            <div className="pill-sheen" />
          </motion.div>

          {PRIMARY_NAV_ITEMS.map((item, index) => {
            const isActive = isActivePath(currentPath, item.href);
            const isBlocked = isRedundantTabNavigation({
              currentPath,
              targetPath: item.href,
              pendingPath: activePendingPath,
            });

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={isBlocked}
                onClick={(event) => {
                  event.preventDefault();
                  handleNavigate(item.href);
                }}
                className={cn(
                  "tab-bar-link",
                  visualActiveIndex === index ? "is-active" : "is-inactive",
                )}
              >
                <item.icon
                  size={22}
                  strokeWidth={visualActiveIndex === index ? 2.5 : 2}
                  aria-hidden="true"
                />
              </Link>
            );
          })}

          <button
            type="button"
            aria-label="More navigation"
            aria-expanded={showMore}
            aria-haspopup="true"
            aria-controls="revolut-more-panel"
            onClick={() => setShowMore((current) => !current)}
            className={cn(
              "tab-bar-link tab-more-btn",
              showMore || moreIsActive ? "is-active" : "is-inactive",
            )}
          >
            <MoreHorizontal
              size={22}
              strokeWidth={showMore || moreIsActive ? 2.5 : 2}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </nav>
  );
}
