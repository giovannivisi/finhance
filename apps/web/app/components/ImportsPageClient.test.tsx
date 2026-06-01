import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
});

describe("ImportsPageClient", () => {
  function renderPage() {
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
  }

  it("uses anchored disclosures without reserving layout space at rest", async () => {
    renderPage();

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
      screen.queryByRole("region", { name: "What apply does" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Matches rows by import key and merges creates/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Import is best when you are starting from existing finance data/i,
      ),
    ).not.toBeInTheDocument();

    const bestUseButton = screen.getByRole("button", { name: "Best use" });
    const privacyButton = screen.getByRole("button", {
      name: "Import privacy",
    });

    fireEvent.focus(bestUseButton);
    expect(
      screen.getByRole("region", { name: "Best use of import/export" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Import is best when you are starting from existing finance data/i,
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("region", { name: "Best use of import/export" }),
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(privacyButton);
    fireEvent.click(privacyButton);
    expect(
      screen.getByRole("region", { name: "Import privacy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Finhance Ops Ltd. controls this import workflow."),
    ).toBeInTheDocument();
    expect(screen.getByText("Purpose")).toBeInTheDocument();
    expect(screen.getByText("Legal basis")).toBeInTheDocument();
    expect(screen.getByText("Retention")).toBeInTheDocument();
    expect(screen.getByText("Recipients and transfers")).toBeInTheDocument();
    expect(screen.getByText("Rights")).toBeInTheDocument();
    expect(screen.getByText(/Art\. 6\(1\)\(b\) GDPR/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read the full privacy notice" }),
    ).toHaveAttribute("href", "/privacy");

    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByRole("region", { name: "Import privacy" }),
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(privacyButton);
    fireEvent.click(privacyButton);
    expect(
      screen.getByRole("region", { name: "Import privacy" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(privacyButton);
    fireEvent.click(privacyButton);
    expect(
      screen.queryByRole("region", { name: "Import privacy" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the hover popover open while the pointer moves into it", () => {
    vi.useFakeTimers();
    renderPage();

    const applyButton = screen.getByRole("button", { name: "What apply does" });
    fireEvent.mouseEnter(applyButton);

    expect(
      screen.getByRole("region", { name: "What apply does" }),
    ).toBeInTheDocument();

    const applyPopover = screen.getByRole("region", {
      name: "What apply does",
    });
    fireEvent.mouseLeave(applyButton);
    fireEvent.mouseEnter(applyPopover);

    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(
      screen.getByRole("region", { name: "What apply does" }),
    ).toBeInTheDocument();

    fireEvent.mouseLeave(applyPopover);

    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(
      screen.queryByRole("region", { name: "What apply does" }),
    ).not.toBeInTheDocument();
  });
});
