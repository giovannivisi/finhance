import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/privacy/page";

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

vi.mock("@lib/privacy-notice", () => ({
  getPrivacyNoticeConfig: () => ({
    deploymentMode: "mixed",
    lastUpdated: "2026-04-30",
    controller: {
      name: "Finhance Ops Ltd.",
      email: "privacy@finhance.test",
      website: null,
      postalAddress: "Via Example 1, Rome",
      instructions: null,
    },
    dpo: {
      name: "Data Protection Officer",
      email: "dpo@finhance.test",
      website: null,
      postalAddress: null,
      instructions: null,
    },
    rightsContact: {
      name: "Finhance Privacy Team",
      email: "rights@finhance.test",
      website: null,
      postalAddress: null,
      instructions: null,
    },
    supervisoryAuthority: {
      name: "Italian Garante",
      complaintUrl: "https://www.garanteprivacy.it/",
    },
    isUsingDefaultLocalNotice: false,
    categoryGroups: [
      {
        title: "Workspace finance records",
        items: ["Accounts, transactions, budgets, notes, and counterparties."],
      },
    ],
    sourceOfData: [
      "Directly from you when you enter data.",
      "From files you upload to the import flow, including files that may contain data about third parties.",
    ],
    consequenceOfNotProviding:
      "The app cannot import or analyse records you choose not to provide.",
    processingActivities: [
      {
        key: "importsAndExports",
        title: "Import and export workspace data",
        purpose: "To preview, merge, and export uploaded workspace files.",
        dataCategories: ["Uploaded CSV rows and import batch metadata."],
        legalBasis: {
          key: "importsAndExports",
          title: "Import and export workspace data",
          basis: "Art. 6(1)(b) GDPR",
          explanation: "Needed to provide the import workflow.",
          legitimateInterests: null,
        },
      },
    ],
    processors: [
      {
        name: "Neon",
        role: "Hosted Postgres",
        purpose: "Primary database hosting",
        location: "EU",
        dataCategories: ["Workspace finance records"],
        website: "https://neon.tech/",
      },
    ],
    transfers: [
      {
        destination: "United States",
        purpose: "Support escalation",
        dataCategories: ["Support excerpts"],
        safeguard: "SCCs",
      },
    ],
    retention: [
      {
        key: "snapshotHistory",
        title: "Net-worth snapshot history",
        retention: "Stored until the operator removes the records.",
        detail:
          "The current product version does not provide an end-user self-service delete action for snapshot history.",
      },
    ],
    automatedDecisionMaking:
      "The current code reviewed for this notice does not use solely automated decision-making or profiling to make decisions with legal or similarly significant effects about a person.",
    importSummary: {
      controller: "Finhance Ops Ltd. decides how the import flow is run.",
      purpose: "To preview and merge uploaded data.",
      legalBasis: "Art. 6(1)(b) GDPR",
      retention: "Preview payloads are stripped after about 15 minutes.",
      recipients: "The workspace operator and its configured infrastructure.",
      rights: "Contact rights@finhance.test to exercise your rights.",
      fullNoticeHref: "/privacy",
      fullNoticeLabel: "Read the full privacy notice",
    },
  }),
}));

describe("PrivacyPage", () => {
  it("renders the full privacy notice, including source-of-data and rights limitations", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { name: "Privacy notice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /what personal data finhance processes/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sources, purposes, and legal bases/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/recipients, processors, and international transfers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/retention, rights, and complaints/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/files that may contain data about third parties/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /snapshot erasure or restriction requests must be handled by the configured rights contact/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Complaint details" }),
    ).toHaveAttribute("href", "https://www.garanteprivacy.it/");
  });
});
