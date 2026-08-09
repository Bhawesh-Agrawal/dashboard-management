import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "googleapis",
    "pg",
    "@prisma/client",
    "@prisma/adapter-pg",
    "prisma",
    "tesseract.js",
    "web-push",
  ],
};

export default nextConfig;
