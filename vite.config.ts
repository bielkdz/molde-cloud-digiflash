import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@azure/msal-browser")) return "microsoft";
          if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
          if (id.includes("react")) return "react";
          return "vendor";
        },
      },
    },
  },
});
