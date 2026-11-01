const { test, expect } = require("@playwright/test");

const pages = {
  "index.html": /Qitao Shi/,
  "about.html": /About/,
  "food.html": /Food/,
  "pizza.html": /Pizza/,
  "dumplings.html": /Dumplings/,
  "focaccia.html": /Focaccia/,
  "croissants.html": /Croissant/,
  "chicken-katsu.html": /Katsu/,
  "seared-pork.html": /Pork/,
  "projects.html": /Projects/,
  "ray-tracer.html": /Ray Tracer/,
  "salt-bread.html": /Salt Bread/,
  "side-quests.html": /Side Quests/,
  "tennis.html": /Tennis/,
  "wayform.html": /Wayform/,
};

for (const [path, title] of Object.entries(pages)) {
  test(`${path} loads without errors`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("internal links resolve on every page", async ({ page, request }) => {
  const seen = new Set();
  for (const path of Object.keys(pages)) {
    await page.goto(path);
    expect(await page.locator("a[href='#'], a[href='']").count(), `placeholder link on ${path}`).toBe(0);
    for (const href of await page.$$eval("a[href$='.html']", (as) => as.map((a) => a.href))) seen.add(href);
  }
  for (const href of seen) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test("projects rail drags with a mouse without clicking through", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("projects.html");
  const rail = page.locator(".rail");
  // start the drag on the ticket's link: dragging must scroll, not follow it
  const btn = page.locator("#tennis .ticket-link");
  const b = await btn.boundingBox();
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 300, b.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect(page).toHaveURL(/projects\.html$/);
  await expect.poll(() => rail.evaluate((r) => r.scrollLeft)).toBeGreaterThan(100);
  // a plain click still follows the link
  await page.locator("#side-quests .ticket-link").click();
  await expect(page).toHaveURL(/side-quests\.html$/);
});

test("recipe ingredients switch between grid and list", async ({ page }) => {
  await page.goto("salt-bread.html");
  const ingredients = page.locator(".recipe .ingredients");
  await page.getByRole("button", { name: "View as list" }).click();
  await expect(ingredients).toHaveClass(/as-list/);
  await page.getByRole("button", { name: "View as grid" }).click();
  await expect(ingredients).not.toHaveClass(/as-list/);
});

test("gallery navigation and zoom follow the selected image", async ({ page }) => {
  await page.goto("wayform.html");
  await page.getByRole("button", { name: "Next image" }).click();
  await expect(page.locator(".gallery-nav output")).toHaveText("2 / 3");
  await page.getByRole("button", { name: "Enlarge image" }).click();
  const dialog = page.getByRole("dialog", { name: "Enlarged image" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveAttribute("src", /wayform-plan\.jpg$/);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();
});

test("the home picker updates its link from click and keyboard selection", async ({ page }) => {
  await page.goto("index.html");
  await expect(page.locator("#susan canvas")).toBeVisible();
  await page.getByRole("button", { name: "Salt bread" }).click();
  await expect(page.locator("#now-link")).toHaveAttribute("href", "salt-bread.html");
  await page.locator("#susan").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#now-link")).toHaveAttribute("href", "side-quests.html");
});
