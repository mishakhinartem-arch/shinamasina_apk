// Иконки PWA из icon.svg (192/512 + maskable 512). Запуск: node tools/make-icons.js
const { chromium } = require("playwright-core"); const fs = require("fs");
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const svg = fs.readFileSync(__dirname + "/../icon.svg", "utf8");
  for (const [n, size, mask] of [["icon-192", 192, false], ["icon-512", 512, false], ["icon-maskable-512", 512, true]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const inner = mask ? svg.replace('rx="28"', 'rx="0"').replace("<svg ", '<svg style="transform:scale(.78)" ') : svg;
    await p.setContent('<html><body style="margin:0;background:' + (mask ? "#0f1419" : "transparent") + ';display:flex;align-items:center;justify-content:center;width:' + size + "px;height:" + size + 'px">' + inner.replace("<svg ", '<svg width="' + size + '" height="' + size + '" ') + "</body></html>");
    await p.screenshot({ path: __dirname + "/../icons/" + n + ".png", omitBackground: !mask });
    await p.close();
  }
  await b.close(); console.log("ok");
})();
