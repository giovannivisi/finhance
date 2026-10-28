import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PrivacyScreen from "../../app/privacy";

const mocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  },
  server: { serverMode: "hosted", serverUrl: "https://finhance.test" },
  screen: {} as Record<string, unknown>,
  buttons: new Map<string, () => void>(),
  openURL: vi.fn().mockResolvedValue(undefined),
  textProps: [] as Record<string, unknown>[],
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) =>
    React.createElement("div", null, children),
  Linking: { openURL: mocks.openURL },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query }));
vi.mock("@/api/server-connection", () => ({
  useServerConnection: () => mocks.server,
}));
vi.mock("@/prefs", () => ({
  useFormatters: () => ({ date: (date: string) => date }),
}));
vi.mock("@/theme", () => ({ spacing: { md: 12, sm: 8 } }));
vi.mock("@/components/ui", () => ({
  Screen: ({ children, ...props }: { children: ReactNode }) => {
    mocks.screen = props;
    return React.createElement("main", null, children);
  },
  AppText: ({ children, ...props }: { children: ReactNode }) => {
    mocks.textProps.push(props);
    return React.createElement("span", null, children);
  },
  Card: ({ children }: { children: ReactNode }) =>
    React.createElement("div", null, children),
  Section: ({ title, children }: { title: string; children: ReactNode }) =>
    React.createElement("section", null, title, children),
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => {
    mocks.buttons.set(label, onPress);
    return React.createElement("button", null, label);
  },
  ErrorState: () => React.createElement("div", null, "Notice unavailable"),
  SkeletonCard: () => React.createElement("div", null, "Loading"),
}));

const contact = {
  name: "Workspace operator",
  email: "privacy@example.test",
  website: null,
  postalAddress: "An address that must remain visible",
  instructions: "Contact instructions",
};
const notice = {
  lastUpdated: "2026-10-01",
  controller: contact,
  rightsContact: contact,
  dpo: { ...contact, name: "Data protection officer" },
  supervisoryAuthority: {
    name: "Authority",
    complaintUrl: "https://authority.test",
  },
  categoryGroups: [{ title: "Finance", items: ["Financial records"] }],
  sourceOfData: ["Imported CSV files"],
  processingActivities: [
    {
      key: "security",
      title: "Security",
      purpose: "Account protection",
      dataCategories: ["Passkey public keys"],
      legalBasis: {
        basis: "Legitimate interests",
        explanation: "Prevent abuse",
        legitimateInterests: "Protect records",
      },
    },
  ],
  processors: [
    {
      name: "Hosting provider",
      role: "Database",
      purpose: "Store records",
      location: "EU",
      dataCategories: ["Finance data"],
    },
  ],
  transfers: [
    {
      destination: "United States",
      purpose: "Optional drafts",
      dataCategories: ["Redacted text"],
      safeguard: "Verified safeguards",
    },
  ],
  retention: [
    {
      key: "imports",
      title: "Import previews",
      retention: "Expire after 15 minutes",
      detail: "Deleted during a later import operation",
    },
  ],
  rightsStatements: ["Withdraw consent without affecting earlier processing"],
  consequenceOfNotProviding: "Some features cannot operate without records",
  automatedDecisionMaking: "No decisions with legal effects",
};

describe("native privacy notice", () => {
  beforeEach(() => {
    mocks.query.data = notice;
    mocks.query.isPending = false;
    mocks.query.isError = false;
    mocks.server.serverMode = "hosted";
    mocks.buttons.clear();
    mocks.textProps.length = 0;
    mocks.openURL.mockClear();
  });

  it("renders the full notice without truncating long fields or opening a browser", () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyScreen));
    for (const text of [
      "Imported CSV files",
      "Passkey public keys",
      "Protect records",
      "Hosting provider",
      "Verified safeguards",
      "Deleted during a later import operation",
      "Withdraw consent",
      "An address that must remain visible",
      "Data protection officer",
      "Some features cannot operate",
    ]) {
      expect(html).toContain(text);
    }
    expect(mocks.screen).toMatchObject({ showBack: true, fixedHeader: true });
    expect(
      mocks.textProps.every((props) => props.numberOfLines === undefined),
    ).toBe(true);
    expect(
      mocks.textProps
        .filter((props) => props.selectable)
        .every((props) => props.variant === "body"),
    ).toBe(true);
    expect(mocks.openURL).not.toHaveBeenCalled();
    mocks.buttons.get("Open notice in your browser")!();
    expect(mocks.openURL).toHaveBeenCalledWith("https://finhance.test/privacy");
  });

  it("keeps an exit available while loading, on failure, and in local mode", () => {
    mocks.query.data = null;
    mocks.query.isPending = true;
    expect(renderToStaticMarkup(React.createElement(PrivacyScreen))).toContain(
      "Loading",
    );
    expect(mocks.screen).toMatchObject({ showBack: true, fixedHeader: true });
    mocks.query.isPending = false;
    mocks.query.isError = true;
    expect(renderToStaticMarkup(React.createElement(PrivacyScreen))).toContain(
      "Notice unavailable",
    );
    expect(mocks.screen).toMatchObject({ showBack: true, fixedHeader: true });
    mocks.query.isError = false;
    mocks.server.serverMode = "local";
    expect(renderToStaticMarkup(React.createElement(PrivacyScreen))).toContain(
      "Local workspace notice",
    );
    expect(mocks.screen).toMatchObject({ showBack: true, fixedHeader: true });
  });

  it("supports a hosted server without the newer optional notice fields", () => {
    const {
      rightsStatements,
      processors,
      transfers,
      dpo,
      consequenceOfNotProviding,
      ...legacy
    } = notice;
    void [
      rightsStatements,
      processors,
      transfers,
      dpo,
      consequenceOfNotProviding,
    ];
    mocks.query.data = legacy;
    const html = renderToStaticMarkup(React.createElement(PrivacyScreen));
    expect(html).toContain("You may withdraw cloud-parser consent at any time");
    expect(html).toContain("No decisions with legal effects");
  });
});
