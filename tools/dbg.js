const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: +(process.env.W||1280), height: +(process.env.H||800) } });
  await p.goto("http://localhost:8765/index.html#kassa"); await p.waitForTimeout(500);
  console.log(await p.evaluate(process.argv[2]));
  await b.close();
})();
