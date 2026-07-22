import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTemporaryReceiptImage } from "@/features/transactions/receipt-image";

const fileMock = vi.hoisted(() => ({
  delete: vi.fn(),
  exists: true,
  uri: "",
}));

vi.mock("expo-file-system", () => ({
  File: class {
    constructor(uri: string) {
      fileMock.uri = uri;
    }

    get exists() {
      return fileMock.exists;
    }

    delete() {
      fileMock.delete();
    }
  },
}));

describe("deleteTemporaryReceiptImage", () => {
  beforeEach(() => {
    fileMock.delete.mockReset();
    fileMock.exists = true;
    fileMock.uri = "";
  });

  it("deletes the picker-created cache file", () => {
    deleteTemporaryReceiptImage("file:///private/cache/receipt.jpg");

    expect(fileMock.uri).toBe("file:///private/cache/receipt.jpg");
    expect(fileMock.delete).toHaveBeenCalledOnce();
  });

  it("does nothing when the cache file has already disappeared", () => {
    fileMock.exists = false;

    deleteTemporaryReceiptImage("file:///private/cache/receipt.jpg");

    expect(fileMock.delete).not.toHaveBeenCalled();
  });
});
