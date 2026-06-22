import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthPageClient from "@components/AuthPageClient";

const { oauthSignInMock, passkeySignInMock } = vi.hoisted(() => ({
  oauthSignInMock: vi.fn(),
  passkeySignInMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: oauthSignInMock,
}));

vi.mock("next-auth/webauthn", () => ({
  signIn: passkeySignInMock,
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

describe("AuthPageClient", () => {
  beforeEach(() => {
    oauthSignInMock.mockReset();
    oauthSignInMock.mockResolvedValue(undefined);
    passkeySignInMock.mockReset();
    passkeySignInMock.mockResolvedValue(undefined);
  });

  it("renders landing calls to action and starts Google sign-in", async () => {
    const user = userEvent.setup();

    render(<AuthPageClient mode="landing" callbackUrl="/dashboard" />);

    expect(
      screen.getByRole("heading", { name: "finhance" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(oauthSignInMock).toHaveBeenCalledWith("google", {
      redirectTo: "/dashboard",
    });
  });

  it("starts GitHub sign-in from signup", async () => {
    const user = userEvent.setup();

    render(<AuthPageClient mode="signup" callbackUrl="/dashboard" />);

    await user.click(
      screen.getByRole("button", { name: /create with github/i }),
    );

    expect(oauthSignInMock).toHaveBeenCalledWith("github", {
      redirectTo: "/dashboard",
    });
  });

  it("starts passkey sign-in from the login page", async () => {
    const user = userEvent.setup();

    render(<AuthPageClient mode="login" callbackUrl="/review" />);

    await user.click(
      screen.getByRole("button", { name: /log in with passkey/i }),
    );

    await waitFor(() => {
      expect(passkeySignInMock).toHaveBeenCalledWith("passkey", {
        redirectTo: "/review",
      });
    });
    expect(
      screen.getByRole("link", { name: /create account/i }),
    ).toHaveAttribute("href", "/signup");
  });
});
