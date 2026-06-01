"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import OverflowMenu from "@components/OverflowMenu";
import {
  buildShellAccountMenuSections,
  type ShellAccountIdentity,
  type ShellAccountMenuAction,
} from "@lib/shell-account-menu";
import { useAppPreferences } from "@components/ThemeProvider";

function deriveInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "F";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

function AccountMenuActionItem({
  action,
  closeMenu,
  onToggleTheme,
}: {
  action: ShellAccountMenuAction;
  closeMenu: (options?: { restoreFocus?: boolean }) => void;
  onToggleTheme: () => void;
}) {
  const Icon = action.icon;

  if (action.type === "link") {
    return (
      <Link
        href={action.href}
        role="menuitem"
        className="overflow-menu-item shell-account-menu-item"
        onClick={() => closeMenu()}
      >
        <span className="shell-account-menu-icon-frame" aria-hidden="true">
          <Icon size={16} className="shell-account-menu-icon" />
        </span>
        <span>{action.label}</span>
      </Link>
    );
  }

  if (action.type === "button") {
    return (
      <button
        type="button"
        role="menuitem"
        className="overflow-menu-item shell-account-menu-item"
        aria-label={action.ariaLabel}
        onClick={() => {
          onToggleTheme();
          closeMenu();
        }}
      >
        <span className="shell-account-menu-icon-frame" aria-hidden="true">
          <Icon size={16} className="shell-account-menu-icon" />
        </span>
        <span>{action.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled
      aria-label={action.disabledReason}
      className="overflow-menu-item shell-account-menu-item"
    >
      <span className="shell-account-menu-icon-frame" aria-hidden="true">
        <Icon size={16} className="shell-account-menu-icon" />
      </span>
      <span>{action.label}</span>
    </button>
  );
}

export default function ShellAccountMenu({
  identity,
}: {
  identity: ShellAccountIdentity;
}) {
  const { theme, toggleTheme } = useAppPreferences();
  const sections = buildShellAccountMenuSections({ theme });
  const initials = deriveInitials(identity.title);

  return (
    <OverflowMenu
      label="Account menu"
      panelClassName="shell-account-menu-panel"
      renderTrigger={({ isOpen, triggerProps, setTriggerNode }) => (
        <button
          {...triggerProps}
          ref={setTriggerNode}
          className={`shell-account-menu-trigger${isOpen ? " is-open" : ""}`}
          aria-label={isOpen ? "Close account menu" : "Open account menu"}
        >
          <span className="shell-account-menu-avatar">
            <span className="shell-account-menu-avatar-copy">{initials}</span>
          </span>
          <span className="shell-account-menu-trigger-mark" aria-hidden="true">
            <ChevronDown
              size={14}
              className="shell-account-menu-trigger-icon"
            />
          </span>
        </button>
      )}
    >
      {({ closeMenu }) => (
        <div className="shell-account-menu-content">
          <div className="shell-account-menu-identity">
            <div className="shell-account-menu-identity-row">
              <span
                className="shell-account-menu-identity-avatar"
                aria-hidden="true"
              >
                {initials}
              </span>
              <div className="shell-account-menu-identity-copy">
                <p className="shell-account-menu-kicker">Account</p>
                <p className="shell-account-menu-title">{identity.title}</p>
              </div>
            </div>
            <p className="shell-account-menu-subtitle">{identity.subtitle}</p>
          </div>

          {sections.map((section) => (
            <section key={section.key} className="shell-account-menu-section">
              <p className="shell-account-menu-section-title">
                {section.title}
              </p>
              <div className="shell-account-menu-section-items">
                {section.items.map((action) => (
                  <AccountMenuActionItem
                    key={action.key}
                    action={action}
                    closeMenu={closeMenu}
                    onToggleTheme={toggleTheme}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </OverflowMenu>
  );
}
