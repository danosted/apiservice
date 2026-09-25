#!/usr/bin/env node
// Drive the admin UI in headless Chromium: screenshots, accessibility snapshots and
// scripted flows. Every command also reports browser console errors and failed
// requests, and exits non-zero if there were any.
//
//   npm run ui -- shot /players                       screenshot -> .dev-run/screens/players.png
//   npm run ui -- shot /players/player-001 --full     full-page screenshot
//   npm run ui -- snapshot /players                   accessibility tree of <main> as YAML
//   npm run ui -- run services/admin/flows/grant-item.json
//   npm run ui -- flows                               run every services/admin/flows/*.json
//
// Options: --as editor|viewer|none (default editor), --width 1280, --height 800,
//          --service admin, --allow-errors
//
// Flow files are a JSON array of steps, or {"as": "viewer", "allowHttp": [422], "steps": [...]}
// where allowHttp lists error statuses the flow expects. Steps:
//   {"goto": "/players"}                         navigate (relative to the service)
//   {"click": {"role": "button", "name": "Apply"}} or {"click": {"text": "Next"}}
//   {"fill": {"label": "Quantity", "value": "2"}}
//   {"select": {"label": "Item", "option": "Elixir (max 10)"}}
//   {"expectText": "Granted 2"}                  wait until the text is visible
//   {"expectVisible": {"role": "alert"}}         wait until an element is visible
//   {"expectUrl": "/players?page=2"}             wait until the URL ends with this
//   {"shot": "after-grant"}  {"snapshot": true}  capture mid-flow
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCREENS = join(ROOT, ".dev-run", "screens");

function parseArgs(argv) {
  const opts = {
    as: "editor",
    width: 1280,
    height: 800,
    service: "admin",
    full: false,
    allowErrors: false,
    allowHttp: [],
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--full") opts.full = true;
    else if (a === "--allow-errors") opts.allowErrors = true;
    else if (a.startsWith("--")) opts[a.slice(2)] = argv[++i];
    else rest.push(a);
  }
  opts.width = Number(opts.width);
  opts.height = Number(opts.height);
  return { opts, command: rest[0], args: rest.slice(1) };
}

function baseUrl(service) {
  const pkg = JSON.parse(readFileSync(join(ROOT, "services", service, "package.json"), "utf8"));
  const port = /--port\s+(\d+)/.exec(pkg.scripts?.dev ?? "")?.[1];
  if (!port) throw new Error(`no --port in services/${service}/package.json dev script`);
  return `http://localhost:${port}`;
}

const slug = (path) =>
  path
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+$/, "") || "home";

function locate(page, target) {
  if (typeof target === "string") return page.getByText(target, { exact: false }).first();
  if (target.role)
    return page.getByRole(target.role, target.name ? { name: target.name, exact: target.exact ?? false } : {}).first();
  if (target.label) return page.getByLabel(target.label, { exact: target.exact ?? false }).first();
  if (target.text) return page.getByText(target.text, { exact: target.exact ?? false }).first();
  if (target.css) return page.locator(target.css).first();
  throw new Error(`can't locate ${JSON.stringify(target)}`);
}

