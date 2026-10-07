import { afterEach, describe, expect, it, vi } from "vitest";
import { publicApi } from "./public-api.js";
afterEach(() => vi.unstubAllGlobals());
describe("public catalog request", () => {
  it("fetches and validates prices without auth or cookies", async () => {
    const services = [
      { id: "a", name: "A", durationMinutes: 60, price: 100, currency: "UAH" },
    ];
    const request = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => services });
    vi.stubGlobal("fetch", request);
    const signal = new AbortController().signal;
    expect(await publicApi.services(signal)).toEqual(services);
    expect(request).toHaveBeenCalledWith("/api/public/services", {
      signal,
      cache: "no-store",
      credentials: "omit",
    });
  });
  it("rejects HTTP errors and malformed catalog facts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, json: async () => [{ price: -1 }] }),
    );
    await expect(publicApi.services()).rejects.toThrow();
    await expect(publicApi.services()).rejects.toThrow();
  });
});
