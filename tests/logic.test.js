// Автотесты ключевой логики демо-кассы. Запуск: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const SM = require("./load.js");
const H = 36e5;
const T0 = new Date(2026, 10, 18, 9, 0).getTime(); // 18.11.2026 09:00
function fresh() { SM.clock.fixed = T0; const S = SM.emptyState(); S.employees = [{ id: "a", name: "А", percent: 40, active: true }, { id: "b", name: "Б", percent: 40, active: true }]; return S; }
const emps = [{ id: "a", name: "А", percent: 40 }, { id: "b", name: "Б", percent: 40 }];

test("ЗП: пример из рабочей кассы (Александр один до 13:00, потом вдвоём) + округление до 50 ₽", () => {
  const sh = { startedAt: T0, endedAt: T0 + 12 * H, att: [{ empId: "a", in: T0, out: null }, { empId: "b", in: T0 + 4 * H, out: null }] };
  const ledger = [{ ts: T0 + 2 * H, delta: 20000 }, { ts: T0 + 6 * H, delta: 80000 }];
  const r = SM.payroll.calcShift(sh, ledger, emps, SM.DEFAULT_SETTINGS, T0 + 12 * H);
  assert.equal(r[0].raw, 24000); assert.equal(r[0].pay, 24000);
  assert.equal(r[1].raw, 16000); assert.equal(r[1].pay, 16000);
  const r2 = SM.payroll.calcShift(sh, [{ ts: T0 + 6 * H, delta: 10130 }], emps, SM.DEFAULT_SETTINGS, T0 + 12 * H);
  assert.equal(r2[0].raw, 2026); // 10130 × 40% / 2
  assert.equal(r2[0].rounded, 2050); // ближайшие 50 ₽
  assert.equal(SM.round50(2024), 2000); assert.equal(SM.round50(2025), 2050);
});
test("ЗП: минимум 4 000 ₽ только при ≥ 8 ч, при любом числе мастеров", () => {
  const ledger = [{ ts: T0 + 1 * H, delta: 5000 }];
  // 8 ч ровно — минимум положен
  let sh = { startedAt: T0, endedAt: T0 + 8 * H, att: [{ empId: "a", in: T0, out: T0 + 8 * H }, { empId: "b", in: T0, out: T0 + 8 * H }] };
  let r = SM.payroll.calcShift(sh, ledger, emps, SM.DEFAULT_SETTINGS);
  assert.equal(r[0].pay, 4000); assert.equal(r[0].minApplied, true); assert.equal(r[0].rounded, 1000);
  // 7 ч 59 мин — только процент
  sh = { startedAt: T0, endedAt: T0 + 8 * H, att: [{ empId: "a", in: T0, out: T0 + 8 * H - 60e3 }] };
  r = SM.payroll.calcShift(sh, ledger, emps, SM.DEFAULT_SETTINGS);
  assert.equal(r[0].pay, 2000); assert.equal(r[0].minApplied, false); assert.equal(r[0].minEligible, false);
  assert.ok(r[0].hoursTo8 > 0 && r[0].hoursTo8 < 0.02);
  // один мастер, 10 ч, процент выше минимума — минимум не нужен
  sh = { startedAt: T0, endedAt: T0 + 10 * H, att: [{ empId: "a", in: T0, out: null }] };
  r = SM.payroll.calcShift(sh, [{ ts: T0 + H, delta: 30000 }], emps, SM.DEFAULT_SETTINGS);
  assert.equal(r[0].pay, 12000); assert.equal(r[0].minApplied, false);
});
test("ЗП: пришёл днём — считается с момента прихода, выручка до прихода не делится на него", () => {
  const S = fresh(); SM.shift.open(S, ["a"], 0);
  const sh = SM.shift.current(S);
  S.receipts.push({ ts: T0 + H, shiftId: sh.id, kind: "service", total: 10000, payment: "card" });
  SM.clock.fixed = T0 + 3 * H; SM.shift.clockIn(S, "b", 0);
  S.receipts.push({ ts: T0 + 4 * H, shiftId: sh.id, kind: "service", total: 10000, payment: "card" });
  const rows = SM.payroll.forShift(S, sh, T0 + 5 * H);
  assert.equal(rows.find((r) => r.empId === "a").raw, 6000); // 4000 + 2000
  assert.equal(rows.find((r) => r.empId === "b").raw, 2000);
});
test("Закрытие смены: ЗП из налички ящика, не хватает — выдаём сколько есть, остальное долг; день дважды не оплатить", () => {
  const S = fresh(); S.drawer.balance = 1000; SM.shift.open(S, ["a"], 1000);
  const sh = SM.shift.current(S);
  S.receipts.push({ ts: T0 + H, shiftId: sh.id, kind: "service", total: 2000, payment: "cash" }); SM.shift.drawerMove(S, 2000, "sale");
  SM.clock.fixed = T0 + 9 * H;
  const r = SM.shift.close(S);
  assert.equal(r.rows[0].pay, 4000); assert.equal(r.rows[0].paid, 3000); assert.equal(r.rows[0].debt, 1000);
  assert.equal(S.drawer.balance, 0);
  assert.equal(SM.payroll.payDay(S, { empId: "a", day: SM.dayKey(T0), amount: 100 }).ok, false);
  // вторая смена в тот же день — сумма уходит в долг
  S.drawer.balance = 50000; SM.clock.fixed = T0 + 10 * H; SM.shift.open(S, ["a"], 50000); SM.clock.fixed = T0 + 11 * H;
  const r2 = SM.shift.close(S);
  assert.equal(r2.rows[0].paid, 0); assert.ok(r2.summary.notes[0].indexOf("уже оплачен") > 0);
});
test("Надбавка +20% — на Монтаж/Демонтаж/Переобувку 4/Итого за 1 колесо целиком, не на балансировку", () => {
  const S = fresh(); const ctx = { radius: "R16", typeKey: "passenger" };
  const o = { items: [], runflat: true, history: [] };
  ["r:Переобувка 4 колеса", "r:Балансировка", "r:Монтаж", "f:Ремонт жгутом"].forEach((k) => SM.orders.addItem(S, o, SM.prices.find(S.prices, k, "passenger", "R16"), 1, ctx, "т"));
  const t = SM.cart.totals(o, S.settings);
  assert.equal(t.base, 3700 + 330 + 205 + 500);
  assert.equal(t.surchargeBase, 3700 + 205);
  assert.equal(t.surcharge, 781);
  assert.equal(t.total, 3700 + 330 + 205 + 500 + 781);
  o.loyalty = true; // 10% от суммы с надбавкой, как сейчас
  assert.equal(SM.cart.totals(o, S.settings).discount, Math.round((4735 + 781) * 0.1));
});
test("Лимит скидки: % и ₽ (₽ → % от заказа), 0 = без ограничений", () => {
  const st = Object.assign({}, SM.DEFAULT_SETTINGS, { discountMaxPct: 15, discountMaxRub: 1000 });
  const o = { items: [{ price: 4000, qty: 1 }], discount: { type: "rub", value: 600 } };
  assert.equal(SM.cart.checkDiscount(o, st).ok, true); // 600 ≤ 15% (600)
  o.discount = { type: "rub", value: 601 }; assert.equal(SM.cart.checkDiscount(o, st).ok, false);
  o.items = [{ price: 10000, qty: 1 }]; o.discount = { type: "pct", value: 12 }; // 1200 > 1000 ₽ (=10%)
  const c = SM.cart.checkDiscount(o, st); assert.equal(c.ok, false); assert.match(c.msg, /лимит/); assert.equal(c.limit.rub, 1000);
  assert.equal(SM.cart.checkDiscount(o, Object.assign({}, st, { discountMaxPct: 0, discountMaxRub: 0 })).ok, true);
  // скидка постоянному 10% в лимит не входит
  assert.equal(SM.cart.checkDiscount({ items: [{ price: 20000, qty: 1 }], loyalty: true, discount: { type: "rub", value: 1000 } }, st).ok, true);
  // через заказ: сверх лимита не сохраняется
  const S = fresh(); const ord = SM.orders.create(S, { plate: "А123ВС50" }, "т").order; ord.items.push({ price: 2000, qty: 1 });
  assert.equal(SM.orders.setDiscount(S, ord, { type: "pct", value: 50 }, "т").ok, false); assert.equal(ord.discount, null);
  assert.equal(SM.orders.setDiscount(S, ord, { type: "pct", value: 10 }, "т").ok, true);
  assert.ok(ord.history.some((h) => /Скидка/.test(h.text)));
});
test("Заказ только по госномеру/очереди, клиент подтягивается, статусы и оплата, автосписание склада с учётом кол-ва", () => {
  const S = fresh(); SM.shift.open(S, ["a"], 0);
  SM.addClient(S, { name: "Тест", phone: "79000000099", plate: "А123ВС50", wheel_size: "R16" });
  assert.equal(SM.orders.create(S, {}, "т").ok, false);
  const o = SM.orders.create(S, { plate: "a123bc50" }, "т").order;
  assert.ok(o.clientId);
  S.warehouse.items = [{ id: "w1", name: "Грузики", unit: "г", cost: 1, min: 100, qty: 1000 }, { id: "w8", name: "Пакеты", unit: "шт", cost: 6, min: 10, qty: 50 }];
  SM.warehouse.setNorm(S, "r:Балансировка", "w1", 25); SM.warehouse.setNorm(S, "gift", "w8", 1);
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "r:Балансировка", "passenger", "R16"), 4, { radius: "R16", typeKey: "passenger" }, "т");
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "gift", "passenger", "R16"), 4, {}, "т");
  SM.orders.setStatus(S, o, "work", "т"); SM.orders.setStatus(S, o, "ready", "т");
  const r = SM.orders.pay(S, o, "cash", "т");
  assert.equal(r.ok, true); assert.equal(o.status, "done"); assert.equal(r.receipt.total, 1320);
  assert.equal(SM.warehouse.item(S, "w1").qty, 900); assert.equal(SM.warehouse.item(S, "w8").qty, 46);
  assert.equal(r.writeoff.cost, 100 + 24);
  assert.equal(S.drawer.balance, 1320);
  const q = SM.queueAdd(S); assert.equal(SM.orders.create(S, { queueNo: q.no }, "т").ok, true);
});
test("Склад: приход по средней цене, ручное списание, инвентаризация, «заканчивается»", () => {
  const S = fresh(); S.warehouse.items = [{ id: "w", name: "Вентиль", unit: "шт", cost: 10, min: 20, qty: 10 }];
  assert.equal(SM.warehouse.low(S).length, 1);
  SM.warehouse.receive(S, { supplier: "X", lines: [{ itemId: "w", qty: 10, price: 20 }] });
  assert.equal(SM.warehouse.item(S, "w").qty, 20); assert.equal(SM.warehouse.item(S, "w").cost, 15);
  assert.equal(SM.warehouse.low(S).length, 0);
  assert.equal(SM.warehouse.writeOff(S, "w", 2, "Брак").ok, true);
  const d = SM.warehouse.inventory(S, { w: 15 }, true); assert.equal(d[0].diff, -3); assert.equal(SM.warehouse.item(S, "w").qty, 15);
  assert.equal(SM.warehouse.costInRange(S, 0, T0 + H), (2 + 3) * 15);
});
test("Постоянные расходы: не задним числом (число прошло → со следующего месяца), с выбором «с этого месяца»", () => {
  const S = fresh(); // сегодня 18-е
  const a = SM.expenses.addRecurring(S, { name: "Аренда", amount: 60000, day: 5 }).rec;
  assert.equal(a.startMonth, "2026-12");
  const b = SM.expenses.addRecurring(S, { name: "Свет", amount: 7000, day: 20 }).rec;
  assert.equal(b.startMonth, "2026-11");
  const c = SM.expenses.addRecurring(S, { name: "Интернет", amount: 1500, day: 10 }, true).rec;
  assert.equal(c.startMonth, "2026-11");
  const nov = SM.expenses.inRange(S, ...SM.monthRange("2026-11")); assert.deepEqual(nov.map((e) => e.amount).sort(), [1500, 7000]);
  const dec = SM.expenses.inRange(S, ...SM.monthRange("2026-12")); assert.equal(dec.reduce((s, e) => s + e.amount, 0), 68500);
});
test("Чистая прибыль = выручка − ЗП (смены + премии − штрафы) − расходы − себестоимость расходников", () => {
  const S = fresh(); SM.shift.open(S, ["a"], 0);
  S.warehouse.items = [{ id: "w1", name: "Грузики", unit: "г", cost: 2, min: 0, qty: 1000 }]; SM.warehouse.setNorm(S, "r:Балансировка", "w1", 25);
  const o = SM.orders.create(S, { plate: "В777ВВ77" }, "т").order;
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "r:Переобувка 4 колеса", "passenger", "R16"), 1, { radius: "R16", typeKey: "passenger" }, "т");
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "r:Балансировка", "passenger", "R16"), 4, { radius: "R16", typeKey: "passenger" }, "т");
  SM.orders.pay(S, o, "card", "т"); // 3700 + 1320 = 5020, расходники 100 г × 2 = 200
  const st = SM.storage.create(S, { plate: "В777ВВ77", phone: "79000000098", qty: 4, size: "205/55 R16", place: "А-1", months: 6, payNow: "cash" }); // тариф R16: 3500
  assert.equal(st.ok, true);
  SM.clock.fixed = T0 + 9 * H; SM.shift.close(S); // ЗП: 5020×40% = 2008 → 2000, 9 ч → минимум 4000
  SM.payroll.addAdjustment(S, { empId: "a", type: "bonus", amount: 1000 }); SM.payroll.addAdjustment(S, { empId: "a", type: "fine", amount: 300 }); SM.payroll.addAdjustment(S, { empId: "a", type: "advance", amount: 2000 });
  SM.expenses.addOneoff(S, { name: "Ветошь", amount: 500, ts: T0 + 2 * H });
  const r = SM.reports.month(S, "2026-11");
  assert.equal(st.rec.price, 3500);
  assert.equal(r.revenue, 8520); assert.equal(r.storage, 3500); assert.equal(r.checks, 1); assert.equal(r.avgCheck, 5020);
  assert.equal(r.payroll, 4000 + 1000 - 300); assert.equal(r.expenses, 500); assert.equal(r.material, 200);
  assert.equal(r.profit, 8520 - 4700 - 500 - 200);
  const slip = SM.payroll.payslip(S, "a", ...SM.monthRange("2026-11"));
  assert.equal(slip.accrued, 4700); assert.equal(slip.advance, 2000); assert.equal(slip.paid, slip.paidShift + 2000);
});
test("Хранение: статусы «истекает (14 дн.)» и «просрочено»; запись: слоты, согласие, пометка «привезти со склада»", () => {
  const S = fresh(); const today = SM.dayStart(T0);
  const mk = (d) => SM.storage.create(S, { plate: "Е" + (100 + d + 50) + "КХ77", phone: "7900000" + String(1000 + d + 50).slice(-4), qty: 4, size: "R16", place: "A", until: today + d * 864e5, price: 0 }).rec;
  assert.equal(SM.storage.status(S, mk(-1)), "overdue"); assert.equal(SM.storage.status(S, mk(14)), "soon"); assert.equal(SM.storage.status(S, mk(15)), "ok");
  const day = SM.dayKey(T0 + 864e5);
  assert.equal(SM.booking.create(S, { name: "И", phone: "79000000011", direction: "full", date: day, time: "10:00" }).ok, false); // без согласия
  const b = SM.booking.create(S, { name: "И", phone: "79000000011", direction: "full", date: day, time: "10:00", consent: true, plate: "Е149КХ77" });
  assert.equal(b.ok, true); assert.equal(SM.booking.needsStorage(S, b.booking), true);
  SM.booking.create(S, { name: "П", phone: "79000000012", direction: "full", date: day, time: "10:00", consent: true });
  assert.equal(SM.booking.create(S, { name: "Р", phone: "79000000013", direction: "full", date: day, time: "10:00", consent: true }).ok, false); // слот на 2 машины занят
  const acc = SM.booking.accept(S, b.booking, "т"); assert.equal(acc.ok, true); assert.equal(acc.order.plate, "Е149КХ77");
});
test("Прайс Excel: выгрузка → правка → сравнение было/стало → применение; клавиатура номера", () => {
  const P = JSON.parse(JSON.stringify(globalThis.PRICES));
  const rows = SM.excel.priceRows(P);
  const row = rows.find((r) => r["Раздел"] === "Легковые" && r["Услуга"] === "Балансировка" && r["Радиус"] === "R16");
  assert.equal(row["Цена, ₽"], 330); row["Цена, ₽"] = 350;
  rows.find((r) => r["Услуга"] === "Подкачка")["Цена, ₽"] = "0";
  const d = SM.excel.diff(P, rows); assert.equal(d.changes.length, 1); assert.equal(d.changes[0].was, 330); assert.equal(d.errors.length, 1);
  SM.excel.apply(P, d.changes); assert.equal(SM.prices.radiusPrice(P, "passenger", "Балансировка", "R16"), 350);
  assert.equal(SM.plateValid("А123ВС50"), true); assert.equal(SM.plateValid("А123ВС750"), true); assert.equal(SM.plateValid("Б123ВС50"), false); assert.equal(SM.plateMiddle("В770СУ797"), "770");
});
test("Демо-данные: ~2 месяца чеков, хранение просрочено/истекает, склад ниже минимума, открытая смена", () => {
  SM.clock.fixed = null; const S = SM.seed();
  assert.ok(S.receipts.length > 300); assert.ok(S.shifts.filter((s) => s.endedAt).length > 40);
  assert.ok(S.storage.some((r) => SM.storage.status(S, r) === "overdue")); assert.ok(S.storage.some((r) => SM.storage.status(S, r) === "soon"));
  assert.equal(SM.warehouse.low(S).length, 2); assert.ok(SM.shift.current(S));
  assert.ok(S.clients.every((c) => c.phone.startsWith("790000000")));
});

