/* Демо-данные (вымышленные): мастера, клиенты, ~2 месяца чеков, хранение, склад, расходы, записи. */
(function (root) {
  const SM = root.SM;
  SM.seed = function (opts) {
    opts = opts || {};
    const realNow = opts.now || Date.now();
    let seed = 20261118;
    const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const wpick = (pairs) => { const t = pairs.reduce((s, p) => s + p[1], 0); let x = rnd() * t; for (const p of pairs) { if ((x -= p[1]) < 0) return p[0]; } return pairs[0][0]; };
    const at = (ts) => { SM.clock.fixed = ts; };
    const S = SM.emptyState();
    const day0 = SM.dayStart(realNow) - 62 * 864e5;
    at(day0 + 8 * 36e5);
    S.createdAt = day0;
    S.employees = [ { id: "e1", name: "Мастер 1", percent: 40, active: true }, { id: "e2", name: "Мастер 2", percent: 40, active: true }, { id: "e3", name: "Мастер 3", percent: 35, active: true } ];
    // Склад
    const W = [
      ["w1", "Грузики набивные (коробка)", "кор", 2400, 2, 6, true], ["w2", "Грузики клеевые (коробка)", "кор", 1800, 2, 4, true], ["w3", "Вентиль TR414", "шт", 18, 40, 150],
      ["w4", "Жгут ремонтный", "шт", 15, 30, 120], ["w5", "Грибок №7", "шт", 90, 10, 30], ["w6", "Герметик бортовой", "мл", 0.8, 500, 3000],
      ["w7", "Монтажная паста", "г", 0.35, 1000, 5000], ["w8", "Пакеты для шин", "шт", 6, 100, 600], ["w9", "Колпачки ниппеля", "шт", 3, 50, 200], ["w10", "Заплатка UP-4.5", "шт", 45, 10, 40]
    ];
    S.warehouse.items = W.map((w) => ({ id: w[0], name: w[1], unit: w[2], cost: w[3], min: w[4], qty: 0, box: !!w[6] }));
    // Грузики (w1, w2) — без норм: учитываются коробками (приход и выдача коробки в работу).
    const N = [["r:Переобувка 4 колеса", "w7", 20], ["r:Итого за 1 колесо", "w7", 5], ["r:Комплекс без смены резины", "w7", 20], ["r:Монтаж", "w7", 5], ["f:Ремонт жгутом", "w4", 1], ["f:Ремонт грибком", "w5", 1], ["f:Грибок №7", "w5", 1], ["f:Обработка герметиком", "w6", 50], ["gift", "w8", 1], ["f:Упаковочные пакеты", "w8", 4], ["f:Заплатка UP–4.5", "w10", 1]];
    N.forEach((n) => SM.warehouse.setNorm(S, n[0], n[1], n[2]));
    const restock = (ts, k) => { at(ts); SM.warehouse.receive(S, { supplier: pick(["ООО «Шинснаб» (демо)", "ИП Расходник (демо)"]), number: "Д-" + (S.warehouse.docs.length + 1), date: SM.dayKey(ts), lines: W.map((w) => ({ itemId: w[0], qty: Math.max(w[6] ? 1 : 0, Math.round(w[5] * k)), price: w[3] })) }); };
    restock(day0 + 8 * 36e5, 1);
    // Клиенты
    const names = ["Иван", "Пётр", "Ольга", "Сергей", "Анна", "Дмитрий", "Елена", "Николай", "Мария", "Алексей", "Татьяна", "Виктор", "Юлия", "Роман"];
    const L = SM.PLATE_LETTERS;
    const plate = () => L[Math.floor(rnd() * 12)] + String(100 + Math.floor(rnd() * 899)) + L[Math.floor(rnd() * 12)] + L[Math.floor(rnd() * 12)] + pick(["50", "750", "790", "77", "799", "190"]);
    names.forEach((n, i) => { const r = SM.addClient(S, { name: n + " (демо)", phone: "7900000" + "00" + String(i + 1).padStart(2, "0"), plate: i === 0 ? "А123ВС50" : plate(), car: pick(["Лада Веста", "Kia Rio", "Hyundai Creta", "Toyota RAV4", "VW Polo", "Skoda Octavia", "Haval Jolion"]), wheel_size: pick(["R15", "R16", "R16", "R17", "R18"]), typeKey: pick(["passenger", "passenger", "crossover", "jeep"]), consent: i % 3 ? { at: day0, source: "анкета" } : null }); r.client.createdAt = day0; });
    S.clients[0].wheel_size = "R16"; S.clients[0].typeKey = "passenger";
    // Напоминания о записи: у части клиентов выбран канал и есть согласие (вымышленные)
    S.clients.forEach((c, i) => { if (i % 4 !== 3) { SM.reminders.setClient(S, c, ["max", "telegram", "sms"][i % 3], i % 5 !== 4, "анкета"); if (c.notify.at) c.notify.at = day0; } });
    // Товары (вымышленные цены): продажа в чек со списанием
    [["Вентиль хромированный, компл. 4 шт", 400, 180, 60, 10], ["Колпачки на ниппель, металл, 4 шт", 300, 90, 50, 10], ["Секретки на колёса", 1500, 850, 12, 3], ["Щётки стеклоочистителя, пара", 900, 450, 14, 4], ["Незамерзайка 5 л", 450, 260, 40, 10], ["Герметик для шин (баллон)", 700, 380, 3, 4]]
      .forEach((x) => SM.products.add(S, { name: x[0], price: x[1], cost: x[2], qty: x[3], min: x[4] }));
    const SVC = [["r:Переобувка 4 колеса", 38, 1], ["r:Комплекс без смены резины", 9, 1], ["r:Снятие и установка 4-х колёс", 7, 1], ["r:Итого за 1 колесо", 9, 2], ["r:Балансировка", 9, 4], ["r:Монтаж", 3, 2], ["f:Ремонт жгутом", 8, 1], ["f:Ремонт грибком", 5, 1], ["f:Обработка герметиком", 4, 4], ["f:Подкачка", 4, 1], ["f:Утилизация б/у автошины", 2, 4], ["f:Проверка балансировки", 2, 4]];
    function makeSale(ts, sh) {
      at(ts);
      const cl = rnd() < 0.55 ? pick(S.clients) : null;
      const pl = cl ? cl.plate : rnd() < 0.85 ? plate() : null;
      const res = pl ? SM.orders.create(S, { plate: pl }, "Касса") : SM.orders.create(S, { queueNo: SM.queueAdd(S).no }, "Касса");
      const o = res.order;
      const typeKey = cl && cl.typeKey ? cl.typeKey : wpick([["passenger", 7], ["crossover", 2], ["jeep", 1]]);
      let radius = cl && cl.wheel_size ? cl.wheel_size : wpick([["R14", 1], ["R15", 3], ["R16", 4], ["R17", 3], ["R18", 2], ["R19", 1], ["R20", 0.5]]);
      if (!SM.prices.hasRadius(S.prices, typeKey, radius)) radius = "R16";
      const k = wpick(SVC.map((s) => [s, s[1]]));
      const tile = SM.prices.find(S.prices, k[0], typeKey, radius);
      SM.orders.addItem(S, o, tile, k[2] === 4 ? pick([1, 2, 4]) : k[2] === 2 ? pick([1, 2]) : 1, { radius, typeKey }, "Касса");
      if (rnd() < 0.1) SM.orders.addItem(S, o, SM.prices.find(S.prices, pick(["f:Обработка герметиком", "f:Утилизация б/у автошины", "f:Подкачка"]), typeKey, radius), pick([1, 4]), { radius, typeKey }, "Касса");
      if (rnd() < 0.06) { const pr = S.products[Math.floor(rnd() * 5)]; SM.products.addToOrder(S, o, pr.id, 1, "Касса"); }
      if (k[0] === "r:Переобувка 4 колеса" && rnd() < 0.4) SM.orders.addItem(S, o, SM.prices.find(S.prices, "gift", typeKey, radius), 4, {}, "Касса");
      if (rnd() < 0.07) o.runflat = true;
      o.masters = SM.shift.atWork(S, sh).slice();
      o.history = o.history.slice(0, 2);
      at(ts + 25 * 60e3);
      const r = SM.orders.pay(S, o, wpick([["cash", 6], ["card", 3], ["qr", 2]]), "Касса");
      return r;
    }
    S.drawer.balance = 5000;
    S.drawer.moves.push({ ts: day0, delta: 5000, type: "init", note: "Остаток на начало демо", balance: 5000 });
    let wd = 0;
    for (let d = day0; d < SM.dayStart(realNow); d += 864e5) {
      wd++;
      const dow = new Date(d).getDay();
      if (dow === 1 && rnd() < 0.6) continue; // выходной иногда
      const open = d + 9 * 36e5, close = d + 21 * 36e5;
      at(open);
      const second = wd % 2 ? "e2" : "e3";
      SM.shift.open(S, ["e1", second], "");
      const sh = SM.shift.current(S);
      const third = rnd() < 0.3 ? (second === "e2" ? "e3" : "e2") : null;
      const thirdIn = open + 3 * 36e5;
      const earlyOut = rnd() < 0.2 ? open + 6 * 36e5 : null; // ушёл раньше: < 8 ч
      const n = 6 + Math.floor(rnd() * 9);
      const times = []; for (let i = 0; i < n; i++) times.push(open + 30 * 60e3 + Math.floor(rnd() * 11 * 36e5)); times.sort((a, b) => a - b);
      let thirdDone = !third, earlyDone = !earlyOut;
      times.forEach((t) => {
        if (!thirdDone && t > thirdIn) { at(thirdIn); SM.shift.clockIn(S, third); thirdDone = true; }
        if (!earlyDone && t > earlyOut) { at(earlyOut); SM.shift.clockOut(S, second); earlyDone = true; }
        makeSale(t, sh);
      });
      at(close); SM.shift.close(S);
      if (wd % 7 === 0 && S.drawer.balance > 8000) { at(close + 60e3); SM.shift.collect(S, Math.round(S.drawer.balance - 5000), S.settings.pin, "демо"); }
      if (wd % 12 === 0) restock(d + 8 * 36e5, 0.55);
      // Грузики: коробку берут в работу целиком, когда предыдущая закончилась
      [["w1", 5], ["w2", 9]].forEach(([id, every]) => { if (wd % every === 0 && SM.warehouse.item(S, id).qty >= 1) { at(open + 10 * 60e3); SM.warehouse.writeOff(S, id, 1, "Взята в работу · Мастер 1"); } });
      if (wd % 9 === 0) { at(d + 13 * 36e5); SM.payroll.addAdjustment(S, { empId: pick(["e1", "e2", "e3"]), type: "advance", amount: pick([2000, 3000, 5000]), note: "демо" }); }
    }
    // Премия / штраф
    at(SM.dayStart(realNow) - 10 * 864e5 + 15 * 36e5); SM.payroll.addAdjustment(S, { empId: "e1", type: "bonus", amount: 3000, note: "за выход в выходной (демо)" });
    at(SM.dayStart(realNow) - 6 * 864e5 + 15 * 36e5); SM.payroll.addAdjustment(S, { empId: "e3", type: "fine", amount: 500, note: "опоздание (демо)" });
    // Расходы
    const mk0 = SM.monthKey(day0);
    S.expenses.recurring.push({ id: "rx1", name: "Аренда бокса", category: "Аренда", amount: 60000, day: 5, startMonth: mk0, endMonth: null, createdAt: day0 });
    S.expenses.recurring.push({ id: "rx2", name: "Интернет и связь", category: "Связь", amount: 1500, day: 10, startMonth: mk0, endMonth: null, createdAt: day0 });
    S.expenses.recurring.push({ id: "rx3", name: "Электричество", category: "Коммуналка", amount: 7000, day: 20, startMonth: mk0, endMonth: null, createdAt: day0 });
    [[3, "Перчатки, ветошь", "Хозяйство", 1800], [11, "Реклама на картах", "Реклама", 4000], [19, "Ремонт компрессора", "Прочее", 6500], [33, "Перчатки, ветошь", "Хозяйство", 1500], [40, "Листовки", "Реклама", 2500], [55, "Хим. средства", "Хозяйство", 2200]].forEach((x) => S.expenses.oneoff.push({ id: SM.uid("ox"), ts: day0 + x[0] * 864e5 + 12 * 36e5, name: x[1], category: x[2], amount: x[3] }));
    // Хранение
    const today = SM.dayStart(realNow);
    const stor = [[0, -170, -5, null, "R16", "205/55 R16", "Nokian", false, "лето", "А-1-1"], [3, -160, 7, null, "R17", "225/45 R17", "Michelin", true, "лето", "А-1-2"], [5, -40, 140, null, "R18", "235/55 R18", "Pirelli", true, "зима", "А-2-1"], [7, -30, 150, null, "R16", "215/60 R16", "Cordiant", false, "лето", "Б-1-1"], [9, -20, 160, null, "R17", "215/55 R17", "Hankook", false, "лето", "Б-1-2"], [11, -12, 170, null, "R15", "195/65 R15", "Viatti", false, "лето", "Б-2-1"]];
    stor.forEach((x) => {
      const c = S.clients[x[0]]; const ts = Math.max(day0 + 9 * 36e5, today + x[1] * 864e5 + 11 * 36e5);
      at(ts);
      const sh = SM.shift.current(S);
      const r = SM.storage.create(S, { clientId: c.id, plate: c.plate, phone: c.phone, name: c.name, qty: 4, size: x[5], brand: x[6], rims: x[7], season: x[8], condition: "хорошее", place: x[9], from: ts, until: today + x[2] * 864e5, months: 6, payNow: null, radius: x[4] }, "Касса");
      r.rec.ts = today + x[1] * 864e5; r.rec.from = r.rec.ts;
      if (sh && r.rec.price) SM.storage.pay(S, r.rec, "card"); else { r.rec.paid = true; r.rec.payment = "card"; r.rec.paidAt = ts; }
    });
    restock(today - 864e5 + 8 * 36e5, 0.3);
    // Сегодня: открытая смена
    const now = realNow;
    const start = now - today >= 11 * 36e5 ? today + 9 * 36e5 : now - 2 * 36e5;
    at(start); SM.shift.open(S, ["e1"], "");
    const cur = SM.shift.current(S);
    const j = start + Math.round((now - start) / 3); at(j); SM.shift.clockIn(S, "e2", S.drawer.balance);
    const span = now - start - 20 * 60e3;
    [0.15, 0.35, 0.55, 0.75].forEach((f) => makeSale(start + span * f, cur));
    // Склад: две позиции ниже минимума
    at(now - 30 * 60e3);
    [["w5", 0.5], ["w6", 0.6]].forEach(([id, k]) => { const it = SM.warehouse.item(S, id); const need = it.qty - Math.round(it.min * k); if (need > 0) SM.warehouse.writeOff(S, id, need, "Брак / на нужды (демо)"); });
    // Машины в работе
    at(now - 40 * 60e3);
    const o1 = SM.orders.create(S, { plate: S.clients[0].plate }, "Мастер 1").order;
    SM.orders.addItem(S, o1, SM.prices.find(S.prices, "r:Переобувка 4 колеса", "passenger", "R16"), 1, { radius: "R16", typeKey: "passenger" }, "Мастер 1");
    SM.orders.setStatus(S, o1, "work", "Мастер 1");
    at(now - 25 * 60e3);
    const o2 = SM.orders.create(S, { plate: "М456ОР750" }, "Мастер 2").order;
    SM.orders.addItem(S, o2, SM.prices.find(S.prices, "f:Ремонт жгутом", "passenger", "R16"), 1, {}, "Мастер 2");
    SM.orders.setStatus(S, o2, "work", "Мастер 2"); at(now - 5 * 60e3); SM.orders.setStatus(S, o2, "ready", "Мастер 2");
    // Живая очередь (талоны с планшета, нумерация сегодня с 1)
    S.queue.items.forEach((q) => (q.status = "done"));
    at(now - 15 * 60e3); SM.live.take(S, plate()); at(now - 6 * 60e3); SM.live.take(S, plate());
    // Покраска дисков: два наряда (один ещё красится, один готов к выдаче) — оплата при выдаче
    at(today - 6 * 864e5 + 12 * 36e5);
    const pn1 = SM.paint.create(S, { plate: S.clients[4].plate, phone: S.clients[4].phone, name: S.clients[4].name, car: S.clients[4].car, radius: "R17", disks: 4, color: "чёрный матовый", caps: true, tires: true, tireBrand: "Nokian Hakkapeliitta", straighten: { qty: 1, sum: 1500 }, paintPrice: 16000, services: [{ key: "r:Переобувка 4 колеса", qty: 1, typeKey: "passenger", radius: "R17" }], comment: "демо" }, "Мастер 1").order;
    at(today - 1 * 864e5 + 17 * 36e5); SM.paint.setReady(S, pn1, "Мастер 1");
    at(today - 2 * 864e5 + 11 * 36e5);
    SM.paint.create(S, { plate: S.clients[10].plate, phone: S.clients[10].phone, name: S.clients[10].name, radius: "R16", disks: 4, color: "серебро", caps: false, tires: false, straighten: null, paintPrice: 14000, services: [], comment: "демо" }, "Мастер 2");
    // Записи
    at(now - 864e5);
    const tk = SM.dayKey(now), tm = SM.dayKey(now + 864e5);
    const freeSlots = SM.booking.slots(S, tk, now).filter((s) => !s.past);
    const mk = (date, time, dir, c, comment) => S.bookings.push({ id: SM.uid("bk"), ts: SM.now(), date, time, direction: dir, name: c.name, phone: c.phone, plate: c.plate, comment: comment || "", consentAt: SM.now(), clientId: c.id, status: "new", orderId: null });
    if (freeSlots[0]) mk(tk, freeSlots[0].time, "tire", S.clients[5], "переобуть на зиму, шины у вас на хранении");
    if (freeSlots[2]) mk(tk, freeSlots[2].time, "balance", S.clients[2]);
    mk(tm, "10:00", "tire", S.clients[3], "");
    mk(tm, "12:00", "repair", S.clients[8], "прокол");
    mk(tm, "15:00", "storage", S.clients[12], "сдать летние");
    // Напоминания, которые уже должны были уйти к этому моменту (имитация)
    S.bookings.map((b) => SM.reminders.visitTs(b)).flatMap((v) => [v - 24 * 36e5, v - 2 * 36e5]).filter((t) => t <= now && t > now - 864e5).sort((a, b) => a - b).forEach((t) => { at(t); SM.reminders.run(S, t); });
    SM.clock.fixed = null;
    S.ui.operator = "e1";
    return S;
  };
})(typeof window !== "undefined" ? window : globalThis);
