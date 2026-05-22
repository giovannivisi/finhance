import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TopHeader from "@components/TopHeader";

const { authMock, hostedModeMock, settingsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  hostedModeMock: vi.fn(),
  settingsMock: vi.fn(),
}));

vi.mock("@lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/server-user-settings", () => ({
  getUserSettingsOrDefaults: settingsMock,
}));

vi.mock("@components/ShellAccountMenu", () => ({
  default: ({
    identity,
  }: {
    identity: { title: string; subtitle: string };
  }) => (
    <div>
      <span>{identity.title}</span>
      <span>{identity.subtitle}</span>
    </div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

describe("TopHeader", () => {
  beforeEach(() => {
    authMock.mockReset();
    hostedModeMock.mockReset();
    settingsMock.mockReset();
    hostedModeMock.mockReturnValue(false);
    settingsMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "BROKERAGE",
    });
  });

  it("links the wordmark to the configured start page", async () => {
    render(await TopHeader());

    expect(screen.getByRole("link", { name: /finhance/i })).toHaveAttribute(
      "href",
      "/brokerage",
    );
  });

  it("renders hosted identity when authentication is enabled", async () => {
    hostedModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({
      user: {
        name: "Giovanni Visi",
        email: "giovanni@example.com",
      },
    });

    render(await TopHeader());

    expect(screen.getByText("Giovanni Visi")).toBeInTheDocument();
    expect(screen.getByText("giovanni@example.com")).toBeInTheDocument();
  });
});
