import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Served from https://bayramgeldinx.github.io/xiezi/ — BASE can override for other hosts.
const base = process.env.BASE || "/xiezi/";

export default defineConfig({
  base,
  // Shown in Settings so you can see which version a device runs.
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC") },
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: base,
        name: "写字本 · Chinese writing book",
        short_name: "写字本",
        description: "Stroke order, dictation, flashcards and tones for 汉语口语速成.",
        lang: "en",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#f7f5ee",
        theme_color: "#f7f5ee",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,json,mp3}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { environment: "node", include: ["tests/**/*.test.js"] },
});