// ---------- п.2 (решение Артёма): хранение — фиксированный тариф, скидки на хранение не действуют ----------
test("Хранение: цена по тарифу владельца (радиус, срок, диски, кол-во), подставляется сама; изменение тарифа в админке", () => {
  const S = fresh();
  const c = (d) => SM.storage.calcPrice(S, d);
  assert.equal(c({ radius: "R16", months: 6, qty: 4 }).price, 3500);
  assert.equal(c({ size: "225/45 R17", months: 6, qty: 4 }).price, 3800); // радиус из размера
  assert.equal(c({ radius: "R16", months: 6, qty: 4, rims: true }).price, 4000); // + диски 500
  assert.equal(c({ radius: "R16", months: 3, qty: 4 }).price, 1750); // пропорционально сроку
  assert.equal(c({ radius: "R16", months: 6, qty: 2 }).price, 1750); // пропорционально числу шин
  assert.equal(c({ radius: "R15", months: 7, qty: 4 }).price, 3750); // 3200×7/6 = 3733 → 3750 (до 50 ₽)
  assert.equal(c({ radius: "R99", months: 6 }).ok, false);
  // приём: цена подставляется по тарифу, ручная цена без priceOverride игнорируется
  let r = SM.storage.create(S, { plate: "А111АА77", phone: "79000000001", qty: 4, size: "205/55 R16", place: "А-1", months: 6, price: 100 });
  assert.equal(r.ok, true); assert.equal(r.rec.price, 3500); assert.equal(r.rec.priceManual, false); assert.equal(r.rec.months, 6);
  assert.equal(SM.dayKey(r.rec.until), "2027-05-18");
  // владелец поменял тариф → следующий приём по новой цене, старый комплект не меняется
  S.settings.storageTariff.R16 = 4000;
  const r2 = SM.storage.create(S, { plate: "А222АА77", phone: "79000000002", qty: 4, size: "205/55 R16", place: "А-2", months: 6 });
  assert.equal(r2.rec.price, 4000); assert.equal(r.rec.price, 3500);
  // ручная цена — только с priceOverride (в интерфейсе — после PIN владельца)
  const r3 = SM.storage.create(S, { plate: "А333АА77", phone: "79000000003", qty: 4, size: "205/55 R16", place: "А-3", months: 6, price: 3000, priceOverride: true });
  assert.equal(r3.rec.price, 3000); assert.equal(r3.rec.priceManual, true);
  assert.equal(SM.storage.create(S, { plate: "А444АА77", phone: "79000000004", qty: 4, size: "205/55 R99", place: "А-4", months: 6 }).ok, false);
});
test("Чек со скидкой: скидка постоянному и ручная — только на услуги, хранение по полной цене и не в базе ЗП мастеров", () => {
  const S = fresh(); SM.shift.open(S, ["a"], 0);
  SM.addClient(S, { name: "Пост", phone: "79000000077", plate: "К777КК77", wheel_size: "R16" });
  const st = SM.storage.create(S, { plate: "К777КК77", qty: 4, size: "205/55 R16", place: "Б-1", months: 6 }).rec; // 3500
  const o = SM.orders.create(S, { plate: "К777КК77" }, "т").order;
  o.loyalty = true;
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "r:Переобувка 4 колеса", "passenger", "R16"), 1, { radius: "R16", typeKey: "passenger" }, "т"); // 3700
  assert.equal(SM.orders.addStorage(S, o, st, "т").ok, true);
  assert.equal(SM.orders.addStorage(S, o, st, "т").ok, false); // второй раз нельзя
  assert.equal(SM.storage.pay(S, st, "cash").ok, false); // отдельно не оплатить, пока в чеке заказа
  const si = o.items.find((i) => i.storageId);
  assert.equal(SM.orders.setPrice(S, o, si.id, 100, "т").ok, false); // цена хранения фиксированная
  SM.orders.setQty(S, o, si.id, 2, "т"); assert.equal(si.qty, 1);
  let t = SM.cart.totals(o, S.settings);
  assert.equal(t.discountBase, 3700); assert.equal(t.storage, 3500); assert.equal(t.loyalty, 370); assert.equal(t.total, 3700 - 370 + 3500);
  // ручная 10% — тоже только от услуг; лимит считается от услуг
  assert.equal(SM.orders.setDiscount(S, o, { type: "pct", value: 10 }, "т").ok, true);
  t = SM.cart.totals(o, S.settings); assert.equal(t.manual, 370); assert.equal(t.discount, 740); assert.equal(t.total, 3700 - 740 + 3500);
  // ₽-скидка больше услуг не «съедает» хранение
  S.settings.discountMaxPct = 0; S.settings.discountMaxRub = 0;
  assert.equal(SM.orders.setDiscount(S, o, { type: "rub", value: 99999 }, "т").ok, true);
  t = SM.cart.totals(o, S.settings); assert.equal(t.discount, 3700); assert.equal(t.total, 3500);
  SM.orders.setDiscount(S, o, { type: "pct", value: 10 }, "т");
  // лимит 15% / 1000 ₽ — от суммы услуг 3700 (не от 7200 с хранением): 1000 ₽ = 27% → строже 15% = 555 ₽
  S.settings.discountMaxPct = 15; S.settings.discountMaxRub = 1000;
  assert.equal(SM.cart.discountLimit(S.settings, t.discountBase).rub, 555);
  assert.equal(SM.cart.checkDiscount(Object.assign({}, o, { discount: { type: "rub", value: 600 } }), S.settings).ok, false);
  SM.clock.fixed = T0 + H;
  const r = SM.orders.pay(S, o, "card", "т");
  assert.equal(r.ok, true); assert.equal(r.receipt.total, 2960 + 3500);
  assert.equal(st.paid, true); assert.equal(st.receiptId, r.receipt.id);
  // ЗП мастера: 40% только от услуг (2960), хранение не входит
  const sh = SM.shift.current(S);
  const ledger = SM.payroll.ledgerFor(S, sh.id); assert.equal(ledger[0].delta, 2960);
  assert.equal(SM.payroll.forShift(S, sh, T0 + 2 * H)[0].raw, 1184);
  // отчёт: услуги и хранение раздельно, хранение не в «топе услуг»
  const rep = SM.reports.range(S, T0 - H, T0 + 3 * H);
  assert.equal(rep.services, 2960); assert.equal(rep.storage, 3500); assert.equal(rep.revenue, 6460);
  assert.ok(!rep.topServices.some((x) => /Хранение/.test(x.name)));
  assert.equal(SM.shift.revenue(S, sh.id).storage, 3500);
  // «Как в прошлый раз» не повторяет хранение
  const o2 = SM.orders.create(S, { plate: "К777КК77" }, "т").order; SM.orders.repeatLast(S, o2, "т");
  assert.ok(o2.items.length === 1 && !o2.items.some((i) => i.storageId));
});
// ---------- п.4 (решение Артёма): грузики — только коробками, без норм на машину ----------
test("Склад: грузики только коробками — нет норм, нет автосписания, приход/выдача/инвентаризация целыми коробками", () => {
  const S0 = SM.seed();
  const box = S0.warehouse.items.filter((i) => SM.warehouse.isBox(i));
  assert.deepEqual(box.map((i) => i.id).sort(), ["w1", "w2"]);
  assert.ok(box.every((i) => i.unit === "кор" && Number.isInteger(i.qty)));
  assert.equal(S0.warehouse.norms.filter((n) => n.itemId === "w1" || n.itemId === "w2").length, 0);
  assert.ok(S0.warehouse.norms.some((n) => n.itemId === "w7")); // остальные нормы на месте (монтажная паста)
  assert.ok(S0.warehouse.moves.some((m) => m.type === "box")); // в истории есть выдачи коробок
  const S = fresh(); SM.shift.open(S, ["a"], 0);
  S.warehouse.items = [{ id: "w1", name: "Грузики набивные (коробка)", unit: "кор", cost: 2400, min: 2, qty: 3, box: true }, { id: "w7", name: "Паста", unit: "г", cost: 0.35, min: 0, qty: 1000 }];
  assert.equal(SM.warehouse.setNorm(S, "r:Балансировка", "w1", 25).ok, false);
  assert.equal(S.warehouse.norms.length, 0);
  S.warehouse.norms.push({ id: "old", key: "r:Балансировка", itemId: "w1", perUnit: 25 }); // старая норма из прежних данных — игнорируется
  SM.warehouse.setNorm(S, "r:Монтаж", "w7", 5);
  const o = SM.orders.create(S, { plate: "Р100РР77" }, "т").order;
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "r:Балансировка", "passenger", "R16"), 4, { radius: "R16", typeKey: "passenger" }, "т");
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "r:Монтаж", "passenger", "R16"), 4, { radius: "R16", typeKey: "passenger" }, "т");
  const p = SM.orders.pay(S, o, "cash", "т");
  assert.equal(SM.warehouse.item(S, "w1").qty, 3); // грузики не списались
  assert.equal(SM.warehouse.item(S, "w7").qty, 980); // паста списалась по норме
  assert.ok(!p.writeoff.lines.some((l) => l.itemId === "w1"));
  assert.equal(SM.warehouse.writeOff(S, "w1", 0.5, "Выдана в работу").ok, false);
  assert.equal(SM.warehouse.writeOff(S, "w1", 5, "Выдана в работу").ok, false); // больше, чем есть
  const w = SM.warehouse.writeOff(S, "w1", 1, "Выдана в работу");
  assert.equal(w.ok, true); assert.equal(w.move.type, "box"); assert.equal(SM.warehouse.item(S, "w1").qty, 2);
  assert.equal(SM.warehouse.receive(S, { lines: [{ itemId: "w1", qty: 1.5, price: 2400 }] }).ok, false);
  assert.equal(SM.warehouse.receive(S, { lines: [{ itemId: "w1", qty: 2, price: 2400 }] }).ok, true);
  assert.equal(SM.warehouse.item(S, "w1").qty, 4);
  assert.equal(SM.warehouse.inventory(S, { w1: 3.7 }, false).length, 0); // дробный факт не принимается
  assert.equal(SM.warehouse.inventory(S, { w1: 3 }, true)[0].diff, -1);
  assert.equal(SM.warehouse.costInRange(S, 0, T0 + 5 * H), SM.round2(20 * 0.35 + 2400 + 2400)); // паста + выданная коробка + недостача коробки
});
test("Документы: договор хранения и согласие на ПД — шаблоны с реквизитами ИП, поля клиента подставляются", () => {
  const D = SM.DOCS;
  for (const h of [D.contract, D.consent]) { assert.ok(/773580864120/.test(h) && /325774600692668/.test(h) && /Андреевка/.test(h) && /юристом не проверен/i.test(h)); }
  assert.ok(/Акт приёма/.test(D.contract) && /непреодолимой силы/.test(D.contract) && /ст\. 899/.test(D.contract));
  assert.ok(/Цели обработки/.test(D.consent) && /госномер|регистрационный номер/.test(D.consent) && /отозвать/.test(D.consent));
  const f = SM.docFill(D.contract, { "ФИО клиента": "Иван <демо>", "Номер договора": "Х-0001" });
  assert.ok(f.includes("Иван &lt;демо&gt;") && f.includes("Х-0001") && !/data-f=/.test(f));
});

