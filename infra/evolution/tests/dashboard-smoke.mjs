import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = (process.env.SMOKE_BASE_URL || "").replace(/\/+$/, "");
const apiKey = process.env.SMOKE_API_KEY || "";

assert(baseUrl, "SMOKE_BASE_URL is required");
assert(apiKey, "SMOKE_API_KEY is required");

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/cfgevo`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/manager\/$/, { timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean(document.body.textContent && document.body.textContent.trim()),
    undefined,
    { timeout: 30_000 },
  );

  const credentials = await page.evaluate(() => ({
    apiUrl: localStorage.getItem("apiUrl"),
    token: localStorage.getItem("token"),
    version: localStorage.getItem("version"),
  }));

  assert.equal(credentials.apiUrl, baseUrl);
  assert.equal(credentials.token, apiKey);
  assert(credentials.version, "dashboard bootstrap did not persist the server version");
  assert(!page.url().includes("/manager/login"), "dashboard redirected to the login page");

  const text = await page.locator("body").innerText();
  assert(!text.includes("Não foi possível abrir o dashboard"));
  console.log("Dashboard smoke test passed");
} finally {
  await browser.close();
}
