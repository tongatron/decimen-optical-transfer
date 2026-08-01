import { expect, test } from "@playwright/test";

test("diagnostics page is available but absent from normal navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href*="benchmark"]')).toHaveCount(0);
  await page.goto("/benchmark/");
  await expect(page.getByRole("heading", { name: "Decimen Diagnostics" })).toBeVisible();
  await expect(page.getByLabel("Frame density")).toHaveValue("all");
  await expect(page.getByLabel("Sender FPS")).toHaveValue("24");
  await expect(page.getByLabel("Camera target FPS")).toHaveValue("60");
  await expect(page.getByRole("button", { name: "Run benchmark" })).toBeVisible();
  await expect(page.getByText("No filenames, file contents, hashes, device IDs, or session IDs")).toBeVisible();
});
