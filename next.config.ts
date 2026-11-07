import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `pdfjs-dist` (used by unpdf for resume text extraction) and the Prisma
  // client must stay in the Node runtime and must not be bundled by Turbopack.
  serverExternalPackages: ["unpdf", "@prisma/client"],
  eslint: {
    dirs: ["app", "components", "lib", "hooks", "types", "tests"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
