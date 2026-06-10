// Design tokens mirroring the web app's design language (apps/web/app/globals.css).

export interface ThemeColors {
  // Brand & accents
  primary: string;
  primaryHover: string;
  income: string;
  expense: string;
  neutralAccent: string;

  // Backgrounds
  bgApp: string;
  bgCard: string;
  bgCardHover: string;
  bgCardMuted: string;
  bgControl: string;
  bgPopover: string;
  bgTabPill: string;
  bgTabActive: string;

  // Borders
  border: string;
  borderStrong: string;
  borderControl: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;

  // Surface states
  surfaceInfoBg: string;
  surfaceInfoBorder: string;
  surfaceSuccessBg: string;
  surfaceSuccessBorder: string;
  surfaceWarningBg: string;
  surfaceWarningBorder: string;
  surfaceDangerBg: string;
  surfaceDangerBorder: string;

  // Status accents (foregrounds on the surfaces above)
  info: string;
  success: string;
  warning: string;
  danger: string;

  // Charts
  chartGrid: string;
  chartAxis: string;
  chartIncome: string;
  chartExpense: string;
  chartNeutral: string;
  chartBudget: string;
  chartSpent: string;
  chartHistory: string;
}

export const darkColors: ThemeColors = {
  primary: "#10b981",
  primaryHover: "#059669",
  income: "#10b981",
  expense: "#f43f5e",
  neutralAccent: "#38bdf8",

  bgApp: "#050505",
  bgCard: "rgba(255, 255, 255, 0.04)",
  bgCardHover: "rgba(255, 255, 255, 0.06)",
  bgCardMuted: "rgba(255, 255, 255, 0.055)",
  bgControl: "rgba(255, 255, 255, 0.055)",
  bgPopover: "#121214",
  bgTabPill: "rgba(18, 18, 20, 0.94)",
  bgTabActive: "rgba(255, 255, 255, 0.16)",

  border: "rgba(255, 255, 255, 0.09)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  borderControl: "rgba(255, 255, 255, 0.13)",

  textPrimary: "#ffffff",
  textSecondary: "#a1a1aa",
  textTertiary: "#71717a",
  textOnPrimary: "#022c22",

  surfaceInfoBg: "rgba(14, 165, 233, 0.13)",
  surfaceInfoBorder: "rgba(56, 189, 248, 0.24)",
  surfaceSuccessBg: "rgba(16, 185, 129, 0.13)",
  surfaceSuccessBorder: "rgba(52, 211, 153, 0.26)",
  surfaceWarningBg: "rgba(245, 158, 11, 0.15)",
  surfaceWarningBorder: "rgba(251, 191, 36, 0.3)",
  surfaceDangerBg: "rgba(244, 63, 94, 0.13)",
  surfaceDangerBorder: "rgba(251, 113, 133, 0.28)",

  info: "#7dd3fc",
  success: "#6ee7b7",
  warning: "#fcd34d",
  danger: "#fda4af",

  chartGrid: "rgba(255, 255, 255, 0.08)",
  chartAxis: "rgba(255, 255, 255, 0.58)",
  chartIncome: "#10b981",
  chartExpense: "#f43f5e",
  chartNeutral: "#38bdf8",
  chartBudget: "#94a3b8",
  chartSpent: "#60a5fa",
  chartHistory: "#ffffff",
};

export const lightColors: ThemeColors = {
  primary: "#059669",
  primaryHover: "#047857",
  income: "#059669",
  expense: "#e11d48",
  neutralAccent: "#0284c7",

  bgApp: "#f4f4f5",
  bgCard: "#ffffff",
  bgCardHover: "#fcfcfc",
  bgCardMuted: "#f8fafc",
  bgControl: "#ffffff",
  bgPopover: "#ffffff",
  bgTabPill: "rgba(255, 255, 255, 0.97)",
  bgTabActive: "rgba(0, 0, 0, 0.08)",

  border: "rgba(0, 0, 0, 0.08)",
  borderStrong: "rgba(0, 0, 0, 0.15)",
  borderControl: "rgba(0, 0, 0, 0.1)",

  textPrimary: "#18181b",
  textSecondary: "#52525b",
  textTertiary: "#71717a",
  textOnPrimary: "#ffffff",

  surfaceInfoBg: "rgba(59, 130, 246, 0.08)",
  surfaceInfoBorder: "rgba(59, 130, 246, 0.18)",
  surfaceSuccessBg: "rgba(16, 185, 129, 0.08)",
  surfaceSuccessBorder: "rgba(16, 185, 129, 0.18)",
  surfaceWarningBg: "rgba(245, 158, 11, 0.12)",
  surfaceWarningBorder: "rgba(245, 158, 11, 0.22)",
  surfaceDangerBg: "rgba(244, 63, 94, 0.08)",
  surfaceDangerBorder: "rgba(244, 63, 94, 0.18)",

  info: "#0369a1",
  success: "#047857",
  warning: "#b45309",
  danger: "#be123c",

  chartGrid: "rgba(15, 23, 42, 0.08)",
  chartAxis: "rgba(51, 65, 85, 0.68)",
  chartIncome: "#059669",
  chartExpense: "#e11d48",
  chartNeutral: "#0284c7",
  chartBudget: "#94a3b8",
  chartSpent: "#2563eb",
  chartHistory: "#111827",
};

export const radius = {
  chip: 14,
  control: 18,
  card: 24,
  sheet: 28,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;
