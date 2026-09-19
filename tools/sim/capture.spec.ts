import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { CURRENT, SIM_TOKEN } from "./paths.js";
import { scenes } from "./scenes.js";

const list = scenes();
mkdirSync(join(CURRENT, "screens"), { recursive: true });
writeFileSync(join(CURRENT, "scenes.json"), JSON.stringify(list, null, 2));

test.beforeEach(async ({ context }) => {
  await context.addInitScript((t) => localStorage.setItem("cutonce.api_token", t), SIM_TOKEN);
});

for (const scene of list) {
  test(scene.name, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(scene.url);
    await page.waitForFunction(() => (window as unknown as { __previewReady?: boolean }).__previewReady === true, null, { timeout: 30_000 })
      .catch((e) => { throw new Error(`${scene.name} never became ready${errors.length ? `: ${errors.join("; ")}` : ""} (${e})`); });
    await page.screenshot({ path: join(CURRENT, "screens", `${scene.name}.png`) });
  });
}
