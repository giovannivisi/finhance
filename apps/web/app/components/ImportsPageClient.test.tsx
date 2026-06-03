import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportsPageClient from "@components/ImportsPageClient";
import { apiMutation, fetchApiMutation, readApiError } from "@lib/api";
import type {
  ImportBatchResponse,
  ImportPreviewResponse,
} from "@finhance/shared";

const refreshMock = vi.fn();
const reloadMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

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

vi.mock("@lib/page-reload", () => ({
  reloadPage: () => {
    reloadMock();
    return true;
  },
}));

const mockedApiMutation = vi.mocked(apiMutation);
const mockedFetchApiMutation = vi.mocked(fetchApiMutation);
const mockedReadApiError = vi.mocked(readApiError);
const initialBatches: ImportBatchResponse[] = [];

function buildPreviewResponse(
  overrides: Partial<ImportPreviewResponse> = {},
): ImportPreviewResponse {
  return {
    id: "batch-1",
    source: "CSV_TEMPLATE",
    status: "PREVIEW",
    summary: {
      files: [
        {
          file: "transactions",
          createCount: 1,
          updateCount: 0,
          unchangedCount: 0,
        },
      ],
      errorCount: 0,
      warningCount: 0,
    },
    issues: [],
    createdAt: "2026-05-14T17:18:00.000Z",
    appliedAt: null,
    canApply: true,
    ...overrides,
  };
}

function csvFile(name: string, content: string): File {
  return new File([content], name, { type: "text/csv" });
}

function renderPage() {
  return render(
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

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  refreshMock.mockReset();
  reloadMock.mockReset();
});