/* ===================== Пачка правок 18–19.11 ===================== */
test("п.1 Коммерческий (R14C/R15C/R16C) и Газель (только R16); надбавка +20% RunFlat на пакеты работает и для них", () => {
  const S = fresh(); const P = SM.prices;
  assert.equal(P.radiusPrice(S.prices, "commercial", "Переобувка 4 колеса", "R14"), 3900); // колонка R14C
  assert.equal(P.radiusPrice(S.prices, "commercial", "Балансировка", "R16"), 305);         // R16C
  assert.equal(P.radiusPrice(S.prices, "gazel", "Переобувка 4 колеса", "R16"), 6150);      // Газель = 6 колёс: 6 × 1025
  assert.equal(P.hasRadius(S.prices, "gazel", "R15"), false);
  assert.equal(P.hasRadius(S.prices, "commercial", "R17"), false);
  assert.equal(P.hasRadius(S.prices, "commercial", "R13"), false);
  assert.equal(P.hasRadius(S.prices, "passenger", "R16"), true);
  assert.equal(P.typeLabel("commercial"), "Коммерческий"); assert.equal(P.typeLabel("gazel"), "Газель");
  const o = { items: [], runflat: true, history: [] };
  SM.orders.addItem(S, o, P.find(S.prices, "r:Переобувка 4 колеса", "gazel", "R16"), 1, { radius: "R16", typeKey: "gazel" }, "т");
  SM.orders.addItem(S, o, P.find(S.prices, "r:Балансировка", "commercial", "R15"), 4, { radius: "R15", typeKey: "commercial" }, "т");
  assert.equal(o.items[0].typeKey, "gazel"); assert.equal(o.items[1].price, 270);
  const t = SM.cart.totals(o, S.settings);
  assert.equal(t.surcharge, 1230); // 20% от 6150, балансировка без надбавки
  assert.equal(t.total, 6150 + 1080 + 1230);
});
test("п.2 Живая очередь: талон по госномеру с планшета, повтор номера — тот же талон, нумерация каждый день с №1, не в сезон — нет", () => {
  const S = fresh(); const L = SM.live;
  const a = L.take(S, "а123вс50"); assert.equal(a.ok, true); assert.equal(a.ticket.no, 1); assert.equal(a.ticket.plate, "А123ВС50");
  const b = L.take(S, "В777ВВ77"); assert.equal(b.ticket.no, 2); assert.equal(b.ahead, 1);
  const a2 = L.take(S, "А123ВС50"); assert.equal(a2.existed, true); assert.equal(a2.ticket.no, 1);
  assert.equal(L.take(S, "").ok, false);
  SM.clock.fixed = T0 + 24 * H; // следующий день
  const c = L.take(S, "Е555КХ77"); assert.equal(c.ticket.no, 1); assert.equal(c.ticket.day, "2026-11-19");
  assert.equal(L.waiting(S).length, 1); // вчерашние талоны в сегодняшней очереди не показываются
  assert.equal(SM.queueAdd(S, "касса").no, 2);
  S.settings.seasonMode = false; const off = L.take(S, "Т456ТТ50"); assert.equal(off.ok, false); assert.match(off.msg, /сезон/);
});
test("п.3 Три поста: запись на 2 поста, живая очередь на 3-й, ожидание примерное", () => {
  const S = fresh(); const L = SM.live;
  assert.deepEqual(L.posts(S), { total: 3, booking: 2, live: 1, bookingPosts: [1, 2], livePosts: [3] });
  assert.equal(SM.booking.capacity(S), 2);
  S.settings.slotCapacity = 3; S.settings.seasonMode = false; assert.equal(SM.booking.capacity(S), 3); assert.equal(L.posts(S).live, 3); S.settings.seasonMode = true;
  // слоты записи: 2 машины на слот, третья запись в тот же слот не проходит
  const day = SM.dayKey(T0 + 24 * H);
  const mk = (n) => SM.booking.create(S, { consent: true, name: "К" + n, phone: "7900111000" + n, direction: "full", date: day, time: "10:00", plate: "" });
  assert.equal(mk(1).ok, true); assert.equal(mk(2).ok, true); assert.equal(mk(3).ok, false);
  // ожидание: 40 мин на машину, 1 пост очереди
  ["А111АА77", "В222ВВ77", "Е333ЕЕ77"].forEach((p) => L.take(S, p));
  assert.equal(L.waitMin(S, 1), 0); assert.equal(L.waitMin(S, 3), 80);
  const n = SM.queueNext(S); assert.equal(n.no, 1); assert.equal(n.post, 3); assert.equal(n.status, "called");
  assert.equal(L.waitMin(S, 3), 60); // 1 впереди + машина на посту ×½ → (1 + 0,5) × 40 = 60
  assert.equal(L.waitLabel(80), "≈ 1 ч 20 мин"); assert.equal(L.waitLabel(0), "сразу, подъезжайте");
  // заказ по талону закрывает талон при оплате
  SM.shift.open(S, ["a"], 0);
  const o = SM.orders.create(S, { plate: "А111АА77", queueNo: 1 }, "т").order;
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "f:Подкачка", "passenger", "R16"), 1, {}, "т");
  SM.orders.pay(S, o, "card", "т"); assert.equal(L.find(S, 1).status, "done");
});
test("п.4 Сетевой принтер: проверка IP, CP866, ESC/POS; в браузере/Node честный отказ «только APK»", () => {
  const PR = SM.printer;
  assert.equal(PR.validIp("192.168.1.50"), true); assert.equal(PR.validIp("192.168.1.256"), false); assert.equal(PR.validIp("принтер"), false); assert.equal(PR.validIp(""), false);
  assert.deepEqual(PR.encode866("Талон №5"), [0x92, 0xa0, 0xab, 0xae, 0xad, 0x20, 0xfc, 0x35]);
  assert.deepEqual(PR.encode866("Ёё я"), [0xf0, 0xf1, 0x20, 0xef]);
  const b = PR.escpos([{ text: "A", big: true, align: "center" }]);
  assert.deepEqual(b.slice(0, 5), [0x1b, 0x40, 0x1b, 0x74, 17]);
  assert.deepEqual(b.slice(-4), [0x1d, 0x56, 0x42, 0]);
  assert.ok(b.join(",").indexOf([0x1d, 0x21, 0x11].join(",")) > 0);
  const S = fresh();
  assert.equal(PR.print(S, ["x"]).reason, "noip");
  S.settings.printerIp = "10.0.0.999"; assert.equal(PR.print(S, ["x"]).reason, "badip");
  S.settings.printerIp = "192.168.1.50"; const r = PR.print(S, PR.testLines(S)); assert.equal(r.ok, false); assert.equal(r.reason, "browser"); assert.match(r.msg, /APK/);
  const t = SM.queueAdd(S, "планшет", "А123ВС50"); const lines = PR.ticketLines(S, t, 40);
  assert.ok(lines.some((l) => l.text === "Талон №1" && l.big));
  assert.equal(PR.toBase64([0x1b, 0x40]), "G0A=");
});
test("п.9 Покраска: наряд без оплаты → «В покраске», правка и услуги из прайса, выдача одним чеком", () => {
  const S = fresh(); const PN = SM.paint;
  const base = { plate: "А123ВС50", phone: "79000000001", name: "Иван", radius: "R17", disks: 4, color: "чёрный", caps: true, tires: true, tireBrand: "Nokian", paintPrice: 16000 };
  assert.equal(PN.create(S, Object.assign({}, base, { tireBrand: "" }), "т").ok, false); // с резиной — нужна марка
  assert.equal(PN.create(S, Object.assign({}, base, { straighten: { qty: 5, sum: 1000 } }), "т").ok, false); // правка > дисков
  assert.equal(PN.create(S, Object.assign({}, base, { color: "" }), "т").ok, false);
  assert.equal(PN.create(S, Object.assign({}, base, { paintPrice: 0 }), "т").ok, false);
  assert.equal(PN.create(S, Object.assign({}, base, { plate: "", phone: "" }), "т").ok, false);
  const r = PN.create(S, Object.assign({}, base, { straighten: { qty: 2, sum: 3000 }, services: [{ key: "r:Снятие и установка 4-х колёс", qty: 1, typeKey: "passenger", radius: "R17" }, { key: "r:Балансировка", qty: 4, typeKey: "passenger", radius: "R17" }] }), "т");
  assert.equal(r.ok, true); const p = r.order;
  assert.equal(p.status, "paint"); assert.equal(S.receipts.length, 0); // при приёме денег не берём
  assert.equal(p.caps, true); assert.equal(p.tireBrand, "Nokian"); assert.deepEqual(p.straighten, { qty: 2, sum: 3000 });
  const exp = 16000 + 3000 + 1100 + 4 * 350;
  assert.equal(PN.totals(S, p).total, exp); assert.equal(PN.due(S), exp); assert.equal(PN.active(S).length, 1);
  assert.equal(PN.addService(S, p, { key: "f:Утилизация б/у автошины", qty: 4 }, "т").ok, true);
  assert.equal(PN.removeItem(S, p, p.items[0].id, "т").ok, false); // покраску из наряда не убрать
  assert.equal(PN.pay(S, p, "cash", "т").ok, false); // смена не открыта
  SM.shift.open(S, ["a"], 0); PN.setReady(S, p, "т"); assert.equal(p.status, "ready");
  const pay = PN.pay(S, p, "cash", "т");
  assert.equal(pay.ok, true); assert.equal(S.receipts.length, 1); // один чек на всё
  assert.equal(pay.receipt.total, exp + 200); assert.equal(pay.receipt.items.length, 5); assert.equal(pay.receipt.paintId, p.id);
  assert.equal(S.drawer.balance, exp + 200); assert.equal(p.status, "done"); assert.equal(PN.active(S).length, 0);
  assert.equal(PN.pay(S, p, "cash", "т").ok, false); // повторно не оплатить
  assert.equal(SM.shift.revenue(S, SM.shift.current(S).id).total, exp + 200);
});
test("п.10 Напоминания: за 24 ч и за 2 ч, только с согласием и каналом, без дублей, журнал (имитация)", () => {
  const S = fresh(); const RM = SM.reminders;
  const c1 = SM.addClient(S, { name: "Согласен", phone: "79000000011", plate: "А111АА77" }).client; RM.setClient(S, c1, "telegram", true);
  const c2 = SM.addClient(S, { name: "Без согласия", phone: "79000000012", plate: "В222ВВ77" }).client; RM.setClient(S, c2, "sms", false);
  assert.equal(RM.setClient(S, c2, "pigeon", true).ok, false);
  const day = SM.dayKey(T0 + 48 * H); // 20.11 — визит в 12:00, запись сделана 18.11 09:00
  const b1 = SM.booking.create(S, { consent: true, name: "Согласен", phone: "79000000011", plate: "А111АА77", direction: "full", date: day, time: "12:00" }).booking;
  const b2 = SM.booking.create(S, { consent: true, name: "Без согласия", phone: "79000000012", plate: "В222ВВ77", direction: "full", date: day, time: "12:00" }).booking;
  const visit = RM.visitTs(b1);
  assert.equal(RM.run(S, visit - 25 * H).length, 0); // рано
  let n = RM.run(S, visit - 24 * H);
  assert.equal(n.length, 2);
  const e1 = n.find((e) => e.bookingId === b1.id), e2 = n.find((e) => e.bookingId === b2.id);
  assert.equal(e1.status, "sent"); assert.equal(e1.channel, "telegram"); assert.equal(e1.kind, "24h"); assert.equal(e1.demo, true); assert.match(e1.text, /12:00/);
  assert.equal(e2.status, "skip"); assert.match(e2.reason, /согласи/);
  assert.equal(RM.run(S, visit - 23 * H).length, 0); // без дублей
  n = RM.run(S, visit - 2 * H + 60e3); assert.equal(n.filter((e) => e.status === "sent").length, 1); assert.equal(n[0].kind, "2h");
  assert.equal(RM.run(S, visit + H).length, 0); // после визита — ничего
  assert.equal(S.reminders.log.length, 4);
  // запись сделана менее чем за 24 ч → «за 24 ч» не отправляется, «за 2 ч» — да
  SM.clock.fixed = visit - 5 * H;
  S.settings.bookRepair = true; // запись на ремонт — галочка владельца (по умолчанию выключена)
  const b3 = SM.booking.create(S, { consent: true, name: "Поздно", phone: "79000000011", plate: "А111АА77", direction: "repair", date: day, time: "17:00", remind: { channel: "max", consent: true } }).booking;
  assert.equal(SM.client(S, b3.clientId).notify.channel, "max"); // канал из онлайн-записи
  n = RM.run(S, visit - 4 * H); const late = n.find((e) => e.bookingId === b3.id); assert.equal(late.status, "skip"); assert.match(late.reason, /позже/);
  n = RM.run(S, RM.visitTs(b3) - 2 * H); assert.equal(n.find((e) => e.bookingId === b3.id).status, "sent");
  // отменённая запись и выключенные напоминания
  b3.status = "cancel"; S.settings.remindersOn = false; assert.equal(RM.run(S, RM.visitTs(b3) - 60e3).length, 0);
  assert.equal(RM.plan(S, b1).every((x) => x.state === "sent"), true);
});
test("п.11 Владелец: свои услуги (фикс / по радиусу и типу / вводится), правка цен, скрытие; встроенные не переименовываются", () => {
  const S = fresh(); const P = SM.prices;
  assert.equal(P.addCustom(S.prices, { name: "", group: "small", mode: "fixed", price: 100 }).ok, false);
  assert.equal(P.addCustom(S.prices, { name: "Балансировка", group: "tire", mode: "fixed", price: 100 }).ok, false); // уже есть
  assert.equal(P.addCustom(S.prices, { name: "Мойка колёс", group: "small", mode: "fixed", price: 0 }).ok, false);
  assert.equal(P.addCustom(S.prices, { name: "Мойка колёс", group: "small", mode: "radial", grid: {} }).ok, false);
  const f = P.addCustom(S.prices, { name: "Мойка колёс", group: "small", mode: "fixed", price: 400 }); assert.equal(f.ok, true);
  const rd = P.addCustom(S.prices, { name: "Шиповка", group: "tire", mode: "radial", grid: { passenger: { R15: 900, R16: "1000", R17: "" }, gazel: { R16: 1500 } } }); assert.equal(rd.ok, true);
  const mn = P.addCustom(S.prices, { name: "Сварка диска", group: "repair", mode: "manual", fromPrice: 1500 }); assert.equal(mn.ok, true);
  let cat = P.catalog(S.prices, "passenger", "R16");
  assert.equal(cat.find((t) => t.key === f.key).price, 400);
  assert.equal(cat.find((t) => t.key === rd.key).price, 1000); assert.equal(P.find(S.prices, rd.key, "passenger", "R17").price, null);
  assert.equal(P.find(S.prices, rd.key, "gazel", "R16").price, 1500);
  assert.equal(cat.find((t) => t.key === mn.key).manual, true);
  assert.equal(P.updateCustom(S.prices, f.service.id, { price: 450, name: "Мойка колёс (4 шт)" }).ok, true);
  assert.equal(P.find(S.prices, f.key, "passenger", "R16").name, "Мойка колёс (4 шт)");
  // правка встроенных цен
  assert.equal(P.setRadialPrice(S.prices, "Балансировка", "passenger", "R16", 345).ok, true); assert.equal(P.radiusPrice(S.prices, "passenger", "Балансировка", "R16"), 345);
  assert.equal(P.setRadialPrice(S.prices, "Балансировка", "commercial", "R14", 260).ok, true); assert.equal(S.prices.commercial.services["Балансировка"][0], 260);
  assert.equal(P.setFlatPrice(S.prices, "Подкачка", 120).ok, true); assert.equal(P.find(S.prices, "f:Подкачка", "passenger", "R16").price, 120);
  assert.equal(P.setFlatPrice(S.prices, "Подкачка", 0).ok, false);
  // скрытие: не видно на кассе и в «Частых», в полном списке — есть
  P.setHidden(S.prices, "f:Подкачка", true); P.setHidden(S.prices, "r:Монтаж", true);
  cat = P.catalog(S.prices, "passenger", "R16");
  assert.equal(cat.some((t) => t.key === "f:Подкачка" || t.key === "r:Монтаж"), false);
  assert.equal(P.catalog(S.prices, "passenger", "R16", { all: true }).some((t) => t.key === "r:Монтаж"), true);
  assert.equal(SM.prices.frequent(S, 9).map((k) => cat.find((t) => t.key === k)).filter(Boolean).some((t) => t.key === "r:Монтаж"), false);
  assert.equal(P.setHidden(S.prices, "gift", true).ok, false);
  P.setHidden(S.prices, "f:Подкачка", false); assert.ok(P.find(S.prices, "f:Подкачка", "passenger", "R16"));
  // своя услуга в чеке
  SM.shift.open(S, ["a"], 0);
  const o = SM.orders.create(S, { plate: "А123ВС50" }, "т").order;
  assert.equal(SM.orders.addItem(S, o, P.find(S.prices, rd.key, "passenger", "R15"), 4, { radius: "R15", typeKey: "passenger" }, "т").ok, true);
  assert.equal(SM.orders.pay(S, o, "card", "т").receipt.total, 3600);
});
test("п.11 Товары: цена/закупка/остаток, в чек без скидок и не в % мастеров, списание со склада, закупка в прибыли", () => {
  const S = fresh(); const G = SM.products;
  assert.equal(G.add(S, { name: "", price: 100, qty: 1 }).ok, false);
  assert.equal(G.add(S, { name: "Щётки", price: 0, qty: 1 }).ok, false);
  assert.equal(G.add(S, { name: "Щётки", price: 900, cost: 450, qty: 1.5 }).ok, false);
  const p = G.add(S, { name: "Щётки", price: 900, cost: 450, qty: 3, min: 2 }).product;
  assert.equal(G.add(S, { name: "щётки", price: 900, qty: 1 }).ok, false); // дубль
  SM.shift.open(S, ["a"], 0);
  const o = SM.orders.create(S, { plate: "А123ВС50" }, "т").order; o.loyalty = true;
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "r:Балансировка", "passenger", "R16"), 4, { radius: "R16", typeKey: "passenger" }, "т");
  assert.equal(G.addToOrder(S, o, p.id, 2, "т").ok, true);
  assert.equal(G.addToOrder(S, o, p.id, 2, "т").ok, false); // на складе 3, в заказе уже 2
  const it = o.items.find((i) => i.productId === p.id);
  assert.equal(SM.orders.setQty(S, o, it.id, 4, "т").ok, false);
  assert.equal(SM.orders.setPrice(S, o, it.id, 1, "т").ok, false); // цену товара на кассе не менять
  assert.equal(SM.orders.setDiscount(S, o, { type: "rub", value: 100 }, "т").ok, true);
  const t = SM.cart.totals(o, S.settings);
  assert.equal(t.goods, 1800); assert.equal(t.discountBase, 1320); assert.equal(t.discount, 132 + 100); // скидки только от услуг
  assert.equal(t.total, 1320 - 232 + 1800); assert.equal(t.count, 4);
  const r = SM.orders.pay(S, o, "card", "т").receipt;
  assert.equal(G.get(S, p.id).qty, 1); assert.equal(r.goodsCost, 900);
  assert.equal(G.low(S).length, 1); // ниже минимума → предупреждение владельцу
  assert.equal(SM.cart.serviceAmount(r), 1320 - 232); // в базу % мастеров — без товаров
  assert.equal(SM.payroll.ledgerFor(S, r.shiftId)[0].delta, 1088);
  const rep = SM.reports.month(S, "2026-11"); assert.equal(rep.goods, 1800); assert.equal(rep.goodsCost, 900); assert.equal(rep.services, 1088);
  // скрытый — не продаётся; правка остатка владельцем пишется в движения
  G.setHidden(S, p.id, true); const o2 = SM.orders.create(S, { plate: "В777ВВ77" }, "т").order; assert.equal(G.addToOrder(S, o2, p.id, 1, "т").ok, false);
  assert.equal(G.update(S, p.id, { qty: 10 }).ok, true); assert.equal(S.productMoves[S.productMoves.length - 1].qty, 9);
  // остатка не хватило к моменту оплаты — чек не пробивается
  G.setHidden(S, p.id, false); G.addToOrder(S, o2, p.id, 2, "т"); G.update(S, p.id, { qty: 1 });
  assert.equal(SM.orders.pay(S, o2, "cash", "т").ok, false);
});
test("Демо-данные v3: товары, покраска, живая очередь, напоминания создаются; RunFlat-надбавка в seed не сломана", () => {
  const S = SM.seed({ now: new Date(2026, 10, 19, 14, 0).getTime() });
  assert.equal(S.version, 4);
  assert.ok(S.products.length >= 5); assert.equal(SM.paint.active(S).length, 2);
  assert.equal(SM.live.waiting(S).length, 2); assert.equal(SM.live.waiting(S)[0].no, 1);
  assert.ok(S.clients.some((c) => c.notify && c.notify.consent));
  assert.ok(S.receipts.some((r) => r.runflat && r.totals.surcharge > 0));
  assert.ok(S.receipts.some((r) => r.totals.goods > 0));
  SM.clock.fixed = null;
});

