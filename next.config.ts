import type { NextConfig } from "next";

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${PYTHON_BACKEND}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
