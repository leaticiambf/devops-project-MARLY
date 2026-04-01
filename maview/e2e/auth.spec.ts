import { expect, test } from "@playwright/test";

import {
  installAppMocks,
  seedSession,
} from "./support/mock-app";

test("restores an existing session after reload", async ({ page }) => {
  await installAppMocks(page);
  await seedSession(page);

  await page.goto("/");
  await expect(page.getByRole("banner").getByText("Jane Doe")).toBeVisible();

  await page.reload();

  await expect(page.getByRole("banner").getByText("Jane Doe")).toBeVisible();
  await expect(page.getByRole("heading", { name: /plan the next trip/i })).toBeVisible();
});
