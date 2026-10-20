const { test, expect } = require("@playwright/test");

const pages = {
  "index.html": /Qitao Shi/,
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

test("internal links resolve", async ({ page, request }) => {
  await page.goto("index.html");
  const hrefs = await page.$$eval("a[href$='.html']", (as) => [...new Set(as.map((a) => a.href))]);
  for (const href of hrefs) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test("projects rail drags with a mouse without clicking through", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("projects.html");
  const rail = page.locator(".rail");
  // start the drag on a button: dragging must scroll, not follow the link
  const btn = page.locator("#tennis .btn-accent");
  const b = await btn.boundingBox();
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 300, b.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect(page).toHaveURL(/projects\.html$/);
  await expect.poll(() => rail.evaluate((r) => r.scrollLeft)).toBeGreaterThan(100);
  // a plain click still follows the link
  await page.locator("#side-quests .btn-accent").click();
  await expect(page).toHaveURL(/side-quests\.html$/);
});
