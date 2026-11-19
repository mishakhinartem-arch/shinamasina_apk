/* Хранилище демо-данных: один объект состояния в localStorage. */
(function (root) {
  const SM = root.SM;
  const KEY = "shinamashina_web_demo_v1";
  const listeners = [];
  SM.STATE_VERSION = 5; // 2: тариф хранения, грузики коробками; 3: товары, покраска, напоминания, живая очередь; 4: несколько машин у клиента, история карточки, Газель 6 колёс; 5: позиции ремонта на складе и нормы, справочник поставщиков (v3/v4 мигрируются, старше — пересоздаются)
  SM.DEFAULT_SETTINGS = {
    pin: "1234",
    discountMaxPct: 15,          // 0 = без ограничений
    discountMaxRub: 1000,        // 0 = без ограничений; ₽ пересчитываются в % от заказа
    loyaltyPct: 10,
    surchargePct: 20,
    minPay: 4000,
    minPayHours: 8,
    workStart: "09:00",
    workEnd: "21:00",
    slotMin: 60,
    slotCapacity: 2,
    bookingDays: 14,
    storageWarnDays: 14,
    // Тариф хранения (ДЕМО-ЗНАЧЕНИЯ, ПРИМЕРНЫЕ — владелец меняет в админке): ₽ за комплект 4 шины за сезон
    storageTariff: { R13: 3000, R14: 3000, R15: 3200, R16: 3500, R17: 3800, R18: 4200, R19: 4600, R20: 5000, R21: 5500, R22: 6000 },
    storageSeasonMonths: 6,      // тариф указан за столько месяцев; другой срок — пропорционально
    storageRimsExtra: 500,       // доплата за комплект с дисками (колёса), ₽ за сезон
    pinIdleMin: 3,
    // Сезон: 3 поста — 2 под онлайн-запись, остальные под живую очередь (талоны с планшета)
    seasonMode: true,
    posts: 3,
    bookingPosts: 2,
    avgServiceMin: 40,           // (старое поле) = «Полный шиномонтаж», оставлено для совместимости
    // Среднее время (владелец меняет в админке), мин — для ожидания живой очереди и «успеем до записи»
    durFull: 40,                 // Полный шиномонтаж (снять, перебортировать, отбалансировать, поставить)
    durWheels: 25,               // Переобувка колёс на дисках (снять/поставить + балансировка)
    durMount: 15,                // Снять/поставить
    bookRepair: false,           // онлайн-запись на ремонт (по умолчанию — только переобувка)
    // Сетевой принтер талонов (ESC/POS по TCP; печатает только APK)
    printerIp: "",
    printerPort: 9100,
    // Напоминания о записи (в демо — имитация отправки)
    remindersOn: true,
    remind24: true,
    remind2: true
  };
  SM.emptyState = function () {
    return {
      version: SM.STATE_VERSION,
      createdAt: SM.now(),
      settings: JSON.parse(JSON.stringify(SM.DEFAULT_SETTINGS)), // глубокая копия: тариф хранения — вложенный объект
      prices: Object.assign(JSON.parse(JSON.stringify(root.PRICES)), { custom: [], hidden: [] }),
      employees: [],
      clients: [],
      orders: [],
      orderSeq: 0,
      receipts: [],
      receiptSeq: 0,
      shifts: [],
      drawer: { balance: 0, moves: [] },
      collections: [],
      queue: { seq: 0, items: [] },     // талоны: нумерация каждый день с 1 (по полю day)
      products: [],                     // товары: цена продажи, закупка, остаток
      productMoves: [],
      paint: [],                        // заказ-наряды покраски дисков (оплата при выдаче)
      paintSeq: 0,
      reminders: { log: [] },           // журнал напоминаний о записи
      storage: [],
      storageSeq: 0,
      bookings: [],
      payroll: { adjustments: [], payments: [] },
      expenses: { recurring: [], oneoff: [], categories: ["Аренда", "Коммуналка", "Расходники", "Хозяйство", "Реклама", "Связь", "Прочее"] },
      warehouse: { items: [], norms: [], moves: [], docs: [], suppliers: [] },
      ui: { operator: null, radius: "R16", type: "passenger", activeOrderId: null }
    };
  };
  let cache = null;
  SM.load = function () {
    if (cache) return cache;
    if (typeof localStorage === "undefined") { cache = SM.emptyState(); return cache; }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { let st = JSON.parse(raw); const v0 = st.version; if (st.version === 3 && SM.clients) st = SM.clients.migrateV3(st); if (st.version === 4 && SM.warehouse) st = SM.warehouse.migrateRepairStock(st); if ((st.version || 1) >= SM.STATE_VERSION) { cache = st; cache.settings = Object.assign(JSON.parse(JSON.stringify(SM.DEFAULT_SETTINGS)), cache.settings || {}); if (v0 !== st.version) SM.save(); return cache; } }
    } catch (e) { console.warn("bad state", e); }
    cache = SM.seed ? SM.seed() : SM.emptyState();
    SM.save();
    return cache;
  };
  SM.save = function () {
    if (typeof localStorage === "undefined" || !cache) return;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { console.warn(e); }
    listeners.forEach((f) => { try { f(); } catch (_) {} });
  };
  SM.onSave = function (f) { listeners.push(f); };
  SM.reload = function () { cache = null; return SM.load(); };
  SM.resetDemo = function () { if (typeof localStorage !== "undefined") localStorage.removeItem(KEY); if (SM.photos) SM.photos.clear(); cache = null; return SM.load(); };
  SM.setState = function (s) { cache = s; };
  SM.STORE_KEY = KEY;
  // Подхват изменений из других вкладок (book.html / client.html -> касса)
  if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { cache = null; SM.load(); listeners.forEach((f) => { try { f(true); } catch (_) {} }); } });
  SM.emp = function (S, id) { return S.employees.find((e) => e.id === id) || null; };
  SM.empName = function (S, id) { const e = SM.emp(S, id); return e ? e.name : "?"; };
  SM.client = function (S, id) { return S.clients.find((c) => c.id === id) || null; };
  /** Клиент по госномеру любой из его машин. */
  SM.clientByPlate = function (S, plate) { const f = SM.clients.findByPlate(S, plate); return f ? f.client : null; };
  SM.clientByPhone = function (S, phone) { const p = SM.normPhone(phone); return p.length === 11 ? S.clients.find((c) => SM.normPhone(c.phone) === p) || null : null; };
  /** Пустое поле телефона с «+7» — это «нет телефона». */
  SM.phoneVal = function (raw) { return String(raw || "").replace(/\D/g, "").length <= 1 ? "" : String(raw); };
  SM.addClient = function (S, data) {
    const phone = SM.phoneVal(data.phone);
    const dup = (phone && SM.clientByPhone(S, phone)) || (data.plate && SM.clientByPlate(S, data.plate));
    if (dup && !data.force) return { ok: false, dup: dup, msg: "Такой клиент уже есть: " + (dup.name || SM.phoneShow(dup.phone)) };
    const cars = data.cars ? data.cars.map(SM.clients.newCar) : data.plate || data.car || data.wheel_size ? [SM.clients.newCar({ plate: data.plate, car: data.car, wheel_size: data.wheel_size, typeKey: data.typeKey, pFront: data.pFront, pRear: data.pRear })] : [];
    const c = { id: SM.uid("c"), name: (data.name || "").trim(), phone: SM.normPhone(phone), cars, plate: "", car: "", wheel_size: "", typeKey: "", consent: data.consent || null, notify: data.notify || null, createdAt: SM.now(), source: data.source || "касса", history: [] };
    SM.clients.syncPrimary(c);
    S.clients.push(c);
    return { ok: true, client: c };
  };
  SM.clientVisits = function (S, cid) { return S.receipts.filter((r) => r.clientId === cid && r.kind === "service").sort((a, b) => b.ts - a.ts); };
})(typeof window !== "undefined" ? window : globalThis);
