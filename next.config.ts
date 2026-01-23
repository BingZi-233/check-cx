import type { NextConfig } from "next";

const useStandalone = process.env.NEXT_DISABLE_STANDALONE !== "1";

const nextConfig: NextConfig = useStandalone
  ? { output: "standalone" }
  : {};

export default nextConfig;
