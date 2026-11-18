// Загружает модули в Node (globalThis) для тестов.
const fs = require("fs"), path = require("path"), vm = require("vm");
const files = ["prices-data", "core", "store", "prices", "cart", "payroll", "shift", "orders", "warehouse", "storage", "booking", "reports", "excel", "seed", "docs"];
for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8"), { filename: f + ".js" });
module.exports = globalThis.SM;
