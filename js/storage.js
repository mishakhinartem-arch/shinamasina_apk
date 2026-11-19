/* Хранение шин: приём, оплата, выдача, сроки. */
(function (root) {
  const SM = root.SM;
  const St = (SM.storage = {});
  St.REQUISITES = { name: "ИП Мишахин Артем Алексеевич", inn: "773580864120", ogrnip: "325774600692668", address: "Московская обл., Андреевка, Алабушевская ул., 2 стр. 2", phone: "+7 (995) 506-95-62" };
  St.status = function (S, rec, now) {
    if (rec.status === "issued") return "issued";
    now = now || SM.now();
    const left = Math.ceil((rec.until - SM.dayStart(now)) / 864e5);
    if (left < 0) return "overdue";
    if (left <= (S.settings.storageWarnDays || 14)) return "soon";
    return "ok";
  };
  St.radiusOf = (size) => { const m = String(size || "").match(/R\s?(\d{2})/i); return m ? "R" + m[1] : ""; };
  /** Цена хранения по тарифу владельца: ₽ за комплект (4 шины) за сезон по радиусу (+ доплата за диски);
      другой срок — пропорционально месяцам, другое число шин — пропорционально; округление до 50 ₽. */
  St.calcPrice = function (S, d) {
    const st = S.settings, radius = d.radius || St.radiusOf(d.size);
    const tar = (st.storageTariff || {})[radius];
    if (!(tar > 0)) return { ok: false, msg: "Нет тарифа хранения для " + (radius || "этого размера") + " — владелец задаёт его в админке" };
    const season = st.storageSeasonMonths || 6, months = Number(d.months) || season, qty = Number(d.qty) || 4;
    const perSet = tar + (d.rims ? st.storageRimsExtra || 0 : 0);
    const price = SM.round50((perSet * months / season) * qty / 4);
    const text = radius + ": " + SM.fmt(tar) + (d.rims ? " + диски " + SM.fmt(st.storageRimsExtra || 0) : "") + " за комплект 4 шт. / " + season + " мес." + (months !== season ? " × " + months + "/" + season : "") + (qty !== 4 ? " × " + qty + "/4 шт." : "");
    return { ok: true, price, radius, months, qty, perSet, text };
  };
  St.addMonths = (ts, m) => { const x = new Date(ts); x.setMonth(x.getMonth() + Number(m)); return SM.dayStart(x.getTime()); };
  St.STATUS_RU = { ok: "На хранении", soon: "Срок истекает", overdue: "Просрочено", issued: "Выдано" };
  St.daysLeft = (rec, now) => Math.ceil((rec.until - SM.dayStart(now || SM.now())) / 864e5);
  St.activeForClient = (S, cid, plate) => S.storage.filter((r) => r.status !== "issued" && ((cid && r.clientId === cid) || (plate && SM.normPlate(r.plate) === SM.normPlate(plate))));
  St.create = function (S, d, who) {
    const qty = Number(d.qty);
    if (!(qty > 0)) return { ok: false, msg: "Укажите количество шин" };
    if (!d.size) return { ok: false, msg: "Укажите размер" };
    if (!d.plate && !SM.phoneVal(d.phone) && !d.clientId) return { ok: false, msg: "Нужен госномер или телефон клиента" };
    const from = d.from || SM.now();
    const months = Number(d.months) || 0;
    const until = d.until || (months ? St.addMonths(from, months) : 0);
    if (!until) return { ok: false, msg: "Укажите срок хранения" };
    // Цена — по тарифу. Ручная цена только с priceOverride (подтверждено PIN владельца в интерфейсе).
    const calc = St.calcPrice(S, { radius: d.radius, size: d.size, months: months || S.settings.storageSeasonMonths || 6, qty, rims: !!d.rims });
    let price, priceManual = false;
    if (d.priceOverride && Number(d.price) > 0) { price = Math.round(Number(d.price)); priceManual = !calc.ok || price !== calc.price; }
    else { if (!calc.ok) return calc; price = calc.price; }
    let client = d.clientId ? SM.client(S, d.clientId) : (d.plate && SM.clientByPlate(S, d.plate)) || (d.phone && SM.clientByPhone(S, d.phone));
    if (!client && (SM.phoneVal(d.phone) || d.name)) { const r = SM.addClient(S, { name: d.name, phone: SM.phoneVal(d.phone), plate: d.plate, car: d.car || "", wheel_size: d.radius || "" }); if (r.ok) client = r.client; }
    const rec = { id: SM.uid("st"), no: "Х-" + String(++S.storageSeq).padStart(4, "0"), ts: d.ts || SM.now(), clientId: client ? client.id : null, name: d.name || (client && client.name) || "", phone: SM.normPhone(SM.phoneVal(d.phone) || (client && client.phone) || ""), plate: SM.normPlate(d.plate || (client && client.plate) || ""), car: d.car || "", qty, size: d.size, radius: calc.radius || d.radius || "", months: months || null, tariffText: calc.ok ? calc.text : "", priceManual, brand: d.brand || "", rims: !!d.rims, season: d.season || "", condition: d.condition || "", comment: String(d.comment || "").trim(), photoId: d.photoId || null, place: d.place || "", from, until, price, paid: false, payment: null, status: "stored", who: who || "" };
    S.storage.push(rec);
    if (d.payNow && price > 0) { const p = St.pay(S, rec, d.payNow); if (!p.ok) return Object.assign(p, { rec }); }
    return { ok: true, rec };
  };
  /** Оплата хранения — отдельный чек «хранение» (идёт в доход от хранения). */
  St.pay = function (S, rec, payment) {
    if (rec.paid) return { ok: false, msg: "Уже оплачено" };
    const o = SM.orders.storageInOrder(S, rec.id); if (o) return { ok: false, msg: "Хранение " + rec.no + " уже в чеке заказа " + SM.orders.title(o) + " — оплатите заказ" };
    if (!(rec.price > 0)) return { ok: false, msg: "Не указана стоимость хранения" };
    const sh = SM.shift.current(S); if (!sh) return { ok: false, msg: "Оплату можно принять при открытой смене" };
    const r = { id: SM.uid("r"), no: ++S.receiptSeq, ts: SM.now(), shiftId: sh.id, kind: "storage", payment, total: rec.price, items: [{ key: "storage", name: "Хранение шин " + rec.no, price: rec.price, qty: 1 }], clientId: rec.clientId, plate: rec.plate, storageId: rec.id };
    S.receipts.push(r);
    if (payment === "cash") SM.shift.drawerMove(S, rec.price, "storage", "Хранение " + rec.no, r.ts);
    rec.paid = true; rec.payment = payment; rec.paidAt = r.ts; rec.receiptId = r.id;
    return { ok: true, receipt: r };
  };
  St.issue = function (S, rec, who) {
    if (rec.status === "issued") return { ok: false, msg: "Уже выдано" };
    rec.status = "issued"; rec.issuedAt = SM.now(); rec.issuedBy = who || ""; return { ok: true };
  };
  St.search = function (S, q) {
    q = String(q || "").trim(); if (!q) return S.storage.slice();
    const pl = SM.normPlate(q), ph = q.replace(/\D/g, "");
    return S.storage.filter((r) => (r.no || "").toUpperCase().indexOf(q.toUpperCase()) >= 0 || (pl && r.plate.indexOf(pl) >= 0) || (ph.length >= 3 && r.phone.indexOf(ph) >= 0) || (r.name || "").toLowerCase().indexOf(q.toLowerCase()) >= 0);
  };
})(typeof window !== "undefined" ? window : globalThis);
