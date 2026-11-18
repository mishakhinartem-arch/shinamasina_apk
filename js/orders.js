/* Заказы: открываются только по госномеру или номеру очереди. Статусы Новый → В работе → Готов → Выдан. */
(function (root) {
  const SM = root.SM;
  const O = (SM.orders = {});
  O.STATUS = [ { key: "new", label: "Новый" }, { key: "work", label: "В работе" }, { key: "ready", label: "Готов" }, { key: "done", label: "Выдан (оплачен)" } ];
  O.statusLabel = (k) => (O.STATUS.find((s) => s.key === k) || { label: k === "cancel" ? "Отменён" : k }).label;
  O.open = (S) => S.orders.filter((o) => o.status !== "done" && o.status !== "cancel");
  O.get = (S, id) => S.orders.find((o) => o.id === id) || null;
  O.log = function (o, who, text) { o.history.push({ ts: SM.now(), who: who || "Касса", text }); };
  O.title = (o) => (o.plate ? o.plate : "Очередь №" + o.queueNo);
  /** Создать заказ по госномеру или номеру очереди. Имя/телефон не нужны. */
  O.create = function (S, data, who) {
    const plate = SM.normPlate(data.plate || "");
    const queueNo = data.queueNo || null;
    if (!plate && !queueNo) return { ok: false, msg: "Нужен госномер или номер очереди" };
    if (plate) { const ex = O.open(S).find((o) => o.plate === plate); if (ex) return { ok: true, order: ex, existed: true }; }
    const client = plate ? SM.clientByPlate(S, plate) : null;
    const o = { id: SM.uid("o"), no: ++S.orderSeq, plate, queueNo, clientId: client ? client.id : null, status: "new", items: [], runflat: false, loyalty: false, discount: null, masters: [], history: [], createdAt: SM.now(), shiftId: (SM.shift.current(S) || {}).id || null, bookingId: data.bookingId || null, note: data.note || "" };
    if (client && SM.clientVisits(S, client.id).length >= 1) o.loyalty = true;
    O.log(o, who, "Заказ открыт по " + (plate ? "госномеру " + plate : "номеру очереди " + queueNo) + (client ? " · клиент найден: " + (client.name || SM.phoneShow(client.phone)) : ""));
    if (o.loyalty) O.log(o, who, "Скидка постоянному клиенту " + S.settings.loyaltyPct + "% (автоматически)");
    const sh = SM.shift.current(S); if (sh) o.masters = SM.shift.atWork(S, sh).slice();
    S.orders.push(o);
    return { ok: true, order: o, client };
  };
  O.attachClient = function (S, o, client, who) {
    o.clientId = client ? client.id : null;
    if (client && !o.plate && client.plate) o.plate = client.plate;
    if (client) { O.log(o, who, "Привязан клиент: " + (client.name || SM.phoneShow(client.phone))); if (SM.clientVisits(S, client.id).length >= 1 && !o.loyalty) { o.loyalty = true; O.log(o, who, "Скидка постоянному клиенту " + S.settings.loyaltyPct + "% (автоматически)"); } }
  };
  O.addItem = function (S, o, tile, qty, ctx, who, manualPrice) {
    qty = qty || 1;
    const price = tile.manual ? Number(manualPrice) : tile.price;
    if (tile.manual && !(price > 0)) return { ok: false, msg: "Цена должна быть больше 0 ₽" };
    if (price == null) return { ok: false, msg: "Нет цены для этого радиуса" };
    const same = o.items.find((i) => i.key === tile.key && i.price === price && (i.radius || "") === (tile.radial ? ctx.radius : "") && (i.typeKey || "") === (tile.radial ? ctx.typeKey : ""));
    if (same) same.qty += qty;
    else o.items.push({ id: SM.uid("i"), key: tile.key, name: tile.name, price, qty, radius: tile.radial ? ctx.radius : "", typeKey: tile.radial ? ctx.typeKey : "", surchargeEligible: !!tile.surchargeEligible, manual: !!tile.manual, gift: !!tile.gift });
    O.log(o, who, "Добавлено: " + tile.name + (tile.radial ? " " + ctx.radius + " " + SM.prices.typeLabel(ctx.typeKey) : "") + " ×" + qty + " по " + SM.fmt(price));
    return { ok: true };
  };
  /** Хранение в чек заказа: цена по тарифу (фиксированная), без скидок, не в базе процента мастеров. */
  O.addStorage = function (S, o, rec, who) {
    if (!rec) return { ok: false, msg: "Комплект не найден" };
    if (rec.paid) return { ok: false, msg: "Хранение " + rec.no + " уже оплачено" };
    if (!(rec.price > 0)) return { ok: false, msg: "Не указана стоимость хранения" };
    const inOrder = O.open(S).find((x) => x.items.some((i) => i.storageId === rec.id));
    if (inOrder) return { ok: false, msg: "Хранение " + rec.no + " уже в заказе " + O.title(inOrder) };
    o.items.push({ id: SM.uid("i"), key: "storage", name: "Хранение шин " + rec.no + (rec.months ? " (" + rec.months + " мес.)" : ""), price: rec.price, qty: 1, radius: "", typeKey: "", surchargeEligible: false, manual: false, gift: false, noDiscount: true, storageId: rec.id });
    O.log(o, who, "Добавлено хранение " + rec.no + " — " + SM.fmt(rec.price) + " (по тарифу, без скидки)");
    return { ok: true };
  };
  O.storageInOrder = (S, recId) => O.open(S).find((x) => x.items.some((i) => i.storageId === recId)) || null;
  O.setQty = function (S, o, itemId, qty, who) {
    const it = o.items.find((i) => i.id === itemId); if (!it) return;
    if (it.storageId && qty > 1) return; // хранение — одна позиция на комплект
    if (qty <= 0) { o.items = o.items.filter((i) => i.id !== itemId); O.log(o, who, "Убрано: " + it.name + " ×" + it.qty); return; }
    O.log(o, who, "Количество «" + it.name + "»: " + it.qty + " → " + qty); it.qty = qty;
  };
  O.setPrice = function (S, o, itemId, price, who) {
    const it = o.items.find((i) => i.id === itemId); if (!it) return { ok: false };
    if (it.storageId) return { ok: false, msg: "Цена хранения фиксированная — меняется в админке (тариф)" };
    price = Math.round(Number(price)); if (!(price > 0)) return { ok: false, msg: "Цена должна быть больше 0 ₽" };
    O.log(o, who, "Цена «" + it.name + "»: " + SM.fmt(it.price) + " → " + SM.fmt(price)); it.price = price; return { ok: true };
  };
  O.setFlag = function (S, o, flag, val, who) {
    const prev = o[flag]; o[flag] = !!val;
    O.log(o, who, (flag === "runflat" ? "Надбавка +" + S.settings.surchargePct + "% RunFlat/низкий профиль" : "Скидка постоянному " + S.settings.loyaltyPct + "%") + (val ? " включена" : " выключена"));
    return { ok: true };
  };
  /** Ручная скидка с проверкой лимита. */
  O.setDiscount = function (S, o, disc, who) {
    const prev = o.discount; o.discount = disc && disc.value > 0 ? { type: disc.type, value: Number(disc.value) } : null;
    const c = SM.cart.checkDiscount(o, S.settings);
    if (!c.ok) { o.discount = prev; return { ok: false, msg: c.msg }; }
    O.log(o, who, o.discount ? "Скидка: " + (o.discount.type === "pct" ? o.discount.value + "%" : SM.fmt(o.discount.value)) + " (итого скидка " + SM.fmt(c.totals.discount) + ")" : "Ручная скидка убрана");
    return { ok: true };
  };
  O.setStatus = function (S, o, status, who) {
    if (status === "done") return { ok: false, msg: "«Выдан» ставится оплатой" };
    if (o.status === status) return { ok: true };
    O.log(o, who, "Статус: " + O.statusLabel(o.status) + " → " + O.statusLabel(status)); o.status = status;
    if (status === "work" && !o.startedAt) o.startedAt = SM.now();
    if (status === "ready") o.readyAt = SM.now();
    return { ok: true };
  };
  O.setMasters = function (S, o, ids, who) { o.masters = ids.slice(); O.log(o, who, "Исполнители: " + (ids.map((id) => SM.empName(S, id)).join(", ") || "—")); };
  O.cancel = function (S, o, who) { O.log(o, who, "Заказ отменён"); o.status = "cancel"; };
  /** Оплата: чек (демо), статус «Выдан», автосписание склада, ящик. */
  O.pay = function (S, o, payment, who) {
    if (["cash", "card", "qr"].indexOf(payment) < 0) return { ok: false, msg: "Способ оплаты?" };
    const sh = SM.shift.current(S); if (!sh) return { ok: false, msg: "Сначала откройте смену (вкладка «Смена»)" };
    if (!o.items.some((i) => !i.gift && i.price > 0)) return { ok: false, msg: "Добавьте услугу с ценой. Пакеты в подарок сами по себе не пробиваются." };
    const chk = SM.cart.checkDiscount(o, S.settings); if (!chk.ok) return { ok: false, msg: chk.msg };
    const t = chk.totals;
    const stRecs = o.items.filter((i) => i.storageId).map((i) => S.storage.find((x) => x.id === i.storageId));
    if (stRecs.some((x) => !x || x.paid)) return { ok: false, msg: "Хранение в заказе уже оплачено или не найдено — уберите эту позицию" };
    const r = { id: SM.uid("r"), no: ++S.receiptSeq, ts: SM.now(), shiftId: sh.id, orderId: o.id, kind: "service", payment, total: t.total, totals: t, items: o.items.map((i) => Object.assign({}, i)), runflat: o.runflat, loyalty: o.loyalty, clientId: o.clientId, plate: o.plate, masters: o.masters.slice(), who: who || "" };
    S.receipts.push(r);
    if (payment === "cash") SM.shift.drawerMove(S, t.total, "sale", "Чек №" + r.no, r.ts);
    stRecs.forEach((x) => { x.paid = true; x.payment = payment; x.paidAt = r.ts; x.receiptId = r.id; });
    o.status = "done"; o.paidAt = r.ts; o.receiptId = r.id; o.payment = payment; o.total = t.total;
    O.log(o, who, "Оплачено: " + ({ cash: "наличные", card: "карта", qr: "QR / СБП" })[payment] + " " + SM.fmt(t.total) + " · чек №" + r.no + " (демо, Эвотор не подключён)");
    const wo = SM.warehouse.autoWriteOff(S, r);
    r.materialCost = wo.cost;
    if (o.queueNo) { const q = S.queue.items.find((x) => x.no === o.queueNo && x.status !== "done"); if (q) q.status = "done"; }
    if (o.bookingId) { const b = S.bookings.find((x) => x.id === o.bookingId); if (b) b.status = "done"; }
    return { ok: true, receipt: r, writeoff: wo };
  };
  /** «Как в прошлый раз»: позиции последнего чека клиента по текущему прайсу. */
  O.repeatLast = function (S, o, who) {
    if (!o.clientId) return { ok: false, msg: "Клиент не найден" };
    const last = SM.clientVisits(S, o.clientId)[0]; if (!last) return { ok: false, msg: "У клиента ещё не было визитов" };
    let n = 0;
    last.items.forEach((i) => {
      if (i.storageId || i.key === "storage") return;
      const tile = SM.prices.find(S.prices, i.key, i.typeKey || "passenger", i.radius || "R16");
      if (!tile) return;
      const res = O.addItem(S, o, tile, i.qty, { radius: i.radius, typeKey: i.typeKey }, who, i.manual ? i.price : undefined);
      if (res.ok) n++;
    });
    if (last.runflat && !o.runflat) o.runflat = true;
    O.log(o, who, "«Как в прошлый раз» — повтор чека №" + last.no + " от " + SM.fmtDate(last.ts));
    return { ok: true, n, last };
  };
})(typeof window !== "undefined" ? window : globalThis);
