/* Расчёт заказа: надбавка +20% (как сейчас), скидка постоянным 10%, ручная скидка, лимит скидки. */
(function (root) {
  const SM = root.SM;
  const C = (SM.cart = {});
  /**
   * base = Σ price×qty; surcharge = 20% от строк «Монтаж/Демонтаж/Переобувка 4 колеса/Итого за 1 колесо» целиком;
   * subtotal = base + surcharge; loyalty = 10% от subtotal; manual = ₽ или % от subtotal; total = subtotal − скидки.
   */
  C.totals = function (order, settings) {
    settings = settings || SM.DEFAULT_SETTINGS;
    let base = 0, sb = 0, storage = 0, goods = 0, paint = 0;
    (order.items || []).forEach((i) => { const l = (Number(i.price) || 0) * (Number(i.qty) || 0); if (i.goods) { goods += l; return; } if (i.key === "paint") { paint += l; return; } if (i.noDiscount) { storage += l; return; } base += l; if (i.surchargeEligible) sb += l; });
    const surcharge = order.runflat ? Math.round(sb * (settings.surchargePct || 20) / 100) : 0;
    // Скидки (постоянному и ручная) считаются только от услуг; позиции хранения (noDiscount) — без скидки.
    const discountBase = Math.round(base + surcharge);
    const subtotal = discountBase + Math.round(storage) + Math.round(goods) + Math.round(paint);
    const loyalty = order.loyalty ? Math.round(discountBase * (settings.loyaltyPct || 10) / 100) : 0;
    let manual = 0;
    const d = order.discount;
    if (d && d.value > 0) manual = d.type === "pct" ? Math.round(discountBase * d.value / 100) : Math.round(d.value);
    let discount = Math.min(discountBase, loyalty + manual);
    const services = discountBase - discount;
    return { base: Math.round(base), surchargeBase: Math.round(sb), surcharge, discountBase, storage: Math.round(storage), subtotal, loyalty, manual, discount, discountPct: discountBase > 0 ? (discount / discountBase) * 100 : 0, services, goods: Math.round(goods), paint: Math.round(paint), total: Math.round(services + storage + goods + paint), count: (order.items || []).reduce((s, i) => s + (i.gift || i.noDiscount || i.goods || i.key === "paint" ? 0 : i.qty), 0) };
  };
  /** Лимит скидки: max % и max ₽ (₽ пересчитываются в % от заказа). 0 = без ограничений. */
  C.discountLimit = function (settings, subtotal) {
    const lims = [];
    if (settings.discountMaxPct > 0) lims.push({ pct: settings.discountMaxPct, src: settings.discountMaxPct + "%" });
    if (settings.discountMaxRub > 0 && subtotal > 0) lims.push({ pct: (settings.discountMaxRub / subtotal) * 100, src: SM.fmt(settings.discountMaxRub) });
    if (!lims.length) return null;
    lims.sort((a, b) => a.pct - b.pct);
    const l = lims[0];
    return { pct: l.pct, rub: Math.floor((subtotal * l.pct) / 100 + 1e-6), src: l.src };
  };
  C.checkDiscount = function (order, settings) {
    const t = C.totals(order, settings);
    // Лимит — на ручную скидку кассира. Скидка постоянному 10% — правило владельца, в лимит не входит.
    const lim = C.discountLimit(settings, t.discountBase);
    if (!lim || t.manual <= 0) return { ok: true, totals: t, limit: lim };
    if (t.manual > lim.rub + 0.5) {
      const pct = t.discountBase > 0 ? (t.manual / t.discountBase) * 100 : 0;
      return { ok: false, totals: t, limit: lim, msg: "Скидка " + SM.fmt(t.manual) + " (" + pct.toFixed(1).replace(".", ",") + "%) больше лимита. Максимум для этого заказа — " + SM.fmt(lim.rub) + " (" + lim.pct.toFixed(1).replace(".", ",") + "%, ограничение " + lim.src + "). Изменить лимит может владелец в админке." };
    }
    return { ok: true, totals: t, limit: lim };
  };
  /** Сумма чека за услуги (без хранения, товаров и покраски дисков) — база для процента мастеров и выручки «услуги». */
  C.serviceAmount = (r) => (r.kind === "service" ? r.total - ((r.totals && r.totals.storage) || 0) - ((r.totals && r.totals.goods) || 0) - C.paintAmount(r) : 0);
  /** Покраска дисков (позиция «Покраска» наряда): без скидок, НЕ в базе процента мастеров (ответ Артёма 19.11). Правка и услуги прайса в наряде — в базе. */
  C.paintAmount = (r) => { if (r.kind !== "service") return 0; if (r.totals && r.totals.paint != null) return r.totals.paint; return (r.items || []).filter((i) => i.key === "paint").reduce((s, i) => s + i.price * i.qty, 0); };
  /** Товары в чеке: без скидок, не в базе процента мастеров. */
  C.goodsAmount = (r) => (r.totals && r.totals.goods) || 0;
  C.storageAmount = (r) => (r.kind === "storage" ? r.total : (r.totals && r.totals.storage) || 0);
})(typeof window !== "undefined" ? window : globalThis);
