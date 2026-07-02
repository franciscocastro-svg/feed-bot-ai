import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const manualChunkGroups: Array<[string, string[]]> = [
  ["react-vendor", ["react", "react-dom", "react-router-dom"]],
  ["motion", ["framer-motion"]],
  ["supabase", ["@supabase/supabase-js"]],
  ["query", ["@tanstack/react-query"]],
  [
    "radix",
    [
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-accordion",
    ],
  ],
  ["icons", ["lucide-react"]],
];

function manualChunks(id: string) {
  const normalizedId = id.replace(/\\/g, "/");
  if (!normalizedId.includes("/node_modules/")) return undefined;

  const match = manualChunkGroups.find(([, packages]) =>
    packages.some((packageName) => normalizedId.includes(`/node_modules/${packageName}/`)),
  );

  return match?.[0];
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
