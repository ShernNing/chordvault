import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "ChordVault",
        short_name: "Chords",
        description: "Personal chord sheet manager for musicians",
        theme_color: "#111111",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          // PNGs: Android/Chrome install prompts and iOS want raster icons.
          // Full-bleed art with the glyph inside the 80% safe zone, so the same
          // file works as a maskable icon.
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // PDF export (jspdf/html2canvas) and .docx import (mammoth) are ~1.1MB
        // and never needed offline on stage. Don't make every first visit
        // download them; they're cached on first use by the /assets/ rule below.
        globIgnores: ["**/assets/pdf-*.js", "**/assets/doc-*.js"],
        runtimeCaching: [
          {
            // Hashed build assets are immutable: cache any not precached (above)
            // the first time they're used.
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "lazy-assets-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Supabase REST reads, network first, fall back to cache offline so
            // previously-viewed songs/setlists remain available without wifi.
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "supabase-data-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("jspdf") || id.includes("html2canvas")) {
            return "pdf";
          }
          if (id.includes("tonal")) {
            return "music";
          }
          if (
            id.includes("framer-motion") ||
            id.includes("motion-dom") ||
            id.includes("motion-utils")
          ) {
            return "motion";
          }
          if (id.includes("mammoth")) {
            return "doc";
          }
          if (id.includes("lucide-react") || id.includes("@dnd-kit")) {
            return "ui";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase limit to 1000kb to reduce warnings
  },
  test: {
    // Agent/tool git worktrees live under .claude/ — never test those copies.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
});
