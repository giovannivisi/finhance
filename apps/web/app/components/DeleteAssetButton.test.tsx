import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeleteAssetButton from "@components/DeleteAssetButton";
import { apiMutation } from "@lib/api";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
}));

describe("DeleteAssetButton", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    vi.mocked(apiMutation).mockReset();
    document.documentElement.setAttribute("data-theme", "dark");
  });

  it("uses the shared modal for asset deletion and refreshes on success", async () => {
    const user = userEvent.setup();
    vi.mocked(apiMutation).mockResolvedValue(undefined);

    render(<DeleteAssetButton id="asset-123" />);

    await user.click(screen.getByRole("button", { name: "Delete asset" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete asset" });
    expect(
      within(dialog).getByText(/are you sure you want to delete this asset/i),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete asset" }),
    );

    expect(apiMutation).toHaveBeenCalledWith("/assets/asset-123", {
      method: "DELETE",
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Delete asset" })).toBeNull();
  });

  it("shows the delete failure inside the modal instead of using a browser alert", async () => {
    const user = userEvent.setup();
    vi.mocked(apiMutation).mockRejectedValue(new Error("Delete failed."));

    render(<DeleteAssetButton id="asset-123" />);

    await user.click(screen.getByRole("button", { name: "Delete asset" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete asset" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete asset" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Delete failed.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
