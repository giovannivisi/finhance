import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TopHeader from "@components/TopHeader";

const { authMock, headersMock, hostedModeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  headersMock: vi.fn(),
  hostedModeMock: vi.fn(),
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/auth", () => ({
  auth: authMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@components/ShellAccountMenu", () => ({
  default: ({
    accountEmail,
    canSignOut,
    identity,
  }: {
    accountEmail?: string;
    canSignOut?: boolean;
    identity: { title: string; subtitle: string };
  }) => (
    <div>
      <span>{identity.title}</span>
      <span>{identity.subtitle}</span>
      <span>{canSignOut ? "can sign out" : "cannot sign out"}</span>
      <span>
        {accountEmail ? "can delete account" : "cannot delete account"}
      </span>
    </div>
  ),
}));

vi.mock("next/link", () => ({
  default: (
    props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
      prefetch?: boolean;
    },
  ) => {
    const { children, href, prefetch, ...rest } = props;
    void prefetch;

    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", props),
}));

describe("TopHeader", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    headersMock.mockReset();
    headersMock.mockResolvedValue(new Headers());
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(false);
  });

  it("links the wordmark to home so the redirect can resolve the start page", async () => {
    render(await TopHeader());

    expect(screen.getByRole("link", { name: /finhance/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("renders hosted auth links when hosted authentication is enabled without a session", async () => {
    hostedModeMock.mockReturnValue(true);

    render(await TopHeader());

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/signup");
  });

  it("renders hosted user identity when a session exists", async () => {
    hostedModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Giovanni Visi",
        email: "giovanni@example.com",
      },
    });

    render(await TopHeader());

    expect(screen.getByText("Giovanni Visi")).toBeInTheDocument();
    expect(screen.getByText("giovanni@example.com")).toBeInTheDocument();
    expect(screen.getByText("can sign out")).toBeInTheDocument();
    expect(screen.getByText("can delete account")).toBeInTheDocument();
  });

  it("does not prompt for login after account deletion", async () => {
    hostedModeMock.mockReturnValue(true);
    headersMock.mockResolvedValue(
      new Headers({ "x-finhance-pathname": "/account-deleted" }),
    );

    render(await TopHeader());

    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });
});
