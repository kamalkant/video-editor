import { describe, expect, it, vi } from "vitest";
import { saveFileWithPicker } from "@/lib/storage/filePicker";

describe("saveFileWithPicker (Native File System Access)", () => {
  it("uses showSaveFilePicker when supported and writes blob data", async () => {
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const mockFileHandle = {
      name: "my-project.vdo",
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };

    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showSaveFilePicker: vi.fn().mockResolvedValue(mockFileHandle),
      };

      const testBlob = new Blob(["sample vdo content"], { type: "application/x-vdo" });
      const res = await saveFileWithPicker(testBlob, "my-project.vdo");

      expect(res.saved).toBe(true);
      expect(res.method).toBe("picker");
      expect((globalThis as any).window.showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: "my-project.vdo",
        })
      );
      expect(mockWritable.write).toHaveBeenCalledWith(testBlob);
      expect(mockWritable.close).toHaveBeenCalled();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("handles user cancellation (AbortError) without error", async () => {
    const abortErr = new Error("User canceled file picker");
    abortErr.name = "AbortError";

    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showSaveFilePicker: vi.fn().mockRejectedValue(abortErr),
      };

      const testBlob = new Blob(["content"]);
      const res = await saveFileWithPicker(testBlob, "test.vdo");

      expect(res.saved).toBe(false);
      expect(res.method).toBe("cancelled");
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("falls back to standard browser download when showSaveFilePicker is not supported", async () => {
    const originalWindow = (globalThis as any).window;
    const originalDocument = (globalThis as any).document;

    try {
      const appendedElements: any[] = [];
      const clickedElements: any[] = [];

      (globalThis as any).document = {
        createElement: (tag: string) => {
          const el = {
            tagName: tag,
            href: "",
            download: "",
            click: () => clickedElements.push(el),
          };
          return el;
        },
        body: {
          appendChild: (el: any) => appendedElements.push(el),
          removeChild: (el: any) => {
            const idx = appendedElements.indexOf(el);
            if (idx !== -1) appendedElements.splice(idx, 1);
          },
        },
      };

      (globalThis as any).window = {};
      (globalThis as any).URL = {
        createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
        revokeObjectURL: vi.fn(),
      };

      const testBlob = new Blob(["fallback content"]);
      const res = await saveFileWithPicker(testBlob, "project.portable.vdo");

      expect(res.saved).toBe(true);
      expect(res.method).toBe("download");
      expect(res.fileName).toBe("project.portable.vdo");
      expect(clickedElements).toHaveLength(1);
      expect(clickedElements[0].download).toBe("project.portable.vdo");
    } finally {
      (globalThis as any).window = originalWindow;
      (globalThis as any).document = originalDocument;
    }
  });
});
