/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // No COEP headers — ffmpeg.wasm runs in single-thread mode (no SharedArrayBuffer needed)
  // COEP would block cross-origin iframes (nexjobs.in etc.) from loading
};

export default nextConfig;
