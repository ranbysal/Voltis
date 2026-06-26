import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's HMR resources to be requested from the common local
  // hostnames so fast-refresh works whether the app is opened at localhost or
  // 127.0.0.1 (Next blocks cross-origin dev requests by default).
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
