import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TopHeader from "@components/TopHeader";

const { hostedModeMock } = vi.hoisted(() => ({
  hostedModeMock: vi.fn(),
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
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
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(false);
  });

  it("links the wordmark to home so the redirect can resolve the start page", () => {
    render(<TopHeader />);

    expect(screen.getByRole("link", { name: /finhance/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("renders hosted workspace identity when hosted authentication is enabled", () => {
    hostedModeMock.mockReturnValue(true);

    render(<TopHeader />);

    expect(screen.getByText("Hosted workspace")).toBeInTheDocument();
    expect(screen.getByText("Account and app actions")).toBeInTheDocument();
  });
});
