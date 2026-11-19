/* Склад расходников: приход, нормы расхода, автосписание, ручное списание, инвентаризация, история. */
(function (root) {
  const SM = root.SM;
  const W = (SM.warehouse = {});
  W.item = (S, id) => S.warehouse.items.find((i) => i.id === id) || null;
  W.low = (S) => S.warehouse.items.filter((i) => i.qty < i.min);
  W.MOVE_RU = { in: "Приход", auto: "Автосписание", write: "Списание", inv: "Инвентаризация", box: "Взята коробка" };
  /** Позиции «коробками» (грузики): без норм и автосписания, только целые коробки — приход, «взять коробку» в работу, инвентаризация. */
  W.isBox = (it) => !!(it && it.box);
  const whole = (q) => Math.abs(q - Math.round(q)) < 1e-9;
  function move(S, it, qty, type, ref, note, ts) {
    it.qty = SM.round2(it.qty + qty);
    const m = { id: SM.uid("mv"), ts: ts || SM.now(), itemId: it.id, qty: SM.round2(qty), cost: it.cost, type, ref: ref || "", note: note || "", after: it.qty };
    S.warehouse.moves.push(m); return m;
  }
  /** Нормы на позицию чека: по ключу услуги (r:Балансировка, f:Ремонт грибком, gift ...). */
  W.normsFor = (S, key) => S.warehouse.norms.filter((n) => n.key === key);
  /** Автосписание при пробитии чека с учётом количества. */
  W.autoWriteOff = function (S, receipt) {
    const lines = []; let cost = 0;
    (receipt.items || []).forEach((ri) => {
      W.normsFor(S, ri.key).forEach((n) => {
        const it = W.item(S, n.itemId); if (!it || W.isBox(it)) return;
        const q = SM.round2(n.perUnit * ri.qty);
        if (!q) return;
        move(S, it, -q, "auto", "Чек №" + receipt.no, ri.name + " ×" + ri.qty, receipt.ts);
        const c = q * it.cost; cost += c;
        lines.push({ itemId: it.id, name: it.name, qty: q, unit: it.unit, cost: c });
      });
    });
    return { lines, cost: SM.round2(cost) };
  };
  /** Приход по накладной. Цена закупки — средневзвешенная. */
  W.receive = function (S, doc) {
    const lines = (doc.lines || []).filter((l) => l.itemId && Number(l.qty) > 0);
    if (!lines.length) return { ok: false, msg: "Добавьте хотя бы одну позицию с количеством" };
    const bad = lines.find((l) => W.isBox(W.item(S, l.itemId)) && !whole(Number(l.qty)));
    if (bad) return { ok: false, msg: W.item(S, bad.itemId).name + ": приход только целыми коробками" };
    const d = { id: SM.uid("doc"), ts: doc.ts || SM.now(), supplier: doc.supplier || "", date: doc.date || SM.dayKey(SM.now()), number: doc.number || "", lines: [], total: 0 };
    lines.forEach((l) => {
      const it = W.item(S, l.itemId); const q = Number(l.qty), price = Number(l.price || it.cost);
      const oldQ = Math.max(0, it.qty);
      it.cost = oldQ + q > 0 ? SM.round2((oldQ * it.cost + q * price) / (oldQ + q) * 10000) / 10000 : price;
      move(S, it, q, "in", "Накладная " + (d.number || "") + " " + d.supplier, "", d.ts);
      d.lines.push({ itemId: it.id, qty: q, price }); d.total += q * price;
    });
    d.total = SM.round2(d.total);
    S.warehouse.docs.push(d);
    return { ok: true, doc: d };
  };
  W.writeOff = function (S, itemId, qty, reason) {
    const it = W.item(S, itemId); qty = Number(qty);
    if (!it || !(qty > 0)) return { ok: false, msg: "Укажите количество" };
    if (!reason) return { ok: false, msg: "Укажите причину" };
    if (W.isBox(it)) {
      if (!whole(qty)) return { ok: false, msg: "Только целые коробки" };
      if (qty > it.qty + 1e-9) return { ok: false, msg: "На складе только " + W.fmtQty(it.qty, it.unit) };
    }
    return { ok: true, move: move(S, it, -qty, W.isBox(it) ? "box" : "write", "", reason) };
  };
  /** Инвентаризация: facts {itemId: факт}. preview — без применения. */
  W.inventory = function (S, facts, apply) {
    const diffs = [];
    Object.keys(facts).forEach((id) => {
      const it = W.item(S, id); const f = facts[id];
      if (!it || f === "" || f == null || isNaN(Number(f))) return;
      if (W.isBox(it) && !whole(Number(f))) return;
      const d = SM.round2(Number(f) - it.qty); if (!d) return;
      diffs.push({ itemId: id, name: it.name, unit: it.unit, was: it.qty, fact: Number(f), diff: d, cost: d * it.cost });
    });
    if (apply) diffs.forEach((d) => move(S, W.item(S, d.itemId), d.diff, "inv", "Инвентаризация", d.diff > 0 ? "излишек" : "недостача"));
    return diffs;
  };
  W.setNorm = function (S, key, itemId, perUnit) {
    const n = S.warehouse.norms.find((x) => x.key === key && x.itemId === itemId);
    perUnit = Number(perUnit);
    if (W.isBox(W.item(S, itemId))) return { ok: false, msg: "Грузики учитываются только коробками — нормы на услугу для них не задаются" };
    if (!(perUnit > 0)) { S.warehouse.norms = S.warehouse.norms.filter((x) => x !== n); return; }
    if (n) n.perUnit = perUnit; else S.warehouse.norms.push({ id: SM.uid("nm"), key, itemId, perUnit });
    return { ok: true };
  };
  /** Себестоимость списанных расходников за период (авто + ручное + недостача по инвентаризации). */
  W.costInRange = function (S, from, to) {
    let s = 0; S.warehouse.moves.forEach((m) => { if (m.ts >= from && m.ts < to && m.qty < 0 && m.type !== "in") s += -m.qty * m.cost; });
    return SM.round2(s);
  };
  W.fmtQty = (q, unit) => { const v = Math.round(q * 100) / 100; const [i, f] = String(Math.abs(v)).split("."); return (v < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + (f ? "," + f : "") + " " + unit; };
})(typeof window !== "undefined" ? window : globalThis);
