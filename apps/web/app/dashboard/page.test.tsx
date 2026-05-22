import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/dashboard/page";

vi.mock("@components/DashboardRouteContent", () => ({
  default: () => <div>Dashboard route content</div>,
}));

describe("DashboardPage", () => {
  it("keeps dashboard access available on the dedicated dashboard route", async () => {
    render(await DashboardPage());
    expect(screen.getByText("Dashboard route content")).toBeInTheDocument();
  });
});
