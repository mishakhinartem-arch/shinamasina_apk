/* Ядро: пространство имён SM, время, форматирование. Демо-версия «Шинамашина». */
(function (root) {
  const SM = (root.SM = root.SM || {});
  SM.clock = { offset: 0, fixed: null };
  SM.now = function () { return SM.clock.fixed != null ? SM.clock.fixed : Date.now() + SM.clock.offset; };
  SM.uid = function (p) { return (p || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); };
  SM.fmt = function (n) { n = Math.round(Number(n) || 0); return (n < 0 ? "−" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + "\u00a0₽"; };
  SM.num = function (n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0"); };
  SM.round50 = function (x) { return Math.round((Number(x) || 0) / 50) * 50; };
  SM.round2 = function (x) { return Math.round((Number(x) || 0) * 100) / 100; };
  const pad = (n) => String(n).padStart(2, "0");
  SM.pad = pad;
  SM.dayKey = function (ts) { const d = new Date(ts); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  SM.monthKey = function (ts) { const d = new Date(ts); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  SM.monthAdd = function (mk, k) { let [y, m] = mk.split("-").map(Number); m += k; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + "-" + pad(m); };
  SM.monthName = function (mk) { const n = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"]; const [y, m] = mk.split("-").map(Number); return n[m - 1] + " " + y; };
  SM.monthRange = function (mk) { const [y, m] = mk.split("-").map(Number); return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()]; };
  SM.dayStart = function (ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  SM.fmtTime = function (ts) { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  SM.fmtDate = function (ts) { const d = new Date(ts); return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear(); };
  SM.fmtDT = function (ts) { return SM.fmtDate(ts) + " " + SM.fmtTime(ts); };
  SM.fmtDay = function (key) { const [y, m, d] = key.split("-"); return d + "." + m + "." + y; };
  SM.hoursLabel = function (h) { const t = Math.round((Number(h) || 0) * 60), hh = Math.floor(t / 60), mm = t % 60; return hh + " ч " + pad(mm) + " мин"; };
  SM.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); };
  SM.normPhone = function (p) { let d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && (d[0] === "8" || d[0] === "7")) d = "7" + d.slice(1); if (d.length === 10) d = "7" + d; return d; };
  SM.phoneShow = function (p) { const d = SM.normPhone(p); if (d.length !== 11) return p || ""; return "+7 " + d.slice(1, 4) + " " + d.slice(4, 7) + "-" + d.slice(7, 9) + "-" + d.slice(9, 11); };
  SM.PLATE_LETTERS = "АВЕКМНОРСТУХ";
  SM.normPlate = function (p) {
    const lat = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х" };
    return String(p || "").toUpperCase().replace(/[\s\-]/g, "").replace(/[ABEKMHOPCTYX]/g, (c) => lat[c]);
  };
  SM.plateValid = function (p) { return /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/.test(SM.normPlate(p)); };
  SM.plateMiddle = function (p) { const m = SM.normPlate(p).match(/^[^\d]*(\d{3})/); return m ? m[1] : ""; };
  SM.plateParts = function (p) {
    const s = SM.normPlate(p);
    const m = s.match(/^([АВЕКМНОРСТУХ]?)(\d{0,3})([АВЕКМНОРСТУХ]{0,2})(\d{0,3})$/);
    if (!m) return { main: s, region: "", free: true };
    return { main: (m[1] + " " + m[2] + " " + m[3]).trim(), region: m[4], free: false };
  };
})(typeof window !== "undefined" ? window : globalThis);
