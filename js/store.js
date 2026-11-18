/* Хранилище демо-данных: один объект состояния в localStorage. */
(function (root) {
  const SM = root.SM;
  const KEY = "shinamashina_web_demo_v1";
  const listeners = [];
  SM.STATE_VERSION = 2; // 2: тариф хранения, грузики коробками — старые демо-данные пересоздаются
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
    pinIdleMin: 3
  };
  SM.emptyState = function () {
    return {
      version: SM.STATE_VERSION,
      createdAt: SM.now(),
      settings: JSON.parse(JSON.stringify(SM.DEFAULT_SETTINGS)), // глубокая копия: тариф хранения — вложенный объект
      prices: JSON.parse(JSON.stringify(root.PRICES)),
      employees: [],
      clients: [],
      orders: [],
      orderSeq: 0,
      receipts: [],
      receiptSeq: 0,
      shifts: [],
      drawer: { balance: 0, moves: [] },
      collections: [],
      queue: { seq: 0, items: [] },
      storage: [],
      storageSeq: 0,
      bookings: [],
      payroll: { adjustments: [], payments: [] },
      expenses: { recurring: [], oneoff: [], categories: ["Аренда", "Коммуналка", "Расходники", "Хозяйство", "Реклама", "Связь", "Прочее"] },
      warehouse: { items: [], norms: [], moves: [], docs: [] },
      ui: { operator: null, radius: "R16", type: "passenger", activeOrderId: null }
    };
  };
  let cache = null;
  SM.load = function () {
    if (cache) return cache;
    if (typeof localStorage === "undefined") { cache = SM.emptyState(); return cache; }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const st = JSON.parse(raw); if ((st.version || 1) >= SM.STATE_VERSION) { cache = st; cache.settings = Object.assign(JSON.parse(JSON.stringify(SM.DEFAULT_SETTINGS)), cache.settings || {}); return cache; } }
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
  SM.resetDemo = function () { if (typeof localStorage !== "undefined") localStorage.removeItem(KEY); cache = null; return SM.load(); };
  SM.setState = function (s) { cache = s; };
  SM.STORE_KEY = KEY;
  // Подхват изменений из других вкладок (book.html / client.html -> касса)
  if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { cache = null; SM.load(); listeners.forEach((f) => { try { f(true); } catch (_) {} }); } });
  SM.emp = function (S, id) { return S.employees.find((e) => e.id === id) || null; };
  SM.empName = function (S, id) { const e = SM.emp(S, id); return e ? e.name : "?"; };
  SM.client = function (S, id) { return S.clients.find((c) => c.id === id) || null; };
  SM.clientByPlate = function (S, plate) { const p = SM.normPlate(plate); return p ? S.clients.find((c) => SM.normPlate(c.plate) === p) || null : null; };
  SM.clientByPhone = function (S, phone) { const p = SM.normPhone(phone); return p.length === 11 ? S.clients.find((c) => SM.normPhone(c.phone) === p) || null : null; };
  SM.addClient = function (S, data) {
    const dup = (data.phone && SM.clientByPhone(S, data.phone)) || (data.plate && SM.clientByPlate(S, data.plate));
    if (dup && !data.force) return { ok: false, dup: dup, msg: "Такой клиент уже есть: " + (dup.name || SM.phoneShow(dup.phone)) };
    const c = { id: SM.uid("c"), name: (data.name || "").trim(), phone: SM.normPhone(data.phone), plate: SM.normPlate(data.plate), car: data.car || "", wheel_size: data.wheel_size || "", typeKey: data.typeKey || "", consent: data.consent || null, createdAt: SM.now(), source: data.source || "касса" };
    S.clients.push(c);
    return { ok: true, client: c };
  };
  SM.clientVisits = function (S, cid) { return S.receipts.filter((r) => r.clientId === cid && r.kind === "service").sort((a, b) => b.ts - a.ts); };
})(typeof window !== "undefined" ? window : globalThis);
