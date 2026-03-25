/** @type {import('next').NextConfig} */
const nextConfig = {
  // Direct dep so `import("onnxruntime-web/wasm")` resolves; transpile for subpath exports + Turbopack.
  transpilePackages: ["onnxruntime-web", "@ricky0123/vad-web"],
};

export default nextConfig;
