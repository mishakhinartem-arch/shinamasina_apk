/* Товары (продажа в чек): цена продажи, закупка, остаток. Владелец добавляет/правит/скрывает по PIN.
   В чеке товары без скидок и не входят в базу процента мастеров; при оплате списываются со склада товаров. */
(function (root) {
  const SM = root.SM;
  const G = (SM.products = {});
  G.get = (S, id) => S.products.find((p) => p.id === id) || null;
  G.list = (S, all) => S.products.filter((p) => all || !p.hidden);
  G.low = (S) => S.products.filter((p) => !p.hidden && p.min > 0 && p.qty < p.min);
  function check(S, d, selfId) {
    const name = String(d.name || "").trim();
    if (!name) return "Укажите название";
    if (S.products.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== selfId)) return "Товар «" + name + "» уже есть";
    if (!(Math.round(Number(d.price)) > 0)) return "Цена продажи должна быть больше 0 ₽";
    if (d.cost !== "" && d.cost != null && !(Number(d.cost) >= 0)) return "Закупка — не меньше 0 ₽";
    if (!(Number.isInteger(Number(d.qty)) && Number(d.qty) >= 0)) return "Остаток — целое число, не меньше 0";
    if (d.min !== "" && d.min != null && !(Number(d.min) >= 0)) return "Минимум — не меньше 0";
    return null;
  }
  function move(S, p, qty, type, ref) { S.productMoves.push({ id: SM.uid("pm"), ts: SM.now(), productId: p.id, qty, cost: p.cost, type, ref: ref || "", after: p.qty }); }
  G.add = function (S, d) {
    const err = check(S, d); if (err) return { ok: false, msg: err };
    const p = { id: SM.uid("p"), name: String(d.name).trim(), price: Math.round(Number(d.price)), cost: Math.round((Number(d.cost) || 0) * 100) / 100, qty: Number(d.qty), min: Number(d.min) || 0, unit: d.unit || "шт", hidden: false, createdAt: SM.now() };
    S.products.push(p); if (p.qty) move(S, p, p.qty, "in", "Начальный остаток");
    return { ok: true, product: p };
  };
  G.update = function (S, id, d) {
    const p = G.get(S, id); if (!p) return { ok: false, msg: "Товар не найден" };
    const nd = Object.assign({}, p, d); const err = check(S, nd, id); if (err) return { ok: false, msg: err };
    const dq = Number(nd.qty) - p.qty;
    Object.assign(p, { name: String(nd.name).trim(), price: Math.round(Number(nd.price)), cost: Math.round((Number(nd.cost) || 0) * 100) / 100, qty: Number(nd.qty), min: Number(nd.min) || 0 });
    if (dq) move(S, p, dq, "edit", "Остаток изменён владельцем");
    return { ok: true, product: p };
  };
  G.setHidden = function (S, id, hidden) { const p = G.get(S, id); if (!p) return { ok: false, msg: "Товар не найден" }; p.hidden = !!hidden; return { ok: true }; };
  /** Сколько штук товара уже лежит в открытых заказах (кроме указанного). */
  G.reserved = (S, id, exceptOrderId) => SM.orders.open(S).filter((o) => o.id !== exceptOrderId).reduce((s, o) => s + o.items.filter((i) => i.productId === id).reduce((a, i) => a + i.qty, 0), 0);
  G.inOrder = (o, id) => o.items.filter((i) => i.productId === id).reduce((a, i) => a + i.qty, 0);
  G.addToOrder = function (S, o, id, qty, who) {
    const p = G.get(S, id); qty = Number(qty) || 1;
    if (!p || p.hidden) return { ok: false, msg: "Товар не найден или скрыт" };
    const want = G.inOrder(o, id) + qty;
    if (want > p.qty) return { ok: false, msg: p.name + ": на складе " + p.qty + " " + p.unit + (G.inOrder(o, id) ? ", в заказе уже " + G.inOrder(o, id) : "") };
    const same = o.items.find((i) => i.productId === id);
    if (same) same.qty += qty;
    else o.items.push({ id: SM.uid("i"), key: "p:" + id, name: p.name, price: p.price, qty, radius: "", typeKey: "", surchargeEligible: false, manual: false, gift: false, noDiscount: true, goods: true, productId: id });
    SM.orders.log(o, who, "Товар: " + p.name + " ×" + qty + " по " + SM.fmt(p.price));
    return { ok: true };
  };
  /** Проверка остатков перед оплатой. */
  G.checkStock = function (S, items) {
    const need = {}; (items || []).forEach((i) => { if (i.productId) need[i.productId] = (need[i.productId] || 0) + i.qty; });
    for (const id of Object.keys(need)) { const p = G.get(S, id); if (!p) return { ok: false, msg: "Товар из заказа удалён — уберите позицию" }; if (need[id] > p.qty) return { ok: false, msg: p.name + ": на складе только " + p.qty + " " + p.unit + ", в чеке " + need[id] }; }
    return { ok: true };
  };
  /** Списание проданных товаров по чеку. Возвращает закупочную стоимость. */
  G.writeOff = function (S, receipt) {
    let cost = 0;
    (receipt.items || []).forEach((i) => { if (!i.productId) return; const p = G.get(S, i.productId); if (!p) return; p.qty -= i.qty; cost += i.qty * (p.cost || 0); move(S, p, -i.qty, "sale", "Чек №" + receipt.no); });
    return Math.round(cost * 100) / 100;
  };
})(typeof window !== "undefined" ? window : globalThis);
