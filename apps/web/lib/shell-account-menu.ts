import {
  FileText,
  LogOut,
  MonitorCog,
  Moon,
  Settings,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";

export interface ShellAccountIdentity {
  title: string;
  subtitle: string;
}

export interface ShellAccountMenuLinkAction {
  type: "link";
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface ShellAccountMenuButtonAction {
  type: "button";
  key: string;
  label: string;
  ariaLabel: string;
  action: "toggle-theme" | "sign-out" | "delete-account";
  icon: LucideIcon;
  tone?: "danger";
}

export interface ShellAccountMenuPlaceholderAction {
  type: "placeholder";
  key: string;
  label: string;
  icon: LucideIcon;
  disabledReason: string;
}

export type ShellAccountMenuAction =
  | ShellAccountMenuLinkAction
  | ShellAccountMenuButtonAction
  | ShellAccountMenuPlaceholderAction;

export interface ShellAccountMenuSection {
  key: string;
  title: string;
  items: ShellAccountMenuAction[];
}

export function buildShellAccountMenuSections(input: {
  theme: "light" | "dark";
  canSignOut?: boolean;
  canDeleteAccount?: boolean;
}): ShellAccountMenuSection[] {
  const sections: ShellAccountMenuSection[] = [
    {
      key: "settings",
      title: "Settings",
      items: [
        {
          type: "link",
          key: "user-settings",
          label: "User settings",
          href: "/settings/user",
          icon: Settings,
        },
        {
          type: "placeholder",
          key: "app-settings",
          label: "App settings (soon)",
          icon: MonitorCog,
          disabledReason: "App settings will land in a later pass.",
        },
      ],
    },
    {
      key: "appearance",
      title: "Appearance",
      items: [
        {
          type: "button",
          key: "theme",
          label: input.theme === "dark" ? "Light mode" : "Dark mode",
          ariaLabel:
            input.theme === "dark"
              ? "Switch to light mode"
              : "Switch to dark mode",
          action: "toggle-theme",
          icon: input.theme === "dark" ? Sun : Moon,
        },
      ],
    },
    {
      key: "legal",
      title: "Legal",
      items: [
        {
          type: "link",
          key: "privacy",
          label: "Privacy notice",
          href: "/privacy",
          icon: FileText,
        },
      ],
    },
  ];

  const accountItems: ShellAccountMenuAction[] = [];

  if (input.canSignOut) {
    accountItems.push({
      type: "button",
      key: "sign-out",
      label: "Log out",
      ariaLabel: "Log out",
      action: "sign-out",
      icon: LogOut,
    });
  }

  if (input.canDeleteAccount) {
    accountItems.push({
      type: "button",
      key: "delete-account",
      label: "Delete account",
      ariaLabel: "Delete account",
      action: "delete-account",
      icon: Trash2,
      tone: "danger",
    });
  }

  if (accountItems.length > 0) {
    sections.push({
      key: "account",
      title: "Account",
      items: accountItems,
    });
  }

  return sections;
}
