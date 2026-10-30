import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ViPlay Studio",
    short_name: "ViPlay",
    description: "Desktop-class Local-First AI Video Editor",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0c",
    theme_color: "#18181b",
    icons: [
      // (each at its real size: Chrome checks)
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    // PWA File Association for .VDO project files
    file_handlers: [
      {
        action: "/",
        accept: {
          "application/x-vdo": [".vdo", ".VDO"],
          "application/zip": [".vdo", ".VDO"],
        },
      },
    ],
  };
}
