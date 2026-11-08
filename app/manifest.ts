import type { MetadataRoute } from "next";

// Lets you install the site like an app: Add to Home Screen on iPhone/iPad,
// Add to Dock on a Mac, or the Install button in Chrome/Edge.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dashboard",
    short_name: "Dashboard",
    description: "School and personal dashboard",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "To-do", url: "/todo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Flashcards", url: "/flashcards", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Inbox", url: "/inbox", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
