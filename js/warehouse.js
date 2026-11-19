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
    // Поставщик из справочника (или новый — заводится сразу). Способ оплаты — только отметка: из кассы/ящика ничего не вычитаем (решение Артёма 19.11 16:05).
    let sup = null;
    if (doc.supplierId) sup = W.supplier(S, doc.supplierId);
    else if (doc.supplierData && String(doc.supplierData.name || "").trim()) { const r = W.saveSupplier(S, doc.supplierData); if (!r.ok) return r; sup = r.supplier; }
    const pay = doc.pay || (sup ? sup.pay : "") || "";
    if (pay && !W.PAY_RU[pay]) return { ok: false, msg: "Способ оплаты: наличные или безнал" };
    const d = { id: SM.uid("doc"), ts: doc.ts || SM.now(), supplier: sup ? sup.name : doc.supplier || "", supplierId: sup ? sup.id : null, pay, date: doc.date || SM.dayKey(SM.now()), number: doc.number || "", lines: [], total: 0 };
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
  /** Позиции, у которых не задана цена закупки (0 = «не задана», не выдумываем) — подсказка в админке. */
  W.costUnset = (S) => S.warehouse.items.filter((i) => !(Number(i.cost) > 0));

  /* ---------- Справочник поставщиков (правка 19.11): название, ИНН, телефон, способ оплаты нал/безнал ---------- */
  W.PAY_RU = { cash: "Наличные", cashless: "Безнал" };
  /** Список поставщиков; у старых данных справочник собирается из названий в прошлых накладных (без ИНН и телефона). */
  W.suppliers = function (S) {
    const wh = S.warehouse;
    if (!Array.isArray(wh.suppliers)) {
      wh.suppliers = [];
      (wh.docs || []).forEach((d) => { const n = String(d.supplier || "").trim(); if (n && !wh.suppliers.some((x) => W.normName(x.name) === W.normName(n))) wh.suppliers.push({ id: SM.uid("sp"), name: n, inn: "", phone: "", pay: "", createdAt: d.ts || SM.now() }); });
    }
    return wh.suppliers;
  };
  W.supplier = (S, id) => W.suppliers(S).find((x) => x.id === id) || null;
  /** Поиск по первым буквам: название (любое слово, без кавычек и ООО/ИП), ИНН или телефон с начала. */
  W.findSuppliers = function (S, q) {
    const t = String(q || "").trim().toLowerCase().replace(/ё/g, "е"); if (!t) return W.suppliers(S).slice();
    const onlyNum = /^[\d\s()+-]+$/.test(t), digits = t.replace(/\D/g, "");
    return W.suppliers(S).filter((s) => {
      if (onlyNum) return digits.length >= 2 && ((s.inn || "").startsWith(digits) || String(s.phone || "").replace(/^7/, "").startsWith(digits.replace(/^[78]/, "")) || s.name.replace(/\D/g, "").startsWith(digits));
      const name = s.name.toLowerCase().replace(/ё/g, "е");
      const words = name.replace(/[«»"'()]/g, " ").split(/\s+/).filter(Boolean);
      return name.startsWith(t) || words.some((w) => w.startsWith(t));
    }).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  };
  /** Добавить / изменить поставщика. ИНН — 10 цифр (организация) или 12 (ИП), можно пусто. Повтор по ИНН или названию — тот же поставщик. */
  W.saveSupplier = function (S, d) {
    const list = W.suppliers(S);
    const name = String(d.name || "").trim(); if (!name) return { ok: false, msg: "Укажите название поставщика" };
    const inn = String(d.inn || "").replace(/\D/g, "");
    if (inn && inn.length !== 10 && inn.length !== 12) return { ok: false, msg: "ИНН — 10 цифр (организация) или 12 цифр (ИП)" };
    const phone = SM.phoneVal(d.phone) ? SM.normPhone(d.phone) : "";
    if (phone && phone.length !== 11) return { ok: false, msg: "Телефон поставщика — полностью, 11 цифр" };
    const pay = d.pay || "";
    if (pay && !W.PAY_RU[pay]) return { ok: false, msg: "Способ оплаты: наличные или безнал" };
    let s = d.id ? list.find((x) => x.id === d.id) : null;
    if (!s) s = (inn && list.find((x) => x.inn === inn)) || list.find((x) => W.normName(x.name) === W.normName(name)) || null;
    if (s) { s.name = name; if (inn) s.inn = inn; if (phone) s.phone = phone; if (pay) s.pay = pay; return { ok: true, supplier: s, existed: true }; }
    s = { id: SM.uid("sp"), name, inn, phone, pay, createdAt: SM.now() };
    list.push(s);
    return { ok: true, supplier: s, existed: false };
  };

  /* ---------- Склад ремонта (правка 19.11, решение Артёма 16:14): все позиции «Ремонт», кроме вулканизации, правки дисков и ремонта камеры ---------- */
  W.REPAIR_SKIP = ["Ремонт камеры", "Вулканизация бескамерной", "Правка дисков"];
  /** Услуги ремонта, которые расходуют уже заведённый материал с другим названием. */
  W.REPAIR_EXTRA_NORMS = [["f:Ремонт жгутом", "Жгут ремонтный"], ["f:Ремонт грибком", "Грибок №7"]];
  /** Нормализация названия: регистр, ё/е, пробелы, дефисы/тире (R20 = R-20 = R–20). */
  W.normName = (n) => String(n || "").toLowerCase().replace(/ё/g, "е").replace(/[\s\-‐‑‒–—―]/g, "");
  W.findItem = (S, name) => S.warehouse.items.find((i) => W.normName(i.name) === W.normName(name)) || null;
  /**
   * Добавить недостающие позиции ремонта и нормы «1 шт на услугу». Идемпотентно: существующие id, названия, закупку, остаток и минимум
   * не трогаем; норму добавляем, только если у услуги ещё нет ни одной нормы. Новые позиции: закупка 0 («не задана»), минимум 5.
   * Свои услуги (ключи c:…) не трогаем.
   */
  W.ensureRepairStock = function (S) {
    const wh = S.warehouse; const added = [], norms = [];
    const items = ((S.prices && S.prices.repair && S.prices.repair.items) || (root.PRICES && root.PRICES.repair.items) || []).map((x) => x.name);
    const want = items.filter((n) => W.REPAIR_SKIP.indexOf(n) < 0).map((n) => ["f:" + n, n.replace(/[‐‑‒–—―]/g, "-")]).concat(W.REPAIR_EXTRA_NORMS);
    want.forEach(([key, itemName]) => {
      let it = W.findItem(S, itemName);
      if (!it) { it = { id: SM.uid("w"), name: itemName, unit: "шт", cost: 0, min: 5, qty: 0, box: false }; wh.items.push(it); added.push(itemName); }
      if (!wh.norms.some((n) => n.key === key)) { wh.norms.push({ id: SM.uid("nm"), key, itemId: it.id, perUnit: 1 }); norms.push(key); }
    });
    return { added, norms };
  };
  /** Миграция состояния v4 → v5: склад ремонта + справочник поставщиков. */
  W.migrateRepairStock = function (st) {
    st.warehouse = st.warehouse || { items: [], norms: [], moves: [], docs: [] };
    ["items", "norms", "moves", "docs"].forEach((k) => { if (!Array.isArray(st.warehouse[k])) st.warehouse[k] = []; });
    const r = W.ensureRepairStock(st); W.suppliers(st);
    st.version = 5;
    return st;
  };

  /* ---------- «Расходует со склада» в окне услуги (правка 19.11, Артём «Да» 16:10) ---------- */
  /** Нормы услуги с позициями склада: [{ id, itemId, name, unit, perUnit }]. */
  W.serviceUses = (S, key) => W.normsFor(S, key).map((n) => { const it = W.item(S, n.itemId); return { id: n.id, itemId: n.itemId, name: it ? it.name : "?", unit: it ? it.unit : "", perUnit: n.perUnit }; });
  /**
   * Заменить нормы услуги списком [{ itemId | newItem: { name, unit }, perUnit }]. Новые позиции заводятся сразу (закупка 0 — «не задана»).
   * Коробочные позиции (грузики) не допускаются. Пустой список — убрать все нормы услуги.
   */
  W.setServiceUses = function (S, key, uses) {
    if (!key) return { ok: false, msg: "Нет услуги" };
    const prepared = [];
    for (const u of uses || []) {
      const q = Number(String(u.perUnit).replace(",", "."));
      if (!(q > 0)) return { ok: false, msg: "Количество на 1 услугу должно быть больше 0" };
      let it = u.itemId ? W.item(S, u.itemId) : null;
      if (!it && u.newItem) {
        const n = String(u.newItem.name || "").trim(); if (!n) return { ok: false, msg: "Название новой позиции склада?" };
        it = W.findItem(S, n);
        if (!it) { it = { id: SM.uid("w"), name: n, unit: u.newItem.unit || "шт", cost: 0, min: Number(u.newItem.min) || 0, qty: 0, box: false }; S.warehouse.items.push(it); }
      }
      if (!it) return { ok: false, msg: "Выберите позицию склада" };
      if (W.isBox(it)) return { ok: false, msg: "Грузики учитываются только коробками — нормы на услугу для них не задаются" };
      const ex = prepared.find((p) => p.itemId === it.id); if (ex) ex.perUnit = q; else prepared.push({ itemId: it.id, perUnit: q });
    }
    S.warehouse.norms = S.warehouse.norms.filter((n) => n.key !== key);
    prepared.forEach((p) => S.warehouse.norms.push({ id: SM.uid("nm"), key, itemId: p.itemId, perUnit: p.perUnit }));
    return { ok: true, count: prepared.length };
  };
  /** Свои услуги (c:…) без нормы списания — подсказка владельцу «нет нормы списания». */
  W.servicesWithoutNorm = (S) => ((S.prices && S.prices.custom) || []).filter((c) => !W.normsFor(S, "c:" + c.id).length);
  W.fmtQty = (q, unit) => { const v = Math.round(q * 100) / 100; const [i, f] = String(Math.abs(v)).split("."); return (v < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + (f ? "," + f : "") + " " + unit; };
})(typeof window !== "undefined" ? window : globalThis);
