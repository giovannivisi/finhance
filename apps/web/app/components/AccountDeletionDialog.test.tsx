import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountDeletionDialog from "@components/AccountDeletionDialog";

const { fetchMock, signOutMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

describe("AccountDeletionDialog", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
  });

  it("requires the exact account email before permanent deletion", async () => {
    const user = userEvent.setup();

    render(
      <AccountDeletionDialog
        email="person@example.com"
        open
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/permanently deletes the account/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/linked sign-in providers/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue to deletion" }),
    );

    const deleteButton = screen.getByRole("button", {
      name: "Permanently delete account",
    });
    const emailInput = screen.getByRole("textbox", { name: "Account email" });

    expect(deleteButton).toBeDisabled();
    await user.type(emailInput, "Person@example.com");
    expect(deleteButton).toBeDisabled();
    await user.clear(emailInput);
    await user.type(emailInput, "person@example.com");
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);

    expect(fetchMock).toHaveBeenCalledWith("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "person@example.com" }),
    });
    expect(signOutMock).toHaveBeenCalledWith({
      redirectTo: "/account-deleted",
    });
  });

  it("keeps the confirmation open when deletion fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      Response.json(
        { message: "Sign in again before continuing." },
        { status: 403 },
      ),
    );

    render(
      <AccountDeletionDialog
        email="person@example.com"
        open
        onClose={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continue to deletion" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Account email" }),
      "person@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Permanently delete account" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in again before continuing.",
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
