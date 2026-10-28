import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Screen, type ScreenProps } from "./screen";

const mocks = vi.hoisted(() => ({
  canGoBack: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  onBack: null as (() => void) | null,
}));
vi.mock("expo-router", () => ({ useRouter: () => mocks }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) =>
    React.createElement("div", null, children),
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) =>
    React.createElement("div", null, children),
  ScrollView: ({ children }: { children: ReactNode }) =>
    React.createElement("div", { "data-scroll": true }, children),
  Platform: { OS: "ios" },
  RefreshControl: () => null,
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34 }),
}));
vi.mock("react-native-svg", () => ({
  default: () => null,
  Defs: () => null,
  RadialGradient: () => null,
  Rect: () => null,
  Stop: () => null,
}));
vi.mock("@/theme", () => ({
  spacing: { md: 12, lg: 16, xl: 24, xxl: 32 },
  useTheme: () => ({ colors: {}, scheme: "light" }),
}));
vi.mock("./text", () => ({
  AppText: ({ children }: { children: ReactNode }) =>
    React.createElement("span", null, children),
}));
vi.mock("./button", () => ({
  IconButton: ({ onPress }: { onPress: () => void }) => {
    mocks.onBack = onPress;
    return React.createElement("button", null, "Go back");
  },
}));

function renderScreen(fixedHeader: boolean) {
  const props: ScreenProps = {
    title: "Privacy notice",
    showBack: true,
    fixedHeader,
    children: "Notice body",
  };
  return renderToStaticMarkup(React.createElement(Screen, props));
}

describe("fixed screen header", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the back button outside the scroll area only when requested", () => {
    const fixed = renderScreen(true);
    expect(fixed.indexOf("Go back")).toBeLessThan(
      fixed.indexOf('data-scroll="true"'),
    );
    const normal = renderScreen(false);
    expect(normal.indexOf("Go back")).toBeGreaterThan(
      normal.indexOf('data-scroll="true"'),
    );
  });

  it("goes back to the previous screen or falls back to the app entry route", () => {
    mocks.canGoBack.mockReturnValue(true);
    renderScreen(true);
    mocks.onBack!();
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.canGoBack.mockReturnValue(false);
    mocks.onBack!();
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });
});
