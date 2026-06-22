import {
  FileText,
  LogOut,
  MonitorCog,
  Moon,
  Settings,
  Sun,
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
  action: "toggle-theme" | "sign-out";
  icon: LucideIcon;
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
}): ShellAccountMenuSection[] {
  const sections: ShellAccountMenuSection[] = [
    {
      key: "workspace",
      title: "Workspace",
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
  ];

  if (input.canSignOut) {
    sections.push({
      key: "account",
      title: "Account",
      items: [
        {
          type: "button",
          key: "sign-out",
          label: "Log out",
          ariaLabel: "Log out",
          action: "sign-out",
          icon: LogOut,
        },
      ],
    });
  }

  return sections;
}
