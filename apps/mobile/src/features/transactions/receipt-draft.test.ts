import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReceiptDraftFromImage,
  EmptyReceiptTextError,
  ReceiptImageCleanupError,
} from "@/features/transactions/receipt-draft";

const receiptMocks = vi.hoisted(() => ({
  deleteImage: vi.fn(),
  recogniseText: vi.fn(),
}));

vi.mock("@/features/transactions/receipt-image", () => ({
  deleteTemporaryReceiptImage: receiptMocks.deleteImage,
}));

vi.mock("@/features/transactions/receipt-ocr", () => ({
  recogniseReceiptText: receiptMocks.recogniseText,
}));

describe("createReceiptDraftFromImage", () => {
  beforeEach(() => {
    receiptMocks.deleteImage.mockReset();
    receiptMocks.recogniseText.mockReset();
  });

  it("derives the receipt draft locally and removes the cache image", async () => {
    receiptMocks.recogniseText.mockResolvedValue(
      "Market\nTotal EUR 14.50\n22/07\nVisa •••• 1234",
    );

    await expect(
      createReceiptDraftFromImage(
        "file:///private/cache/receipt.jpg",
        new Date("2026-07-22T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      amount: 14.5,
      currency: "EUR",
      postedAt: "2026-07-22",
      paymentMethod: "card",
      cardLast4: "1234",
      parsedBy: "heuristic",
      cloudAttempted: false,
    });
    expect(receiptMocks.deleteImage).toHaveBeenCalledWith(
      "file:///private/cache/receipt.jpg",
    );
  });

  it("removes the cache image when OCR fails", async () => {
    receiptMocks.recogniseText.mockRejectedValue(new Error("OCR failed"));

    await expect(
      createReceiptDraftFromImage("file:///private/cache/receipt.jpg"),
    ).rejects.toThrow("OCR failed");
    expect(receiptMocks.deleteImage).toHaveBeenCalledOnce();
  });

  it("rejects empty OCR text after removing the cache image", async () => {
    receiptMocks.recogniseText.mockResolvedValue("   ");

    await expect(
      createReceiptDraftFromImage("file:///private/cache/receipt.jpg"),
    ).rejects.toBeInstanceOf(EmptyReceiptTextError);
    expect(receiptMocks.deleteImage).toHaveBeenCalledOnce();
  });

  it("does not return a draft when the cache image cannot be removed", async () => {
    receiptMocks.recogniseText.mockResolvedValue("Total EUR 14.50");
    receiptMocks.deleteImage.mockImplementation(() => {
      throw new Error("delete failed");
    });

    await expect(
      createReceiptDraftFromImage("file:///private/cache/receipt.jpg"),
    ).rejects.toBeInstanceOf(ReceiptImageCleanupError);
  });
});
