/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel env vars are named without "PUBLIC" (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY).
  // These two are safe for the browser, so expose them under the NEXT_PUBLIC_ names client code expects.
  // Never add SUPABASE_SERVICE_ROLE_KEY or any other secret here.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  },
  // HSC practice sends handwritten working as an image, which can exceed the 1 MB
  // default. Vercel itself rejects anything over 4.5 MB, so stay under that.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // Pin the project root so Turbopack doesn't walk up into the home directory
  // (there's no lockfile boundary above this folder).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
