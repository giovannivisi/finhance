import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import OverflowMenu from "@components/OverflowMenu";

function TestMenu({
  label,
  itemLabels,
}: {
  label: string;
  itemLabels: string[];
}) {
  return (
    <OverflowMenu
      label={label}
      renderTrigger={({ triggerProps, triggerRef }) => (
        <button {...triggerProps} ref={triggerRef}>
          {label}
        </button>
      )}
    >
      {({ closeMenu }) => (
        <>
          {itemLabels.map((itemLabel) => (
            <button
              key={itemLabel}
              type="button"
              role="menuitem"
              className="overflow-menu-item"
              onClick={() => closeMenu()}
            >
              {itemLabel}
            </button>
          ))}
        </>
      )}
    </OverflowMenu>
  );
}

describe("OverflowMenu", () => {
  it("opens, closes on item click, and closes on outside click", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <TestMenu label="Actions" itemLabels={["Edit", "Delete"]} />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu", { name: "Actions" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull(),
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull(),
    );
  });

  it("restores focus to the trigger on Escape", async () => {
    const user = userEvent.setup();

    render(<TestMenu label="Actions" itemLabels={["Edit", "Delete"]} />);

    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);

    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus(),
    );

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull(),
    );
    expect(trigger).toHaveFocus();
  });

  it("focuses the first item on open and supports arrow, home, and end navigation", async () => {
    const user = userEvent.setup();

    render(
      <TestMenu label="Actions" itemLabels={["First", "Second", "Third"]} />,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));

    const menu = screen.getByRole("menu", { name: "Actions" });
    const first = within(menu).getByRole("menuitem", { name: "First" });
    const second = within(menu).getByRole("menuitem", { name: "Second" });
    const third = within(menu).getByRole("menuitem", { name: "Third" });

    await waitFor(() => expect(first).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(third).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(second).toHaveFocus();

    await user.keyboard("{End}");
    expect(third).toHaveFocus();

    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("closes the first menu when a second menu opens", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <TestMenu label="First menu" itemLabels={["Edit"]} />
        <TestMenu label="Second menu" itemLabels={["Delete"]} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "First menu" }));
    expect(screen.getByRole("menu", { name: "First menu" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Second menu" }));

    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "First menu" })).toBeNull(),
    );
    expect(screen.getByRole("menu", { name: "Second menu" })).toBeInTheDocument();
  });
});
