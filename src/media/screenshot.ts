import puppeteer, { Browser } from "puppeteer-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ScreenshotOptions {
  width?: number;
  height?: number;
  timeoutMs?: number;
  fullPage?: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  reason?: string;
}

/**
 * Locate the cached Chromium executable installed by HyperFrames or system.
 */
export function findChromiumPath(): string | null {
  // 1. HyperFrames chrome-headless-shell cache
  const hyperframesCache = join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  if (existsSync(hyperframesCache)) {
    try {
      const versions = readdirSync(hyperframesCache);
      for (const v of versions) {
        const candidate = join(
          hyperframesCache,
          v,
          "chrome-headless-shell-linux64",
          "chrome-headless-shell"
        );
        if (existsSync(candidate)) return candidate;
      }
    } catch {}
  }

  // 2. Standard system locations
  const standardPaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ];

  for (const p of standardPaths) {
    if (existsSync(p)) return p;
  }

  // 3. Fallback playwright cache
  const playwrightCache = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(playwrightCache)) {
    try {
      const dirs = readdirSync(playwrightCache);
      for (const d of dirs) {
        const candidate = join(playwrightCache, d, "chrome-headless-shell-linux64", "chrome-headless-shell");
        if (existsSync(candidate)) return candidate;
      }
    } catch {}
  }

  return null;
}

/**
 * Capture high-resolution screenshot of a webpage using Puppeteer.
 */
export async function captureUrlScreenshot(
  url: string,
  outputPath: string,
  opts?: ScreenshotOptions
): Promise<ScreenshotResult> {
  const executablePath = findChromiumPath();
  if (!executablePath) {
    return {
      success: false,
      reason: "No Chromium executable found on the host system.",
    };
  }

  const width = opts?.width ?? 1080;
  const height = opts?.height ?? 1920;
  const timeout = opts?.timeoutMs ?? 15000;

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Give 500ms for layout/webfonts to settle
    await new Promise((r) => setTimeout(r, 500));

    await page.screenshot({
      path: outputPath,
      type: "jpeg",
      quality: 85,
      fullPage: opts?.fullPage ?? false,
    });

    return { success: true, path: outputPath };
  } catch (err: any) {
    return {
      success: false,
      reason: `Screenshot capture failed for ${url}: ${err.message}`,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

