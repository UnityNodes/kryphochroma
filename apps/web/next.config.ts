import { rpcUrls } from "@kryphochroma/abi";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

const ZAMA_ORIGINS = ["https://relayer.testnet.zama.org", "https://*.s3.eu-west-1.amazonaws.com", "https://*.s3.amazonaws.com"];

function deployedTable(): string {
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), "../../deployments/sepolia.json"), "utf8")) as { KryphoTable?: string }).KryphoTable ?? "";
  } catch {
    return "";
  }
}

function originOf(url: string): string {
  return new URL(url).origin;
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' data: blob: ${rpcUrls(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL).map(originOf).join(" ")} ${ZAMA_ORIGINS.join(" ")}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_DEPLOYED_TABLE: deployedTable() },
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