/* ===== Правки 19.11 (после публикации v2) ===== */
test("19.11 Давление: цифры без точки → 22 → 2.2, 30 → 3.0, 245 → 2.45; проверка 1–6 бар", () => {
  assert.equal(SM.pressureFromDigits("22"), "2.2"); assert.equal(SM.pressureFromDigits("30"), "3.0");
  assert.equal(SM.pressureFromDigits("245"), "2.45"); assert.equal(SM.pressureFromDigits("2.2"), "2.2"); assert.equal(SM.pressureFromDigits(""), "");
  assert.equal(SM.pressureValid("2.2"), true); assert.equal(SM.pressureValid(""), true); assert.equal(SM.pressureValid("0.5"), false); assert.equal(SM.pressureValid("7.0"), false);
});
test("19.11 Несколько машин у клиента: поиск по номеру — сразу машина, по телефону — все машины, визиты по машине, скидка общая", () => {
  const S = fresh(); const CL = SM.clients;
  const c = SM.addClient(S, { name: "Пётр", phone: "+7 900 111-22-33", cars: [{ plate: "А111АА77", car: "Kia Rio", wheel_size: "R15" }, { plate: "В222ВВ77", car: "Газель", wheel_size: "R16", typeKey: "gazel" }] }).client;
  assert.equal(CL.cars(c).length, 2); assert.equal(c.plate, "А111АА77"); // основная машина — первая
  const f = CL.findByPlate(S, "в222вв77"); assert.equal(f.client.id, c.id); assert.equal(f.car.car, "Газель");
  const byPlate = CL.search(S, "В222ВВ77"); assert.equal(byPlate.length, 1); assert.equal(byPlate[0].car.plate, "В222ВВ77");
  const byPhone = CL.search(S, "89001112233"); assert.equal(byPhone.length, 1); assert.equal(byPhone[0].client.id, c.id); assert.equal(byPhone[0].car, null); // по телефону — машину выбирают
  SM.shift.open(S, ["a"], 0);
  const o = SM.orders.create(S, { plate: "В222ВВ77" }, "т").order; assert.equal(o.clientId, c.id); assert.equal(o.carId, f.car.id);
  SM.orders.addItem(S, o, SM.prices.find(S.prices, "f:Подкачка", "passenger", "R16"), 1, {}, "т"); SM.orders.pay(S, o, "card", "т");
  assert.equal(CL.carVisits(S, c, f.car).length, 1); assert.equal(CL.carVisits(S, c, CL.cars(c)[0]).length, 0);
  assert.equal(SM.clientVisits(S, c.id).length, 1); // скидка постоянному считается по всем машинам клиента
});
test("19.11 Карточка клиента: правка без PIN, история «было → стало», кто и когда; чужой номер/телефон не даём", () => {
  const S = fresh(); const CL = SM.clients;
  const c = SM.addClient(S, { name: "Анна", phone: "79001234567", plate: "Е555КХ77", car: "Solaris" }).client;
  const d = SM.addClient(S, { name: "Борис", phone: "79007654321", plate: "О777ОО77" }).client;
  const cars = CL.cars(c).map((x) => Object.assign({}, x));
  cars[0].plate = "Е556КХ77"; cars[0].pFront = "2.3"; cars.push({ plate: "М100ММ50", car: "Lada" });
  const r = CL.update(S, c, { name: "Анна С.", phone: "+7 900 123-45-67", cars }, "Мастер 1");
  assert.equal(r.ok, true);
  assert.ok(r.changes.some((t) => t === "Имя: Анна → Анна С.")); assert.ok(r.changes.some((t) => /Госномер: Е555КХ77 → Е556КХ77/.test(t)));
  assert.ok(r.changes.some((t) => /Давление перед/.test(t))); assert.ok(r.changes.some((t) => /Добавлена машина/.test(t)));
  assert.equal(c.history[c.history.length - 1].who, "Мастер 1"); assert.ok(c.history[0].ts > 0);
  assert.equal(CL.findByPlate(S, "Е555КХ77"), null); assert.deepEqual(CL.cars(c)[0].prevPlates, ["Е555КХ77"]); // старый номер помним для истории визитов, но по нему не узнаём (номер мог перейти другому)
  assert.equal(CL.update(S, c, { phone: d.phone }, "т").ok, false);
  const cc = CL.cars(c).map((x) => Object.assign({}, x)); cc[0].plate = "О777ОО77"; assert.equal(CL.update(S, c, { cars: cc }, "т").ok, false);
  const cp = CL.cars(c).map((x) => Object.assign({}, x)); cp[0].pRear = "9.9"; assert.equal(CL.update(S, c, { cars: cp }, "т").ok, false);
  assert.ok(CL.changeLog(S).length >= 4); assert.equal(CL.changeLog(S)[0].client, "Анна С.");
});
test("19.11 Миграция v3 → v4: клиент с одной машиной получает список машин, Газель 5 500 → 6 × «за 1 колесо»", () => {
  const S = fresh(); S.version = 3;
  S.clients = [{ id: "c1", name: "Старый", phone: "79000000009", plate: "Х999ХХ99", car: "Ford", wheel_size: "R16", typeKey: "passenger" }];
  const gi = S.prices.commercial.radii.indexOf("Газель"); S.prices.commercial.services["Переобувка 4 колеса"][gi] = 5500;
  SM.clients.migrateV3(S);
  assert.equal(S.version, 4); assert.equal(S.clients[0].cars.length, 1); assert.equal(S.clients[0].cars[0].plate, "Х999ХХ99");
  assert.equal(S.prices.commercial.services["Переобувка 4 колеса"][gi], 6 * S.prices.commercial.services["Итого за 1 колесо"][gi]);
  S.prices.commercial.services["Переобувка 4 колеса"][gi] = 7000; assert.equal(SM.prices.gazelKitFix(S.prices), false); // цену владельца не трогаем
});
test("19.11 Покраска дисков не в % мастеров и не в счётчике машин; состояние дисков в наряде", () => {
  const S = fresh(); const PN = SM.paint;
  assert.equal(PN.create(S, { plate: "А123ВС50", radius: "R17", disks: 4, color: "чёрный", paintPrice: 16000, diskCondition: ["без повреждений", "сколы краски"] }, "т").ok, false);
  const r = PN.create(S, { plate: "А123ВС50", radius: "R17", disks: 4, color: "чёрный", paintPrice: 16000, straighten: { qty: 1, sum: 1500 }, diskCondition: ["сколы краски", "бордюрка (потёртости кромки)"] }, "т");
  assert.equal(r.ok, true); assert.equal(PN.condText(r.order), "сколы краски, бордюрка (потёртости кромки)");
  SM.shift.open(S, ["a"], 0); PN.setReady(S, r.order, "т"); const pay = PN.pay(S, r.order, "cash", "т");
  assert.equal(SM.cart.paintAmount(pay.receipt), 16000); assert.equal(SM.cart.serviceAmount(pay.receipt), 1500); // в % — только правка
  assert.equal(SM.shift.revenue(S, SM.shift.current(S).id).paint, 16000);
  assert.equal(SM.orders.open(S).length, 0); // наряд покраски — не машина на посту
});
test("19.11 Онлайн-запись: только переобувка (3 вида с временем владельца), ремонт — если владелец включил", () => {
  const S = fresh(); const B = SM.booking; const day = SM.dayKey(T0 + 24 * H);
  assert.deepEqual(B.directions(S).map((d) => d.key), ["full", "wheels", "mount"]);
  assert.equal(B.directions(S)[0].label, "Полный шиномонтаж"); assert.match(B.directions(S)[0].sub, /снять, перебортировать, отбалансировать, поставить/);
  const mk = (dir, n) => B.create(S, { consent: true, name: "К", phone: "7900222000" + n, direction: dir, date: day, time: "11:00", plate: "" });
  assert.equal(mk("repair", 1).ok, false); S.settings.bookRepair = true; assert.equal(mk("repair", 2).ok, true);
  assert.equal(B.durMin(S, "full"), 40); assert.equal(B.durMin(S, "wheels"), 25); assert.equal(B.durMin(S, "mount"), 15);
  S.settings.durWheels = 30; assert.equal(B.durMin(S, "wheels"), 30);
  const L = SM.live; L.take(S, "А111АА77", "wheels"); L.take(S, "В222ВВ77", "mount"); assert.equal(L.waitMin(S, 3), 45); // 30 + 15 на 1 пост
});
test("19.11 Посты: одна машина на пост; очередь берёт свободный пост записи, если до записи успеваем; «Готова» освобождает пост", () => {
  const S = fresh(); const L = SM.live; SM.shift.open(S, ["a"], 0);
  ["А111АА77", "В222ВВ77", "Е333ЕЕ77", "К444КК77"].forEach((p) => L.take(S, p));
  let n = L.next(S); assert.equal(n.ok, true); assert.equal(n.post, 3); assert.equal(n.borrowed, false);
  n = L.next(S); assert.equal(n.post, 1); assert.equal(n.borrowed, true); // записей нет — пост записи 1 свободен
  // запись на 09:20 — до окончания (40 мин) успеть нельзя: пост 2 держим под запись
  S.bookings.push({ id: "b1", date: SM.dayKey(T0), time: "09:20", status: "new", direction: "full", name: "З", phone: "79003330000", plate: "М555ММ50" });
  n = L.next(S); assert.equal(n.ok, false); assert.match(n.msg, /не успеем до записи/);
  // записавшийся приехал: встаёт на пост 2; больше свободных постов нет
  const acc = SM.booking.accept(S, S.bookings[0], "т"); assert.equal(acc.ok, true); assert.equal(acc.order.post, 2);
  S.bookings.push({ id: "b2", date: SM.dayKey(T0), time: "09:30", status: "new", direction: "full", name: "Ж", phone: "79004440000", plate: "Т666ТТ50" });
  assert.equal(SM.booking.accept(S, S.bookings[1], "т").ok, false); // все посты заняты
  // машина с поста 3 готова (ждёт оплаты) → пост 3 свободен
  const o = SM.orders.create(S, { plate: "А111АА77", queueNo: 1 }, "т").order; SM.orders.setStatus(S, o, "ready", "т");
  assert.ok(L.freePosts(S).indexOf(3) >= 0); assert.match(o.history[o.history.length - 1].text, /Готова, ждёт оплаты/);
  assert.equal(L.release(S, 1).ok, true); assert.ok(L.freePosts(S).indexOf(1) >= 0); assert.equal(L.release(S, 1).ok, false);
});
test("19.11 Газель: «Переобувка 6 колёс» 6 150 ₽ (6 × 1 025), названия «6 колёс»", () => {
  const S = fresh();
  const cat = SM.prices.catalogAll(S.prices, "gazel", "R16");
  const kit = cat.find((t) => /Переобувка 6 колёс/.test(t.name)); assert.ok(kit); assert.equal(kit.price, 6150);
  assert.ok(cat.some((t) => /Снятие и установка 6 колёс/.test(t.name)));
});
test("19.11 Анкета на планшете: новый клиент; тот же телефон — добавляем машину в карточку с историей; чужой номер — к администратору", () => {
  const S = fresh();
  const r1 = SM.kioskSave(S, { name: "Ольга", phone: "+7 900 555-66-77", plate: "Р100РР50", car: "Polo", wheel_size: "R15", pFront: "2.2", pRear: "2.4" });
  assert.equal(r1.ok, true); assert.equal(r1.updated, false); assert.equal(r1.client.cars[0].pRear, "2.4"); assert.ok(r1.client.consent.at);
  const r2 = SM.kioskSave(S, { name: "Ольга", phone: "89005556677", plate: "С200СС50", car: "Tiguan", wheel_size: "R17" });
  assert.equal(r2.ok, true); assert.equal(r2.updated, true); assert.equal(r2.client.cars.length, 2); assert.equal(S.clients.length, 1);
  assert.ok(r2.client.history.some((h) => /Добавлена машина/.test(h.text) && h.who === "анкета на планшете"));
  assert.equal(SM.kioskSave(S, { name: "Чужой", phone: "79001110000", plate: "Р100РР50" }).ok, false);
});
