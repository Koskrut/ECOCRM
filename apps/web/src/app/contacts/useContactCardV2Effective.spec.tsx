import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();

vi.mock("../../lib/api/client", () => ({
  apiHttp: {
    get: mockGet,
  },
}));

describe("useContactCardV2Effective", () => {
  beforeEach(() => {
    mockGet.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CONTACT_CARD_V2;
    vi.resetModules();
  });

  it("reads false from env switch", async () => {
    process.env.NEXT_PUBLIC_CONTACT_CARD_V2 = "false";
    const mod = await import("./useContactCardV2Effective");

    expect(mod.readContactCardV2FromEnv()).toBe(false);

    const { result } = renderHook(() => mod.useContactCardV2Effective());
    expect(result.current).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("starts in legacy mode while waiting and then enables v2 after server success", async () => {
    process.env.NEXT_PUBLIC_CONTACT_CARD_V2 = "true";
    mockGet.mockResolvedValue({ data: { contactCardV2: true } });
    const mod = await import("./useContactCardV2Effective");

    const { result } = renderHook(() => mod.useContactCardV2Effective());

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/settings/contact-card-ui", expect.any(Object));
  });

  it("falls back to env value after request error", async () => {
    process.env.NEXT_PUBLIC_CONTACT_CARD_V2 = "true";
    mockGet.mockRejectedValue(new Error("network"));
    const mod = await import("./useContactCardV2Effective");

    const { result } = renderHook(() => mod.useContactCardV2Effective());

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("invalidates cached value and refetches after broadcast", async () => {
    process.env.NEXT_PUBLIC_CONTACT_CARD_V2 = "true";
    mockGet.mockResolvedValueOnce({ data: { contactCardV2: true } }).mockResolvedValueOnce({
      data: { contactCardV2: false },
    });
    const mod = await import("./useContactCardV2Effective");

    const { result } = renderHook(() => mod.useContactCardV2Effective());
    await waitFor(() => expect(result.current).toBe(true));

    mod.invalidateContactCardUiCache();

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current).toBe(false));
  });
});
