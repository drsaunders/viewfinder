import { defineConfig } from "vite";

const repoName = "viewfinder";
const githubPagesBase = `/${repoName}/`;

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 4537,
    host: true,
    strictPort: true,
  },
  preview: {
    port: 4537,
    host: true,
  },
  base: process.env.GITHUB_PAGES === "true" ? githubPagesBase : "/",
});
