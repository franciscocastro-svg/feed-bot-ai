import { describe, expect, it, vi } from "vitest";
import { localDeviceCapability } from "@/lib/localVideoCuts";

describe("local video cuts capability", () => {
  it("accepts a small MP4 on a capable desktop", () => {
    vi.stubGlobal("navigator", { userAgent: "Desktop Chrome", hardwareConcurrency: 8, deviceMemory: 8 });
    const file = new File([new Uint8Array(1024)], "video.mp4", { type: "video/mp4" });
    const result = localDeviceCapability(file);
    expect(result.supported).toBe(true);
    expect(result.recommended).toBe(true);
  });

  it("recommends cloud processing for a large mobile file", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone", hardwareConcurrency: 6, deviceMemory: 6 });
    const largeFile = { size: 200 * 1024 * 1024 } as File;
    const result = localDeviceCapability(largeFile);
    expect(result.supported).toBe(true);
    expect(result.recommended).toBe(false);
  });
});
