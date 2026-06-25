import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminEmail,
  createSessionToken,
  emailMatches,
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

  it("matches the configured admin email case-insensitively", () => {
    vi.stubEnv("VOLTIS_ADMIN_EMAIL", "Yazan@Voltis.Trade");

    expect(adminEmail()).toBe("yazan@voltis.trade");
    expect(emailMatches("  yazan@voltis.trade ")).toBe(true);
    expect(emailMatches("someone@else.com")).toBe(false);
  });

  it("prefers the dedicated admin password over the legacy access password", () => {
    vi.stubEnv("VOLTIS_SESSION_SECRET", "s".repeat(48));
    vi.stubEnv("VOLTIS_ACCESS_PASSWORD", "legacy");
    vi.stubEnv("VOLTIS_ADMIN_PASSWORD", "dedicated");

    expect(passwordMatches("dedicated")).toBe(true);
    expect(passwordMatches("legacy")).toBe(false);
    expect(isAuthConfigured()).toBe(true);
  });
});

