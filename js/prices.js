/* Каталог услуг из prices.js (window.PRICES / state.prices). */
(function (root) {
  const SM = root.SM;
  const P = (SM.prices = {});
  P.TYPES = [ { key: "passenger", label: "Легковая" }, { key: "crossover", label: "Кроссовер" }, { key: "jeep", label: "Джип / микроавтобус" }, { key: "commercial", label: "Коммерческий" }, { key: "gazel", label: "Газель" } ];
  P.GROUPS = [ { key: "tire", label: "Шиномонтаж" }, { key: "repair", label: "Ремонт" }, { key: "small", label: "Мелочи" } ];
  P.RADII = ["R13", "R14", "R15", "R16", "R17", "R18", "R19", "R20", "R21", "R22"];
  P.KITS = { "Переобувка 4 колеса": "= 4 × «Итого за 1 колесо»", "Комплекс без смены резины": "снятие/установка + балансировка 4 колёс", "Снятие и установка 4-х колёс": "без монтажа и балансировки" };
  P.REPAIR_EXTRAS = ["Ремонт грибком", "Ремонт жгутом", "Ремонт камеры", "Вулканизация бескамерной", "Правка дисков"];
  P.GIFT = { key: "gift", name: "Акция: пакеты в подарок", price: 0, gift: true };
  P.STARTER = ["r:Переобувка 4 колеса", "r:Комплекс без смены резины", "r:Итого за 1 колесо", "r:Балансировка", "r:Монтаж", "r:Демонтаж", "f:Ремонт жгутом", "f:Ремонт грибком", "f:Обработка герметиком"];
  /** Газель — 6 колёс (сдвоенные задние): комплекты «… 4 колеса» на Газели называются «6 колёс». */
  P.GAZEL_WHEELS = 6;
  P.wheels = (typeKey) => (typeKey === "gazel" ? P.GAZEL_WHEELS : 4);
  P.GAZEL_NAMES = { "Переобувка 4 колеса": "Переобувка 6 колёс", "Снятие и установка 4-х колёс": "Снятие и установка 6 колёс", "Комплекс без смены резины": "Комплекс без смены резины (6 колёс)" };
  P.GAZEL_NOTES = { "Переобувка 4 колеса": "= 6 × «Итого за 1 колесо» (Газель — 6 колёс)", "Снятие и установка 4-х колёс": "6 колёс, без монтажа и балансировки", "Комплекс без смены резины": "снятие/установка + балансировка 6 колёс" };
  /** Пересчёт «Переобувки» Газели на 6 колёс: 6 × «Итого за 1 колесо». Только если владелец ещё не менял старую цену 5 500 ₽. */
  P.gazelKitFix = function (prices) {
    const sec = prices.commercial; if (!sec) return false;
    const i = sec.radii.indexOf("Газель"), kit = sec.services["Переобувка 4 колеса"], one = sec.services["Итого за 1 колесо"];
    if (i < 0 || !kit || !one || kit[i] !== 5500 || !(one[i] > 0)) return false;
    kit[i] = P.GAZEL_WHEELS * one[i]; return true;
  };
  P.typeLabel = (k) => (P.TYPES.find((t) => t.key === k) || { label: k }).label;
  /**
   * Колонка прайса для типа авто и радиуса. «Коммерческий» — колонки R14C/R15C/R16C раздела commercial
   * (кнопки R14–R16), «Газель» — колонка «Газель» того же раздела, только на R16.
   */
  P.col = function (prices, typeKey, radius) {
    let sec = null, col = radius;
    if (typeKey === "commercial") { sec = prices.commercial; col = /^R1[456]$/.test(radius) ? radius + "C" : null; }
    else if (typeKey === "gazel") { sec = prices.commercial; col = radius === "R16" ? "Газель" : null; }
    else sec = prices[typeKey];
    if (!sec || !col) return null;
    const idx = sec.radii.indexOf(col);
    return idx < 0 ? null : { sec, idx, col };
  };
  P.radiusPrice = function (prices, typeKey, svc, radius) {
    const c = P.col(prices, typeKey, radius); if (!c) return null;
    const arr = c.sec.services[svc]; if (!arr) return null;
    const v = arr[c.idx]; return v == null || v === "" ? null : Number(v);
  };
  P.hasRadius = (prices, typeKey, radius) => !!P.col(prices, typeKey, radius);
  /** Владелец правит цену услуги «по радиусу» (пусто / 0 — нет цены). */
  P.setRadialPrice = function (prices, svc, typeKey, radius, price) {
    const c = P.col(prices, typeKey, radius); if (!c || !c.sec.services[svc]) return { ok: false, msg: "Нет такой колонки в прайсе" };
    const v = Math.round(Number(price));
    c.sec.services[svc][c.idx] = price === "" || price == null || !(v > 0) ? null : v;
    return { ok: true };
  };
  P.isSurcharge = (prices, name) => (prices.surchargeEligibleNames || []).indexOf(name) >= 0;
  /** Все плитки для типа/радиуса. */
  P.catalog = function (prices, typeKey, radius, opts) {
    const all = P.catalogAll(prices, typeKey, radius);
    if (opts && opts.all) return all;
    const hid = prices.hidden || [];
    return all.filter((t) => hid.indexOf(t.key) < 0);
  };
  P.isHidden = (prices, key) => (prices.hidden || []).indexOf(key) >= 0;
  P.catalogAll = function (prices, typeKey, radius) {
    const out = [];
    const order = prices.packageOrder || Object.keys(prices.passenger.services);
    order.forEach((svc) => {
      const price = P.radiusPrice(prices, typeKey, svc, radius);
      const gz = typeKey === "gazel" && P.GAZEL_NAMES[svc];
      out.push({ key: "r:" + svc, name: gz ? P.GAZEL_NAMES[svc] : svc, price: price, radial: true, group: "tire", kind: P.KITS[svc] ? "kit" : "single", note: gz ? P.GAZEL_NOTES[svc] : P.KITS[svc] || "", wheels: P.KITS[svc] ? P.wheels(typeKey) : 1, surchargeEligible: P.isSurcharge(prices, svc), unit: P.KITS[svc] ? "" : "шт" });
    });
    (prices.repair.items || []).forEach((it) => out.push(flat(prices, it, "repair")));
    (prices.extras.items || []).forEach((it) => out.push(flat(prices, it, P.REPAIR_EXTRAS.indexOf(it.name) >= 0 ? "repair" : "small")));
    (prices.custom || []).forEach((c) => out.push(customTile(c, typeKey, radius)));
    out.push({ key: "gift", name: P.GIFT.name, price: 0, gift: true, group: "small", kind: "single", note: "0 ₽, по умолчанию 4 шт" });
    return out;
  };
  /** Услуги, добавленные владельцем: фикс, «по радиусу и типу авто» или «цена вводится». */
  function customTile(c, typeKey, radius) {
    const base = { key: "c:" + c.id, name: c.name, group: c.group || "small", kind: "single", note: c.note || "", surchargeEligible: !!c.surcharge, custom: true, mode: c.mode };
    if (c.mode === "radial") { const v = c.grid && c.grid[typeKey] && c.grid[typeKey][radius]; return Object.assign(base, { price: v > 0 ? Number(v) : null, radial: true, unit: "шт" }); }
    if (c.mode === "manual") return Object.assign(base, { price: null, manual: true, fromPrice: Number(c.fromPrice) || 0, radial: false });
    return Object.assign(base, { price: Number(c.price), radial: false });
  }
  P.MODES = { fixed: "фиксированная цена", radial: "по радиусу и типу авто", manual: "цена вводится на кассе" };
  P.findFlat = function (prices, name) { for (const sk of ["repair", "extras"]) { const it = (prices[sk].items || []).find((x) => x.name === name); if (it) return it; } return null; };
  P.setFlatPrice = function (prices, name, price) {
    const it = P.findFlat(prices, name); const v = Math.round(Number(price));
    if (!it) return { ok: false, msg: "Услуга не найдена" };
    if (!(v > 0)) return { ok: false, msg: "Цена должна быть больше 0 ₽" };
    if (it.manualPrice) it.fromPrice = v; else it.price = v;
    return { ok: true };
  };
  P.setHidden = function (prices, key, hidden) {
    if (key === "gift") return { ok: false, msg: "Акцию «пакеты в подарок» скрыть нельзя" };
    prices.hidden = (prices.hidden || []).filter((k) => k !== key);
    if (hidden) prices.hidden.push(key);
    return { ok: true };
  };
  function cleanGrid(grid) {
    const out = {}; let n = 0;
    Object.keys(grid || {}).forEach((t) => Object.keys(grid[t] || {}).forEach((r) => { const v = Math.round(Number(grid[t][r])); if (grid[t][r] !== "" && v > 0) { (out[t] = out[t] || {})[r] = v; n++; } }));
    return { grid: out, n };
  }
  function checkCustom(prices, d, selfId) {
    const name = String(d.name || "").trim();
    if (!name) return "Укажите название";
    const taken = P.catalogAll(prices, "passenger", "R16").some((t) => t.name.toLowerCase() === name.toLowerCase() && t.key !== "c:" + selfId);
    if (taken) return "Услуга «" + name + "» уже есть в прайсе";
    if (P.GROUPS.every((g) => g.key !== d.group)) return "Выберите раздел";
    if (d.mode === "fixed" && !(Math.round(Number(d.price)) > 0)) return "Цена должна быть больше 0 ₽";
    if (d.mode === "radial" && !cleanGrid(d.grid).n) return "Заполните цену хотя бы для одного радиуса";
    if (d.mode === "manual" && !(Number(d.fromPrice) >= 0)) return "Укажите «цена от»";
    if (!P.MODES[d.mode]) return "Выберите вид цены";
    return null;
  }
  P.addCustom = function (prices, d) {
    const err = checkCustom(prices, d); if (err) return { ok: false, msg: err };
    const c = { id: SM.uid("svc"), name: String(d.name).trim(), group: d.group, mode: d.mode, price: d.mode === "fixed" ? Math.round(Number(d.price)) : null, fromPrice: d.mode === "manual" ? Math.round(Number(d.fromPrice) || 0) : null, grid: d.mode === "radial" ? cleanGrid(d.grid).grid : null, note: d.note || "", surcharge: !!d.surcharge };
    (prices.custom = prices.custom || []).push(c);
    return { ok: true, service: c, key: "c:" + c.id };
  };
  P.updateCustom = function (prices, id, d) {
    const c = (prices.custom || []).find((x) => x.id === id); if (!c) return { ok: false, msg: "Услуга не найдена" };
    const nd = Object.assign({}, c, d); const err = checkCustom(prices, nd, id); if (err) return { ok: false, msg: err };
    Object.assign(c, { name: String(nd.name).trim(), group: nd.group, mode: nd.mode, price: nd.mode === "fixed" ? Math.round(Number(nd.price)) : null, fromPrice: nd.mode === "manual" ? Math.round(Number(nd.fromPrice) || 0) : null, grid: nd.mode === "radial" ? cleanGrid(nd.grid).grid : null, note: nd.note || "", surcharge: !!nd.surcharge });
    return { ok: true, service: c };
  };
  function flat(prices, it, group) {
    return { key: "f:" + it.name, name: it.name, price: it.manualPrice ? null : Number(it.price), manual: !!it.manualPrice, fromPrice: it.fromPrice || 0, note: it.note || "", group: group, kind: "single", surchargeEligible: P.isSurcharge(prices, it.name), radial: false };
  }
  P.find = function (prices, key, typeKey, radius) { return P.catalog(prices, typeKey, radius).find((t) => t.key === key) || null; };
  /** «Частые»: топ по количеству в чеках за 60 дней, иначе стартовый набор. */
  P.frequent = function (S, limit) {
    limit = limit || 9;
    const since = SM.now() - 60 * 864e5, cnt = {};
    S.receipts.forEach((r) => { if (r.kind !== "service" || r.ts < since) return; (r.items || []).forEach((i) => { if (i.key && i.key !== "gift") cnt[i.key] = (cnt[i.key] || 0) + 1; }); });
    const keys = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
    if (keys.length < 4) return P.STARTER.slice(0, limit);
    const res = keys.slice(0, limit);
    P.STARTER.forEach((k) => { if (res.length < limit && res.indexOf(k) < 0) res.push(k); });
    // комплекты — первыми, как в макете; остальное по частоте
    const kit = (k) => (P.KITS[k.slice(2)] ? 0 : 1);
    return res.sort((a, b) => kit(a) - kit(b) || (cnt[b] || 0) - (cnt[a] || 0));
  };
})(typeof window !== "undefined" ? window : globalThis);
