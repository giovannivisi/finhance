import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserSettingsPageClient from "@components/UserSettingsPageClient";
import { apiMutation } from "@lib/api";

const refreshMock = vi.fn();

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

const mockedApiMutation = vi.mocked(apiMutation);

describe("UserSettingsPageClient", () => {
  beforeEach(() => {
    mockedApiMutation.mockReset();
    refreshMock.mockReset();
  });

  it("renders the current settings and saves updates", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue({
      showTransactionTimes: false,
      startPage: "BROKERAGE",
      reportingCurrency: "USD",
    });

    render(
      <UserSettingsPageClient
        initialSettings={{
          showTransactionTimes: true,
          startPage: "DASHBOARD",
          reportingCurrency: "EUR",
        }}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByLabelText("Open this page first")).toHaveValue("DASHBOARD");

    await user.click(screen.getByRole("checkbox"));
    await user.selectOptions(screen.getByLabelText("Open this page first"), "BROKERAGE");
    await user.click(
      screen.getByRole("button", { name: /save user settings/i }),
    );

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/users/me/settings", {
        method: "PATCH",
        body: JSON.stringify({
          showTransactionTimes: false,
          startPage: "BROKERAGE",
          reportingCurrency: "EUR",
        }),
      });
    });

    expect(await screen.findByText("User settings saved.")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
