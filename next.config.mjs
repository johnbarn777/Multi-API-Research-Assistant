/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverActions: true
  },
  eslint: {
    dirs: ["app", "src"]
  },
  serverComponentsExternalPackages: [
    "pdf-lib",
    "@sendgrid/mail",
    "googleapis",
    "firebase-admin",
    "openai"
  ]
};

export default nextConfig;
