import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tap Planner",
    short_name: "Tap Planner",
    description:
      "Choose a Pinter BrewPack and desired tap date to calculate when brewing, cold crashing, and conditioning should begin.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf8",
    theme_color: "#b75c2b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
