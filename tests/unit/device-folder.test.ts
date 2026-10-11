import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isDirectoryPickerSupported,
  getDeviceFolderInfo,
  pickDeviceFolder,
  resetDeviceFolder,
  testWriteDeviceFolder,
  saveDraftToDeviceFolder,
  verifyFolderPermission,
  requestFolderPermission,
  writeToDeviceFolder,
} from "@/lib/storage/deviceFolder";

describe("Device Folder Location & Autosave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("detects directory picker support correctly", () => {
    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {};
      expect(isDirectoryPickerSupported()).toBe(false);

      (globalThis as any).window = { showDirectoryPicker: vi.fn() };
      expect(isDirectoryPickerSupported()).toBe(true);
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  it("returns default sandbox info when no custom folder is chosen", async () => {
    const info = await getDeviceFolderInfo("TESTACC123");
    expect(info.hasCustomFolder).toBe(false);
    expect(info.folderName).toBe("Documents/vdo");
  });

  it("picks a device folder and stores its metadata", async () => {
    const mockHandle = {
      name: "My VDO Autosaves",
      queryPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockResolvedValue(mockHandle),
      };

      const res = await pickDeviceFolder("TESTACC123");
      expect(res.success).toBe(true);
      expect(res.folderName).toBe("My VDO Autosaves");

      const info = await getDeviceFolderInfo("TESTACC123");
      expect(info.hasCustomFolder).toBe(true);
      expect(info.folderName).toBe("My VDO Autosaves");
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  it("writes drafts and unsaved changes snapshots to the chosen folder", async () => {
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };

    const mockDirHandle = {
      name: "My VDO Autosaves",
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    };

    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockResolvedValue(mockDirHandle),
      };

      await pickDeviceFolder("SYNCACC456");

      const docSample = {
        version: 2,
        canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" },
        tracks: [],
      };

      const ok = await saveDraftToDeviceFolder("SYNCACC456", "proj-999", "My Epic Reel", docSample);
      expect(ok).toBe(true);
      expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith("My_Epic_Reel.draft.vdo", { create: true });
      expect(mockWritable.write).toHaveBeenCalled();
      expect(mockWritable.close).toHaveBeenCalled();
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  it("tests write access and saves a verification marker", async () => {
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };

    const mockDirHandle = {
      name: "Production SSD",
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    };

    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockResolvedValue(mockDirHandle),
      };

      await pickDeviceFolder("SSDACC789");

      const testRes = await testWriteDeviceFolder("SSDACC789");
      expect(testRes.success).toBe(true);
      expect(testRes.message).toContain("Production SSD");
      expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith("VIDO_LIVE_AUTOSAVE_ACTIVE.json", { create: true });
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  it("resets back to default browser sandbox when cleared", async () => {
    await resetDeviceFolder("SSDACC789");
    const info = await getDeviceFolderInfo("SSDACC789");
    expect(info.hasCustomFolder).toBe(false);
    expect(info.folderName).toBe("Documents/vdo");
  });
  it("denies permission check when status is prompt and request is false", async () => {
    const mockHandle = {
      queryPermission: vi.fn().mockResolvedValue("prompt"),
      requestPermission: vi.fn(),
    };

    const hasPerm = await verifyFolderPermission(mockHandle, false);
    expect(hasPerm).toBe(false);
    expect(mockHandle.requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission when request is true", async () => {
    const mockHandle = {
      name: "User Documents",
      queryPermission: vi.fn().mockResolvedValue("prompt"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockResolvedValue(mockHandle),
      };

      await pickDeviceFolder("REQACC101");
      const ok = await requestFolderPermission("REQACC101");
      expect(ok).toBe(true);
      expect(mockHandle.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  it("handles NotAllowedError in writeToDeviceFolder gracefully without throwing", async () => {
    const notAllowedErr = new Error("The request is not allowed by the user agent or the platform in the current context.");
    notAllowedErr.name = "NotAllowedError";

    const mockHandle = {
      name: "Restricted Folder",
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getFileHandle: vi.fn().mockRejectedValue(notAllowedErr),
    };

    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockResolvedValue(mockHandle),
      };

      await pickDeviceFolder("RESTRICT123");
      const ok = await writeToDeviceFolder("RESTRICT123", "test.txt", "data");
      expect(ok).toBe(false); // Graceful return false, no throw!
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  it("detects OS/browser restricted directory during folder picking and warns user", async () => {
    const notAllowedErr = new Error("The request is not allowed by the user agent or the platform in the current context.");
    notAllowedErr.name = "NotAllowedError";

    const mockRestrictedHandle = {
      name: "System",
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getFileHandle: vi.fn().mockRejectedValue(notAllowedErr),
    };

    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        showDirectoryPicker: vi.fn().mockResolvedValue(mockRestrictedHandle),
      };

      const res = await pickDeviceFolder("RESTRICT456");
      expect(res.success).toBe(false);
      expect(res.error).toContain("restricts writing to this specific folder");
    } finally {
      (globalThis as any).window = origWindow;
    }
  });
});
