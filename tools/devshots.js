// Быстрые скриншоты разделов для разработки: node devshots.js queue,cars,warehouse
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto((process.env.BASE || "http://localhost:8765/") + "index.html#kassa"); await p.waitForTimeout(500);
  for (const v of (process.argv[2] || "kassa").split(",")) {
    if (v.startsWith("js:")) { await p.evaluate(v.slice(3)); await p.waitForTimeout(300); continue; }
    if (v.startsWith("click:")) { await p.locator(v.slice(6)).first().click(); await p.waitForTimeout(300); continue; }
    if (v.startsWith("shot:")) { await p.screenshot({ path: "/tmp/d_" + v.slice(5) + ".png" }); continue; }
    await p.evaluate((x) => SM.ui.go(x), v); await p.waitForTimeout(300);
    await p.screenshot({ path: "/tmp/d_" + v + ".png" });
  }
  console.log(errs.join("\n") || "no errors"); await b.close();
})();
