/* Покраска дисков — отложенный заказ-наряд: при приёме денег не берём, наряд лежит в «В покраске»,
   при выдаче всё (покраска + правка + услуги из прайса) оплачивается одним чеком. */
(function (root) {
  const SM = root.SM;
  const PN = (SM.paint = {});
  PN.STATUS = { paint: "В покраске", ready: "Готово, ждёт выдачи", done: "Выдано (оплачено)", cancel: "Отменён" };
  /** Состояние дисков при приёмке (можно выбрать несколько) — печатается в акте. */
  PN.DISK_CONDITIONS = ["без повреждений", "царапины", "сколы краски", "коррозия", "бордюрка (потёртости кромки)", "погнут", "трещина", "следы прежней покраски"];
  PN.condText = (p) => (p.diskCondition && p.diskCondition.length ? p.diskCondition.join(", ") : "");
  PN.get = (S, id) => S.paint.find((p) => p.id === id) || null;
  PN.active = (S) => S.paint.filter((p) => p.status === "paint" || p.status === "ready").sort((a, b) => a.createdAt - b.createdAt);
  PN.title = (p) => "Наряд П-" + String(p.no).padStart(3, "0");
  PN.log = (p, who, text) => p.history.push({ ts: SM.now(), who: who || "Касса", text });
  PN.totals = (S, p) => SM.cart.totals({ items: p.items }, S.settings);
  /** Сумма к оплате по всем нарядам «в покраске» (долг клиентов при выдаче). */
  PN.due = (S) => PN.active(S).reduce((s, p) => s + PN.totals(S, p).total, 0);
  function svcItem(S, s) {
    const tile = SM.prices.find(S.prices, s.key, s.typeKey || "passenger", s.radius || "R16");
    if (!tile || tile.gift) return { err: "Услуга не найдена в прайсе: " + s.key };
    const price = tile.manual ? Math.round(Number(s.price)) : tile.price;
    if (!(price > 0)) return { err: tile.name + ": нет цены" + (tile.radial ? " для " + s.radius : "") };
    const qty = Math.max(1, Math.round(Number(s.qty) || 1));
    return { item: { id: SM.uid("i"), key: tile.key, name: tile.name, price, qty, radius: tile.radial ? s.radius : "", typeKey: tile.radial ? s.typeKey : "", surchargeEligible: false, manual: !!tile.manual, gift: false } };
  }
  /**
   * d: { plate, phone, name, car, radius, typeKey, disks, color, caps, tires, tireBrand,
   *      straighten: { qty, sum } | null, paintPrice, services: [{ key, qty, typeKey, radius, price }], comment }
   */
  PN.create = function (S, d, who) {
    const plate = SM.normPlate(d.plate || ""), phone = SM.normPhone(d.phone || "");
    if (!plate && phone.length !== 11) return { ok: false, msg: "Нужен госномер или телефон клиента" };
    const disks = Math.round(Number(d.disks));
    if (!(disks >= 1 && disks <= 8)) return { ok: false, msg: "Количество дисков: от 1 до 8" };
    if (!String(d.color || "").trim()) return { ok: false, msg: "Укажите цвет" };
    const paintPrice = Math.round(Number(d.paintPrice));
    if (!(paintPrice > 0)) return { ok: false, msg: "Сумма покраски должна быть больше 0 ₽" };
    if (d.tires && !String(d.tireBrand || "").trim()) return { ok: false, msg: "Диски с резиной — укажите марку резины" };
    let straighten = null;
    if (d.straighten) {
      const q = Math.round(Number(d.straighten.qty)), sum = Math.round(Number(d.straighten.sum));
      if (!(q >= 1 && q <= disks)) return { ok: false, msg: "Правка: количество дисков от 1 до " + disks };
      if (!(sum > 0)) return { ok: false, msg: "Правка: сумма больше 0 ₽" };
      straighten = { qty: q, sum };
    }
    const items = [{ id: SM.uid("i"), key: "paint", name: "Покраска дисков ×" + disks + " (" + String(d.color).trim() + ")", price: paintPrice, qty: 1, radius: d.radius || "", typeKey: "", surchargeEligible: false, manual: true, gift: false }];
    if (straighten) items.push({ id: SM.uid("i"), key: "f:Правка дисков", name: "Правка дисков (" + straighten.qty + " шт)", price: straighten.sum, qty: 1, radius: "", typeKey: "", surchargeEligible: false, manual: true, gift: false });
    for (const s of d.services || []) { const r = svcItem(S, s); if (r.err) return { ok: false, msg: r.err }; items.push(r.item); }
    const fc = plate ? SM.clients.findByPlate(S, plate) : null;
    const client = (fc && fc.client) || (d.clientId && SM.client(S, d.clientId)) || (phone.length === 11 && SM.clientByPhone(S, phone)) || null;
    const diskCondition = (Array.isArray(d.diskCondition) ? d.diskCondition : d.diskCondition ? [d.diskCondition] : []).map((x) => String(x).trim()).filter(Boolean);
    if (diskCondition.indexOf("без повреждений") >= 0 && diskCondition.length > 1) return { ok: false, msg: "Состояние дисков: «без повреждений» нельзя вместе с повреждениями" };
    const p = { id: SM.uid("pn"), no: ++S.paintSeq, createdAt: SM.now(), status: "paint", plate, phone, name: String(d.name || (client && client.name) || "").trim(), car: d.car || "", clientId: client ? client.id : null, carId: fc ? fc.car.id : d.carId || null, radius: d.radius || "", disks, diskCondition, color: String(d.color).trim(), caps: !!d.caps, tires: !!d.tires, tireBrand: d.tires ? String(d.tireBrand).trim() : "", straighten, items, comment: d.comment || "", history: [], who: who || "" };
    PN.log(p, who, "Принято в покраску: " + disks + " диск(а) " + (p.radius || "") + ", цвет «" + p.color + "», " + (p.caps ? "с колпачками" : "без колпачков") + ", " + (p.tires ? "с резиной (" + p.tireBrand + ")" : "без резины") + (straighten ? ", правка " + straighten.qty + " шт" : "") + (diskCondition.length ? ". Состояние дисков: " + diskCondition.join(", ") : "") + ". Оплата при выдаче.");
    S.paint.push(p);
    return { ok: true, order: p, client };
  };
  PN.addService = function (S, p, s, who) {
    if (!p || p.status === "done" || p.status === "cancel") return { ok: false, msg: "Наряд закрыт" };
    const r = svcItem(S, s); if (r.err) return { ok: false, msg: r.err };
    const same = p.items.find((i) => i.key === r.item.key && i.price === r.item.price && i.radius === r.item.radius && i.typeKey === r.item.typeKey);
    if (same) same.qty += r.item.qty; else p.items.push(r.item);
    PN.log(p, who, "Добавлено: " + r.item.name + (r.item.radius ? " " + r.item.radius : "") + " ×" + r.item.qty + " по " + SM.fmt(r.item.price));
    return { ok: true };
  };
  PN.setQty = function (S, p, itemId, qty, who) {
    const it = p.items.find((i) => i.id === itemId); if (!it) return { ok: false };
    if (it.key === "paint" || it.key === "f:Правка дисков") return { ok: false, msg: "Количество этой позиции не меняется" };
    qty = Math.round(Number(qty)); if (qty <= 0) return PN.removeItem(S, p, itemId, who);
    PN.log(p, who, "Количество «" + it.name + "»: " + it.qty + " → " + qty); it.qty = qty; return { ok: true };
  };
  PN.removeItem = function (S, p, itemId, who) {
    const it = p.items.find((i) => i.id === itemId); if (!it) return { ok: false };
    if (it.key === "paint") return { ok: false, msg: "Покраску из наряда убрать нельзя — отмените наряд" };
    p.items = p.items.filter((i) => i !== it); PN.log(p, who, "Убрано: " + it.name); return { ok: true };
  };
  PN.setReady = function (S, p, who) { if (p.status !== "paint") return { ok: false, msg: "Наряд не в покраске" }; p.status = "ready"; p.readyAt = SM.now(); PN.log(p, who, "Покрашено — готово к выдаче"); return { ok: true }; };
  PN.cancel = function (S, p, who) { if (p.status === "done") return { ok: false, msg: "Наряд уже оплачен" }; p.status = "cancel"; PN.log(p, who, "Наряд отменён"); return { ok: true }; };
  /** Выдача: один чек на всё. Нужна открытая смена. */
  PN.pay = function (S, p, payment, who) {
    if (["cash", "card", "qr"].indexOf(payment) < 0) return { ok: false, msg: "Способ оплаты?" };
    if (!p || p.status === "done" || p.status === "cancel") return { ok: false, msg: "Наряд уже закрыт" };
    const sh = SM.shift.current(S); if (!sh) return { ok: false, msg: "Сначала откройте смену (вкладка «Смена»)" };
    const t = PN.totals(S, p); if (!(t.total > 0)) return { ok: false, msg: "В наряде нет сумм" };
    const r = { id: SM.uid("r"), no: ++S.receiptSeq, ts: SM.now(), shiftId: sh.id, orderId: null, paintId: p.id, kind: "service", payment, total: t.total, totals: t, items: p.items.map((i) => Object.assign({}, i)), runflat: false, loyalty: false, clientId: p.clientId, carId: p.carId || null, plate: p.plate, masters: SM.shift.atWork(S, sh).slice(), who: who || "" };
    S.receipts.push(r);
    if (payment === "cash") SM.shift.drawerMove(S, t.total, "sale", "Чек №" + r.no + " (покраска)", r.ts);
    const wo = SM.warehouse.autoWriteOff(S, r); r.materialCost = wo.cost;
    p.status = "done"; p.paidAt = r.ts; p.receiptId = r.id; p.payment = payment; p.total = t.total;
    PN.log(p, who, "Выдано, оплачено: " + ({ cash: "наличные", card: "карта", qr: "QR / СБП" })[payment] + " " + SM.fmt(t.total) + " · чек №" + r.no + " (демо)");
    return { ok: true, receipt: r, writeoff: wo };
  };
})(typeof window !== "undefined" ? window : globalThis);
