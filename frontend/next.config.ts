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
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-expect-error NextConfig typing in this setup does not include the eslint build flag.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
