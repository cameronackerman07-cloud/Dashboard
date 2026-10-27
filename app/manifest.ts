import type { MetadataRoute } from "next";

// Lets you "Add to Home Screen" on iPhone so it opens like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dashboard",
    short_name: "Dashboard",
    description: "School and personal dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
