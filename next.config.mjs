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
};

export default nextConfig;
