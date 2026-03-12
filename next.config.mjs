/** @type {import('next').NextConfig} */
const nextConfig = {
  // mammoth is a native Node.js module — exclude from bundling
  serverExternalPackages: ['mammoth'],
  turbopack: {},
};

// Extend serverless function timeout to 5 minutes for AI coaching pipeline.
// Requires Vercel Pro. On Hobby plan the hard cap is 60s — consider the
// async job pattern (see PROJECT_OVERVIEW.md) if you stay on Hobby.
export const maxDuration = 300;

export default nextConfig;
