const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const vw = process.argv[3] ? JSON.parse(process.argv[3]) : { width: 1280, height: 800 };
  const p = await b.newPage({ viewport: vw, deviceScaleFactor: 1 });
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE " + m.text()); });
  const pages = (process.argv[2] || "index.html#kassa").split(",");
  for (const u of pages) {
    await p.goto("http://localhost:8765/" + u); await p.waitForTimeout(600);
    const name = u.replace(/[^a-z]/gi, "_");
    await p.screenshot({ path: "/tmp/s_" + name + ".png" });
  }
  console.log(errs.join("\n") || "no errors");
  await b.close();
})();
