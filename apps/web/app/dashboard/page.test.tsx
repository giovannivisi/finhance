import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/dashboard/page";

vi.mock("@components/DashboardMainSection", () => ({
  default: () => <div>Dashboard main section</div>,
}));

vi.mock("@components/DashboardSupportSection", () => ({
  default: () => <div>Dashboard support section</div>,
}));

describe("DashboardPage", () => {
  it("keeps dashboard access available on the dedicated dashboard route", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Dashboard main section")).toBeInTheDocument();
    expect(screen.getByText("Dashboard support section")).toBeInTheDocument();
  });
});
