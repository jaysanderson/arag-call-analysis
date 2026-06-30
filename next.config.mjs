/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Slim, self-contained server build for the Docker/Fly image.
  output: "standalone",
  // Media is streamed through our own /api/calls/[id]/media proxy.
};

export default nextConfig;
