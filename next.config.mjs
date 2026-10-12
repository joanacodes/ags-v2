/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  eslint: { ignoreDuringBuilds: true },
  webpack(config, { isServer }) {
    if (isServer) {
      // Document export (PDF fonts, Word) runs only in the browser: keep these
      // libraries out of the server bundle so the Cloudflare worker stays small.
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
