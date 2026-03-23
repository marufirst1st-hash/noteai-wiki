import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tquxtsunryheokmgkbrk.supabase.co",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };

    // pdfjs-dist worker 파일을 서버 번들에서 제외
    // (Node.js 런타임에서 require.resolve로 직접 참조)
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'pdfjs-dist',
      ];
    }

    return config;
  },
};

export default nextConfig;
