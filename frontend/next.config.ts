import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com;",
          },
        ],
      },
      // Optionally remove X-Frame-Options to prevent conflict
      {
        source: "/(.*)",
        headers: [
          {
            key: "x-frame-options",
            value: "ALLOWALL",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
