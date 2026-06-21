import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/* is proxied at runtime via app/api/[...path]/route.ts (reads PYTHON_BACKEND_URL).
};

export default nextConfig;
