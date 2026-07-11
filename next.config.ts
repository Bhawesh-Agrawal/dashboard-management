import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
