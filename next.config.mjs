/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  eslint: {
    dirs: ["app", "src"]
  },
  serverExternalPackages: [
    "pdf-lib",
    "@sendgrid/mail",
    "googleapis",
    "firebase-admin",
    "openai"
  ]
};

export default nextConfig;
