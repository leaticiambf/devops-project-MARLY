import path from "node:path";

import type { NextConfig } from "next";

const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";
const projectRoot = new URL(".", import.meta.url).pathname;

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(projectRoot),
  turbopack: {
    root: path.resolve(projectRoot),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: "/oauth2/:path*",
        destination: `${backendOrigin}/oauth2/:path*`,
      },
      {
        source: "/login/oauth2/:path*",
        destination: `${backendOrigin}/login/oauth2/:path*`,
      },
      {
        source: "/logout",
        destination: `${backendOrigin}/logout`,
      },
    ];
  },
};

export default nextConfig;
