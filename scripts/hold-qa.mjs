import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:8080/";
const outDir = "/workspace/screenshots";

const browser = await chromium.launch({ headless: true });
const errors = [];

async function run(name, viewport, fn) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (err) => errors.push(`${name}: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`${name} console: ${msg.text()}`);
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await fn(page);
  await page.close();
}

await run("home", { width: 1280, height: 800 }, async (page) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/hold-home.png`, fullPage: true });
  const title = await page.locator("text=HOLD").first().textContent();
  if (!title) throw new Error("missing HOLD wordmark");

  const field = page.getByLabel("Voice or typed command");
  await field.fill("start dead hang timer");
  await field.press("Enter");
  await page.waitForTimeout(300);
  const overlay = page.getByRole("dialog", { name: /dead hang timer/i });
  await overlay.waitFor({ state: "visible", timeout: 4000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/hold-timer.png` });
  await overlay.getByRole("button", { name: "Stop" }).click();
  await overlay.waitFor({ state: "hidden", timeout: 4000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/hold-after-stop.png`, fullPage: true });

  const award = page.getByRole("button", { name: /new award/i });
  if (await award.count()) await award.click();
  await page.getByRole("button", { name: /^progress$/i }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/hold-progress.png`, fullPage: true });
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /^remind$/i }).click();
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await page.waitForTimeout(200);
  const reminder = page.getByText("Break", { exact: true });
  if (!(await reminder.count())) throw new Error("reminder did not appear");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Name").fill("Scap squeeze");
  await page.getByRole("button", { name: "Save movement" }).click();
  await page.waitForTimeout(200);
  if (!(await page.getByText("Scap Squeeze").count())) throw new Error("movement not added");
  await page.screenshot({ path: `${outDir}/hold-after-actions.png`, fullPage: true });
});

await run("mobile", { width: 390, height: 844 }, async (page) => {
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  await page.screenshot({ path: `${outDir}/hold-mobile.png`, fullPage: true });
  if (overflow) throw new Error("horizontal overflow on mobile");
  await page.getByRole("button", { name: /^plank/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/hold-mobile-timer.png` });
});

await run("login", { width: 1280, height: 800 }, async (page) => {
  await page.goto(new URL("/login", url).toString(), { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/hold-login.png` });
  const google = page.getByRole("button", { name: /google/i });
  if (!(await google.count())) throw new Error("missing Google sign-in");
});

await browser.close();

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    shots: ["hold-home", "hold-timer", "hold-after-stop", "hold-mobile", "hold-login"],
  }),
);