async function session(opts, fn) {
  const base = baseUrl(opts.service);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, baseURL: base });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    // Chrome logs every HTTP error as "Failed to load resource"; those are judged by the response handler below.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) =>
    problems.push(`request failed: ${r.method()} ${r.url()} (${r.failure()?.errorText})`),
  );
  page.on("response", (r) => {
    // 401 on /api/me is the normal signed-out path; anything else >= 400 is worth seeing.
    const expected = (r.status() === 401 && opts.as === "none") || opts.allowHttp.includes(r.status());
    if (r.status() >= 400 && !expected) {
      problems.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url().replace(base, "")}`);
    }
  });

  if (opts.as !== "none") {
    const res = await page.request.get(`/__dev/login?as=${opts.as}&next=/`, { maxRedirects: 0 });
    if (res.status() !== 302) throw new Error(`dev login as ${opts.as} failed (${res.status()}); is IDENTITY=fake?`);
  }

  const goto = async (path) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  };
  const shot = async (name) => {
    mkdirSync(SCREENS, { recursive: true });
    const file = join(SCREENS, `${name}.png`);
    await page.screenshot({ path: file, fullPage: opts.full });
    console.log(`screenshot: ${relative(ROOT, file)}`);
  };
  const snapshot = async () => {
    const main = page.locator("main");
    const target = (await main.count()) > 0 ? main.first() : page.locator("body");
    console.log(`--- ${page.url().replace(base, "")}`);
    console.log(await target.ariaSnapshot());
  };

  let failed = false;
  try {
    await fn({ page, goto, shot, snapshot });
  } catch (err) {
    failed = true;
    console.error(`error: ${err.message.split("\n")[0]}`);
    await shot("failure").catch(() => {});
  } finally {
    await browser.close();
  }

  if (problems.length) {
    console.log(`\n${problems.length} browser problem(s):`);
    for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
  }
  return failed || (problems.length > 0 && !opts.allowErrors) ? 1 : 0;
}

async function runFlow(ctx, steps) {
  const { page, goto, shot, snapshot } = ctx;
  for (const [i, step] of steps.entries()) {
    const [kind, arg] = Object.entries(step)[0];
    console.log(`  ${i + 1}. ${kind} ${typeof arg === "string" ? arg : JSON.stringify(arg)}`);
    switch (kind) {
      case "goto":
        await goto(arg);
        break;
      case "click":
        await locate(page, arg).click();
        await page.waitForLoadState("networkidle");
        break;
      case "fill":
        await locate(page, arg).fill(String(arg.value));
        break;
      case "select":
        await locate(page, arg).selectOption({ label: arg.option });
        break;
      case "expectText":
        await page.getByText(arg, { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
        break;
      case "expectVisible":
        await locate(page, arg).waitFor({ state: "visible", timeout: 5000 });
        break;
      case "expectUrl":
        await page.waitForURL((u) => (u.pathname + u.search).endsWith(arg), { timeout: 5000 });
        break;
      case "shot":
        await shot(arg);
        break;
      case "snapshot":
        await snapshot();
        break;
      default:
        throw new Error(`unknown step "${kind}"`);
    }
  }
}

const { opts, command, args } = parseArgs(process.argv.slice(2));
let code = 0;

switch (command) {
  case "shot":
    code = await session(opts, async ({ goto, shot }) => {
      const path = args[0] ?? "/";
      await goto(path);
      await shot(opts.out ?? `${slug(path)}${opts.as !== "editor" ? `.${opts.as}` : ""}`);
    });
    break;
  case "snapshot":
    code = await session(opts, async ({ goto, snapshot }) => {
      await goto(args[0] ?? "/");
      await snapshot();
    });
    break;
  case "run":
  case "flows": {
    const files =
      command === "run"
        ? args
        : readdirSync(join(ROOT, "services", opts.service, "flows"))
            .filter((f) => f.endsWith(".json"))
            .map((f) => join("services", opts.service, "flows", f));
    if (files.length === 0) throw new Error("no flow files given");
    for (const file of files) {
      const flow = JSON.parse(readFileSync(resolve(ROOT, file), "utf8"));
      const steps = Array.isArray(flow) ? flow : flow.steps;
      const flowOpts = Array.isArray(flow)
        ? opts
        : { ...opts, as: flow.as ?? opts.as, allowHttp: flow.allowHttp ?? [] };
      console.log(`flow ${file}${flowOpts.as !== "editor" ? ` (as ${flowOpts.as})` : ""}`);
      const c = await session(flowOpts, (ctx) => runFlow(ctx, steps));
      console.log(c === 0 ? "  ok\n" : "  FAILED\n");
      code ||= c;
    }
    break;
  }
  default:
    console.log(
      readFileSync(fileURLToPath(import.meta.url), "utf8")
        .split("\n")
        .slice(1, 26)
        .join("\n")
        .replace(/^\/\/ ?/gm, ""),
    );
    code = command ? 1 : 0;
}
process.exit(code);
