import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  isAuthConfigured,
  passwordMatches,
  verifySessionToken,
} from "./auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("single-user authentication", () => {
  it("signs and verifies a time-limited session", () => {
    vi.stubEnv("VOLTIS_SESSION_SECRET", "s".repeat(48));
    vi.stubEnv("VOLTIS_ACCESS_PASSWORD", "correct horse battery staple");

    const token = createSessionToken("yazan");
    expect(token).not.toBeNull();
    expect(verifySessionToken(token)).toMatchObject({ userId: "yazan" });
    expect(isAuthConfigured()).toBe(true);
  });

  it("rejects tampered sessions and incorrect passwords", () => {
    vi.stubEnv("VOLTIS_SESSION_SECRET", "s".repeat(48));
    vi.stubEnv("VOLTIS_ACCESS_PASSWORD", "private-password");

    const token = createSessionToken("yazan")!;
    expect(verifySessionToken(`${token}tampered`)).toBeNull();
    expect(passwordMatches("wrong-password")).toBe(false);
    expect(passwordMatches("private-password")).toBe(true);
  });
});

