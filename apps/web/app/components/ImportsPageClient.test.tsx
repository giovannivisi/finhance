import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ImportsPageClient from "@components/ImportsPageClient";
import type { ImportBatchResponse } from "@finhance/shared";

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

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
  fetchApiMutation: vi.fn(),
  readApiError: vi.fn(),
}));

const initialBatches: ImportBatchResponse[] = [];

describe("ImportsPageClient", () => {
  it("uses compact disclosures and links the privacy summary to the full notice", async () => {
    const user = userEvent.setup();

    render(
      <ImportsPageClient
        initialBatches={initialBatches}
        privacySummary={{
          controller: "Finhance Ops Ltd. controls this import workflow.",
          purpose: "To preview and merge uploaded workspace files.",
          legalBasis: "Art. 6(1)(b) GDPR.",
          retention: "Preview payloads are stripped after about 15 minutes.",
          recipients:
            "Import requests go to the workspace API and its configured infrastructure.",
          rights: "Contact rights@finhance.test to exercise your rights.",
          fullNoticeHref: "/privacy",
          fullNoticeLabel: "Read the full privacy notice",
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "What apply does" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Best use" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import privacy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Matches rows by import key and merges creates/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Import is best when you are starting from existing finance data/i,
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "What apply does" }));
    expect(
      screen.getByText(/Matches rows by import key and merges creates/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Best use" }));
    expect(
      screen.queryByText(/Matches rows by import key and merges creates/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Import is best when you are starting from existing finance data/i,
      ),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByText(
        /Import is best when you are starting from existing finance data/i,
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import privacy" }));
    expect(
      screen.getByText("Finhance Ops Ltd. controls this import workflow."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Art\. 6\(1\)\(b\) GDPR/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read the full privacy notice" }),
    ).toHaveAttribute("href", "/privacy");
  });
});
