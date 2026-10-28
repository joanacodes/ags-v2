/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  async headers() {
    return [
      { source: "/((?!studio/templates/).*)", headers: [...securityHeaders, { key: "X-Frame-Options", value: "DENY" }] },
      // The Studio's video templates are framed by the Studio itself (the Video studio's live preview).
      { source: "/studio/templates/:path*", headers: [...securityHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
  experimental: {
    // The Studio's render worker drives Chromium from GitHub Actions; it never belongs in a function.
    serverComponentsExternalPackages: ["playwright"],
  },
  eslint: { ignoreDuringBuilds: true },
  webpack(config, { isServer }) {
    if (isServer) {
      // Document export (PDF fonts, Word) runs only in the browser: keep these
      // libraries out of the server bundle (Cloudflare Workers have a size limit).
      config.resolve.alias = {
        ...config.resolve.alias,
        "pdfmake/build/pdfmake": false,
        "pdfmake/build/vfs_fonts": false,
        docx: false,
      };
    }
    return config;
  },
};

export default nextConfig;
