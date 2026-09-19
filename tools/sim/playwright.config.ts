import { defineConfig } from "@playwright/test";
import { ROOT, SIM_PORT } from "./paths.js";

/** Photographs the scenes in scenes.ts against a throwaway server. The web app must be built first (pnpm sim does it). */
export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../../sim-out/playwright",
  use: {
    baseURL: `http://127.0.0.1:${SIM_PORT}`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // Software WebGL, so pictures come out the same on a laptop without a GPU and on GitHub's machines.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: "pnpm -F @cutonce/api exec tsx src/cli/sim-server.ts",
    cwd: ROOT,
    url: `http://127.0.0.1:${SIM_PORT}/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
