import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarketStreamToken,
  isMarketStreamConfigured,
  verifyMarketStreamToken,
} from "./market-stream";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("market stream authentication", () => {
  it("creates short-lived gateway tokens", () => {
    vi.stubEnv("MARKET_GATEWAY_SECRET", "g".repeat(48));
    vi.stubEnv("MARKET_GATEWAY_URL", "ws://127.0.0.1:8000/ws");

    const token = createMarketStreamToken("yazan");
    expect(token).not.toBeNull();
    expect(verifyMarketStreamToken(token)).toMatchObject({ userId: "yazan" });
    expect(isMarketStreamConfigured()).toBe(true);
  });

  it("rejects tampered gateway tokens", () => {
    vi.stubEnv("MARKET_GATEWAY_SECRET", "g".repeat(48));
    const token = createMarketStreamToken("yazan")!;
    expect(verifyMarketStreamToken(`${token}bad`)).toBeNull();
  });
});