describe("ImportsPageClient", () => {
  it("uses anchored disclosures without reserving layout space at rest", async () => {
    renderPage();

    expect(
      screen.getByRole("button", { name: "Preview vs apply" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Best use" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import privacy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Preview vs apply" }),
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

    const applyButton = screen.getByRole("button", {
      name: "Preview vs apply",
    });
    fireEvent.mouseEnter(applyButton);

    expect(
      screen.getByRole("region", { name: "Preview vs apply" }),
    ).toBeInTheDocument();

    const applyPopover = screen.getByRole("region", {
      name: "Preview vs apply",
    });
    fireEvent.mouseLeave(applyButton);
    fireEvent.mouseEnter(applyPopover);

    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(
      screen.getByRole("region", { name: "Preview vs apply" }),
    ).toBeInTheDocument();

    fireEvent.mouseLeave(applyPopover);

    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(
      screen.queryByRole("region", { name: "Preview vs apply" }),
    ).not.toBeInTheDocument();
  });

  it("accepts drag and drop on the main import zone", () => {
    const { container } = renderPage();
    const dropZone = container.querySelector(".import-dropzone");
    const file = csvFile(
      "transactions.csv",
      "importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\n",
    );

    expect(dropZone).not.toBeNull();
    fireEvent.drop(dropZone as Element, {
      dataTransfer: { files: [file] },
    });

    expect(screen.getByText(/1 file selected\./i)).toBeInTheDocument();
    expect(screen.getByText("transactions.csv")).toBeInTheDocument();
  });

  it("lets the user remove a selected file from the main import list", () => {
    renderPage();

    const input = screen.getByLabelText("Import CSV files");
    const file = csvFile(
      "accounts.csv",
      "importKey,name,type,currency,openingBalance,openingBalanceDate\n",
    );

    fireEvent.change(input, {
      target: { files: [file] },
    });

    expect(screen.getByText("accounts.csv")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove accounts.csv from import",
      }),
    );

    expect(screen.queryByText("accounts.csv")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Remove accounts.csv from import",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/No files selected yet\./i)).toHaveLength(2);
  });

  it("previews only resolved files while keeping unresolved files in the recovery area", async () => {
    mockedApiMutation.mockResolvedValue(buildPreviewResponse());

    renderPage();

    const input = screen.getByLabelText("Import CSV files");
    const correctedValidFile = csvFile(
      "transactions.csv",
      "importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\n",
    );
    const invalidFile = csvFile("mystery.csv", "foo,bar,baz\n1,2,3\n");

    fireEvent.change(input, {
      target: { files: [correctedValidFile, invalidFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(mockedApiMutation).toHaveBeenCalledTimes(1));

    const formData = mockedApiMutation.mock.calls[0]?.[1]?.body as FormData;
    expect(mockedApiMutation.mock.calls[0]?.[0]).toBe("/imports/csv/preview");
    expect(formData.get("transactions")).toBeInstanceOf(File);
    expect((formData.get("transactions") as File).name).toBe(
      "transactions.csv",
    );
    expect(formData.get("accounts")).toBeNull();

    expect(
      screen.getByText(/Files that still need manual recovery/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Could not infer file category from headers."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 selected file was not included/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Closest match:/i)).not.toBeInTheDocument();
  });

  it("blocks preview when two files resolve to the same category", async () => {
    renderPage();

    const input = screen.getByLabelText("Import CSV files");
    const fileA = csvFile(
      "transactions-a.csv",
      "importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\n",
    );
    const fileB = csvFile(
      "transactions-b.csv",
      "importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\n",
    );

    fireEvent.change(input, {
      target: { files: [fileA, fileB] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() =>
      expect(
        screen.getByText(/No selected files could be previewed/i),
      ).toBeInTheDocument(),
    );

    expect(mockedApiMutation).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(
        /More than one file is currently assigned to Transactions/i,
      ),
    ).toHaveLength(2);
  });

  it("allows manual category assignment after inference fails", async () => {
    mockedApiMutation.mockResolvedValue(buildPreviewResponse());

    renderPage();

    const input = screen.getByLabelText("Import CSV files");
    const invalidFile = csvFile("manual.csv", "foo,bar,baz\n1,2,3\n");

    fireEvent.change(input, {
      target: { files: [invalidFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() =>
      expect(
        screen.getByText("Could not infer file category from headers."),
      ).toBeInTheDocument(),
    );
    expect(mockedApiMutation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "transactions" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(mockedApiMutation).toHaveBeenCalledTimes(1));

    const formData = mockedApiMutation.mock.calls[0]?.[1]?.body as FormData;
    expect((formData.get("transactions") as File).name).toBe("manual.csv");
  });

  it("downloads the template zip and the data zip from their dedicated buttons", async () => {
    const createObjectUrl = vi.fn(() => "blob:finhance");
    const revokeObjectUrl = vi.fn();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;

    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
    mockedReadApiError.mockResolvedValue("download failed");
    mockedFetchApiMutation
      .mockResolvedValueOnce(
        new Response("templates", {
          headers: {
            "content-disposition":
              'attachment; filename="finhance-import-templates-2026-05-14.zip"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response("data", {
          headers: {
            "content-disposition":
              'attachment; filename="finhance-export-2026-05-14.zip"',
          },
        }),
      );

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Export templates" }));
    await waitFor(() =>
      expect(mockedFetchApiMutation).toHaveBeenNthCalledWith(
        1,
        "/imports/csv/templates/export",
        { method: "POST" },
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Export data" }));
    await waitFor(() =>
      expect(mockedFetchApiMutation).toHaveBeenNthCalledWith(
        2,
        "/imports/csv/export",
        { method: "POST" },
      ),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);

    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("refreshes the app router after a successful apply", async () => {
    mockedApiMutation
      .mockResolvedValueOnce(buildPreviewResponse())
      .mockResolvedValueOnce(
        buildPreviewResponse({
          status: "APPLIED",
          canApply: false,
          appliedAt: "2026-05-14T17:19:00.000Z",
        }),
      );

    renderPage();

    fireEvent.change(screen.getByLabelText("Import CSV files"), {
      target: {
        files: [
          csvFile(
            "transactions.csv",
            "importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\n",
          ),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() =>
      expect(mockedApiMutation).toHaveBeenNthCalledWith(
        1,
        "/imports/csv/preview",
        expect.objectContaining({ method: "POST" }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    await waitFor(() =>
      expect(mockedApiMutation).toHaveBeenNthCalledWith(
        2,
        "/imports/batch-1/apply",
        { method: "POST" },
      ),
    );

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
