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
        background_color: "#fbf1d9",
        theme_color: "#fbf1d9",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Recordings are not downloaded at install (there are 1,700+); each one is kept once it has played.
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,json}"],
        // Per-character strokes (~9,500 files) and dictionary shards load on demand and are kept once used.
        globIgnores: ["strokes/**", "dict/**", "radicals/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.includes("/audio/") && url.pathname.endsWith(".mp3"),
          handler: "CacheFirst",
          options: { cacheName: "xz-audio", expiration: { maxEntries: 4000 }, rangeRequests: true },
        }, {
          urlPattern: ({ url }) => url.pathname.includes("/strokes/") && url.pathname.endsWith(".json"),
          handler: "CacheFirst",
          options: { cacheName: "xz-strokes", expiration: { maxEntries: 3000 } },
        }, {
          urlPattern: ({ url }) => url.pathname.includes("/dict/") && url.pathname.endsWith(".json"),
          handler: "CacheFirst",
          options: { cacheName: "xz-dict", expiration: { maxEntries: 80 } },
        }, {
          urlPattern: ({ url }) => url.pathname.includes("/radicals/") && url.pathname.endsWith(".svg"),
          handler: "CacheFirst",
          options: { cacheName: "xz-radicals", expiration: { maxEntries: 600 } },
        }],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { environment: "node", include: ["tests/**/*.test.js"] },
});
