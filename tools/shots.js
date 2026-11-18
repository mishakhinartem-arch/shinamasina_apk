const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const [w, h, url, out, js] = process.argv.slice(2);
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8765/" + url); await p.waitForTimeout(400);
  if (js) { await p.evaluate(js); await p.waitForTimeout(400); }
  await p.screenshot({ path: out });
  console.log(errs.join("\n") || "ok");
  await b.close();
})();
