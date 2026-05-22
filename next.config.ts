import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Lint is run separately; a broken lint config should not block the build.
    ignoreDuringBuilds: true,
  },
  // Heavy / Node-native packages are kept out of the bundler and required at runtime.
  serverExternalPackages: [
    "@langchain/langgraph",
    "@langchain/google-vertexai",
    "@modelcontextprotocol/sdk",
    "langfuse",
    "langfuse-langchain",
    "unpdf",
    "mammoth",
    "@google-cloud/storage",
    "googleapis",
  ],
};

export default nextConfig;
