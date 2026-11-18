// Собирает js/docs.js из /workspace/kassa-pravki/*.md (договор хранения, согласие на ПД).
// Запуск: node tools/build-docs.js
const fs = require("fs"), path = require("path");
const PRAVKI = path.join(__dirname, "..", "..", "kassa-pravki");
const SRC = process.env.DOCS_SRC || (fs.existsSync(path.join(PRAVKI, "soglasie.md")) ? PRAVKI : path.join(__dirname, "..", "docs"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[\[(.+?)\]\]/g, (m, k) => '<span class="fill" data-f="' + k + '">[' + k + "]</span>");
}
function md(src) {
  const out = []; let para = [], list = null, table = null;
  const flush = () => {
    if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; }
    if (list) { out.push("<ul>" + list.map((l) => "<li>" + inline(l) + "</li>").join("") + "</ul>"); list = null; }
    if (table) { const [h, , ...rows] = table; const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()); out.push("<table><tr>" + cells(h).map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr>" + rows.map((r) => "<tr>" + cells(r).map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</table>"); table = null; }
  };
  src.split(/\r?\n/).forEach((ln) => {
    if (/^\s*$/.test(ln)) return flush();
    let m;
    if ((m = ln.match(/^(#{1,3}) (.*)/))) { flush(); out.push("<h" + (m[1].length + 1) + ">" + inline(m[2]) + "</h" + (m[1].length + 1) + ">"); return; }
    if (/^---+$/.test(ln)) { flush(); out.push('<hr class="pb">'); return; }
    if ((m = ln.match(/^> ?(.*)/))) { flush(); out.push('<div class="doc-note">' + inline(m[1]) + "</div>"); return; }
    if ((m = ln.match(/^- (.*)/))) { if (para.length || table) flush(); (list = list || []).push(m[1]); return; }
    if (/^\|/.test(ln)) { if (para.length || list) flush(); (table = table || []).push(ln); return; }
    if (list || table) flush();
    para.push(ln);
  });
  flush();
  return out.join("\n");
}
const contract = md(fs.readFileSync(path.join(SRC, "dogovor_hraneniya.md"), "utf8"));
const consent = md(fs.readFileSync(path.join(SRC, "soglasie.md"), "utf8"));
const js = "/* СГЕНЕРИРОВАНО tools/build-docs.js из kassa-pravki/dogovor_hraneniya.md и soglasie.md — правьте .md и пересоберите. ШАБЛОНЫ, юристом не проверены. */\n" +
  "(function (root) {\n  const SM = root.SM;\n  SM.DOCS = " + JSON.stringify({ contract, consent }) + ";\n" +
  "  /** Подставить значения в поля [[...]]; незаполненные остаются линиями для ручного заполнения. */\n" +
  "  SM.docFill = function (html, map) { map = map || {}; return html.replace(/<span class=\"fill\" data-f=\"([^\"]+)\">[^<]*<\\/span>/g, function (m, k) { var v = map[k]; return v != null && v !== \"\" ? '<b class=\"filled\">' + SM.esc(String(v)) + \"</b>\" : '<span class=\"blank\">____________</span>'; }); };\n" +
  "})(typeof window !== \"undefined\" ? window : globalThis);\n";
fs.writeFileSync(path.join(__dirname, "..", "js", "docs.js"), js);
console.log("js/docs.js:", js.length, "байт; договор", contract.length, "· согласие", consent.length);
