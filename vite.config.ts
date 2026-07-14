import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    allowedHosts: ["dm.kelvin.io.vn"]
  },
  preview: {
    allowedHosts: ["dm.kelvin.io.vn"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          icons: ["lucide-react"]
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Daily Money",
        short_name: "Daily Money",
        description: "Quản lý tài chính cá nhân hoàn toàn offline.",
        theme_color: "#6d5dfc",
        background_color: "#f7f7ff",
        display: "standalone",
        lang: "vi",
        icons: [
          { src: "/splash/manifest-icon-192.maskable.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/splash/manifest-icon-192.maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/splash/manifest-icon-512.maskable.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/splash/manifest-icon-512.maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: { navigateFallback: "/index.html", importScripts: ["/push-handler.js"] }
    })
  ]
});
