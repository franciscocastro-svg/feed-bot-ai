import { describe, expect, it, vi } from "vitest";
import {
  deleteGeminiFile,
  longVideoThresholds,
  shouldUseGeminiFiles,
  uploadGeminiVideoFile,
  waitForGeminiFile,
} from "../../worker/geminiFiles.js";

const jsonResponse = (payload: unknown, options: { status?: number; headers?: Record<string, string> } = {}) => ({
  ok: (options.status || 200) >= 200 && (options.status || 200) < 300,
  status: options.status || 200,
  headers: new Headers(options.headers || {}),
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

const fileRecord = (state = "PROCESSING") => ({
  file: {
    name: "files/fluxfeed-test",
    uri: "https://generativelanguage.googleapis.com/v1beta/files/fluxfeed-test",
    mimeType: "video/mp4",
    state,
  },
});

describe("Gemini long-video routing", () => {
  it("routes videos at 10 minutes or 100 MB to the Files API", () => {
    expect(longVideoThresholds({})).toEqual({
      durationSeconds: 600,
      sizeBytes: 100 * 1024 * 1024,
    });
    expect(shouldUseGeminiFiles({ durationSeconds: 599, sizeBytes: 99 * 1024 * 1024, env: {} })).toBe(false);
    expect(shouldUseGeminiFiles({ durationSeconds: 600, sizeBytes: 1, env: {} })).toBe(true);
    expect(shouldUseGeminiFiles({ durationSeconds: 30, sizeBytes: 100 * 1024 * 1024, env: {} })).toBe(true);
  });

  it("uploads privately with the resumable protocol and never puts the key in the URL", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, {
        headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files/session" },
      }))
      .mockResolvedValueOnce(jsonResponse(fileRecord().file));

    const result = await uploadGeminiVideoFile({
      apiKey: "placeholder",
      filePath: "/tmp/video.mp4",
      fetchImpl,
      statImpl: async () => ({ size: 131 * 1024 * 1024 }),
      streamFactory: () => Buffer.from("video"),
    });

    expect(result).toMatchObject({ name: "files/fluxfeed-test", state: "PROCESSING" });
    expect(fetchImpl.mock.calls[0][0]).not.toContain("placeholder");
    expect(fetchImpl.mock.calls[0][1].headers["X-Goog-Upload-Protocol"]).toBe("resumable");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "POST", duplex: "half" });
  });

  it("waits until ACTIVE and deletes the temporary Gemini file", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(fileRecord("ACTIVE").file))
      .mockResolvedValueOnce(jsonResponse({}));
    const states: string[] = [];
    const active = await waitForGeminiFile({
      apiKey: "placeholder",
      file: fileRecord().file,
      fetchImpl,
      sleepImpl: async () => undefined,
      onState: async (state) => states.push(state),
    });
    expect(active.state).toBe("ACTIVE");
    expect(states).toEqual(["PROCESSING", "ACTIVE"]);
    await expect(deleteGeminiFile({ apiKey: "placeholder", file: active, fetchImpl })).resolves.toBe(true);
    expect(fetchImpl.mock.calls[1][1].method).toBe("DELETE");
  });

  it("rejects an upload URL outside the official Gemini origin", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, {
      headers: { "x-goog-upload-url": "https://example.invalid/upload" },
    }));
    await expect(uploadGeminiVideoFile({
      apiKey: "placeholder",
      filePath: "/tmp/video.mp4",
      fetchImpl,
      statImpl: async () => ({ size: 1024 }),
      streamFactory: () => Buffer.from("video"),
    })).rejects.toThrow("URL de upload retornada pelo Gemini é inválida");
  });
});
