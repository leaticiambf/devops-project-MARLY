import { expect, test } from "@playwright/test";

import { installAppMocks, seedSession } from "./support/mock-app";

test("loads the tasks and eco pages for an authenticated user", async ({ page }) => {
  await installAppMocks(page);
  await seedSession(page);

  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { level: 1, name: "My Tasks" }),
  ).toBeVisible();
  await expect(page.getByText("Pick up parcel")).toBeVisible();

  await page.goto("/eco-score");
  await expect(
    page.getByRole("heading", { level: 1, name: "Eco score" }),
  ).toBeVisible();
  await expect(page.getByText("Green Starter").first()).toBeVisible();
});
