/* Каталог услуг из prices.js (window.PRICES / state.prices). */
(function (root) {
  const SM = root.SM;
  const P = (SM.prices = {});
  P.TYPES = [ { key: "passenger", label: "Легковая" }, { key: "crossover", label: "Кроссовер" }, { key: "jeep", label: "Джип / микроавтобус" } ];
  P.RADII = ["R13", "R14", "R15", "R16", "R17", "R18", "R19", "R20", "R21", "R22"];
  P.KITS = { "Переобувка 4 колеса": "= 4 × «Итого за 1 колесо»", "Комплекс без смены резины": "снятие/установка + балансировка 4 колёс", "Снятие и установка 4-х колёс": "без монтажа и балансировки" };
  P.REPAIR_EXTRAS = ["Ремонт грибком", "Ремонт жгутом", "Ремонт камеры", "Вулканизация бескамерной", "Правка дисков"];
  P.GIFT = { key: "gift", name: "Акция: пакеты в подарок", price: 0, gift: true };
  P.STARTER = ["r:Переобувка 4 колеса", "r:Комплекс без смены резины", "r:Итого за 1 колесо", "r:Балансировка", "r:Монтаж", "r:Демонтаж", "f:Ремонт жгутом", "f:Ремонт грибком", "f:Обработка герметиком"];
  P.typeLabel = (k) => (P.TYPES.find((t) => t.key === k) || { label: k }).label;
  P.radiusPrice = function (prices, typeKey, svc, radius) {
    const t = prices[typeKey]; if (!t) return null;
    const i = t.radii.indexOf(radius); if (i < 0) return null;
    const arr = t.services[svc]; if (!arr) return null;
    const v = arr[i]; return v == null ? null : Number(v);
  };
  P.hasRadius = (prices, typeKey, radius) => !!(prices[typeKey] && prices[typeKey].radii.indexOf(radius) >= 0);
  P.isSurcharge = (prices, name) => (prices.surchargeEligibleNames || []).indexOf(name) >= 0;
  /** Все плитки для типа/радиуса. */
  P.catalog = function (prices, typeKey, radius) {
    const out = [];
    const order = prices.packageOrder || Object.keys(prices.passenger.services);
    order.forEach((svc) => {
      const price = P.radiusPrice(prices, typeKey, svc, radius);
      out.push({ key: "r:" + svc, name: svc, price: price, radial: true, group: "tire", kind: P.KITS[svc] ? "kit" : "single", note: P.KITS[svc] || "", surchargeEligible: P.isSurcharge(prices, svc), unit: P.KITS[svc] ? "" : "шт" });
    });
    (prices.repair.items || []).forEach((it) => out.push(flat(prices, it, "repair")));
    (prices.extras.items || []).forEach((it) => out.push(flat(prices, it, P.REPAIR_EXTRAS.indexOf(it.name) >= 0 ? "repair" : "small")));
    out.push({ key: "gift", name: P.GIFT.name, price: 0, gift: true, group: "small", kind: "single", note: "0 ₽, по умолчанию 4 шт" });
    return out;
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
