import { expect, test } from "@playwright/test";

import {
  installAppMocks,
  seedSession,
} from "./support/mock-app";

test("plans a normal journey, starts it, and completes it", async ({ page }) => {
  await installAppMocks(page);
  await seedSession(page);

  await page.goto("/");
  await page.getByRole("textbox", { name: "From", exact: true }).first().fill("Gare de Lyon");
  await page.getByRole("textbox", { name: "To", exact: true }).first().fill("Chatelet");
  await page.getByRole("button", { name: "Plan journey" }).first().click();

  await expect(page.getByText("1 trip option ready to review.").first()).toBeVisible();
  await expect(page.getByText("Option 1").first()).toBeVisible();

  await page.getByRole("button", { name: "Start journey" }).click();
  await expect(page.getByText("Live journey", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Complete", exact: true }).first().click();
  await expect(
    page.getByText("Gare de Lyon to Chatelet completed successfully.").first(),
  ).toBeVisible();
});
