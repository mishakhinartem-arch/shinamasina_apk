/* Онлайн-запись: слоты по часам работы, запись клиента, приём машины в кассе. */
(function (root) {
  const SM = root.SM;
  const B = (SM.booking = {});
  B.DIRECTIONS = [ { key: "tire", label: "Шиномонтаж / переобувка" }, { key: "balance", label: "Балансировка" }, { key: "repair", label: "Ремонт шины / прокола" }, { key: "storage", label: "Хранение шин (сдать / забрать)" } ];
  B.dirLabel = (k) => (B.DIRECTIONS.find((d) => d.key === k) || { label: k }).label;
  const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
  B.slots = function (S, dayKey, now) {
    now = now || SM.now();
    const st = S.settings, out = [];
    const a = toMin(st.workStart), b = toMin(st.workEnd), step = Math.max(15, Number(st.slotMin) || 60);
    for (let m = a; m + step <= b; m += step) {
      const time = SM.pad(Math.floor(m / 60)) + ":" + SM.pad(m % 60);
      const [y, mo, d] = dayKey.split("-").map(Number);
      const ts = new Date(y, mo - 1, d, Math.floor(m / 60), m % 60).getTime();
      const taken = S.bookings.filter((x) => x.date === dayKey && x.time === time && x.status !== "cancel").length;
      out.push({ time, ts, taken, free: Math.max(0, (st.slotCapacity || 1) - taken), past: ts < now + 30 * 60e3 });
    }
    return out;
  };
  B.create = function (S, d) {
    if (!d.consent) return { ok: false, msg: "Нужно согласие на обработку персональных данных" };
    if (!d.name || !d.name.trim()) return { ok: false, msg: "Укажите имя" };
    if (SM.normPhone(d.phone).length !== 11) return { ok: false, msg: "Укажите телефон полностью" };
    if (!d.direction) return { ok: false, msg: "Выберите услугу" };
    const slot = B.slots(S, d.date).find((s) => s.time === d.time);
    if (!slot || slot.past || slot.free <= 0) return { ok: false, msg: "Это время уже занято, выберите другое" };
    const plate = SM.normPlate(d.plate || "");
    let client = (plate && SM.clientByPlate(S, plate)) || SM.clientByPhone(S, d.phone);
    if (!client) { const r = SM.addClient(S, { name: d.name, phone: d.phone, plate, consent: { at: SM.now(), source: "онлайн-запись" }, source: "онлайн-запись" }); client = r.client; }
    else if (!client.consent) client.consent = { at: SM.now(), source: "онлайн-запись" };
    const b = { id: SM.uid("bk"), ts: SM.now(), date: d.date, time: d.time, direction: d.direction, name: d.name.trim(), phone: SM.normPhone(d.phone), plate, comment: d.comment || "", consentAt: SM.now(), clientId: client ? client.id : null, status: "new", orderId: null };
    S.bookings.push(b);
    return { ok: true, booking: b };
  };
  B.needsStorage = (S, b) => SM.storage.activeForClient(S, b.clientId, b.plate).length > 0;
  B.forDay = (S, dayKey) => S.bookings.filter((b) => b.date === dayKey && b.status !== "cancel").sort((a, b) => a.time.localeCompare(b.time));
  /** «Принять машину» по записи — создаёт заказ. */
  B.accept = function (S, b, who) {
    if (!b.plate && !b.phone) return { ok: false, msg: "В записи нет госномера" };
    let res;
    if (b.plate) res = SM.orders.create(S, { plate: b.plate, bookingId: b.id, note: "Онлайн-запись " + b.time + ": " + B.dirLabel(b.direction) }, who);
    else { const q = SM.queueAdd(S, "запись"); res = SM.orders.create(S, { queueNo: q.no, bookingId: b.id, note: "Онлайн-запись " + b.time }, who); }
    if (!res.ok) return res;
    if (!res.order.clientId && b.clientId) SM.orders.attachClient(S, res.order, SM.client(S, b.clientId), who);
    b.status = "accepted"; b.orderId = res.order.id;
    return res;
  };
  /* Очередь с улицы (демо). */
  SM.queueAdd = function (S, source) { const it = { no: ++S.queue.seq, ts: SM.now(), status: "wait", source: source || "улица" }; S.queue.items.push(it); return it; };
  SM.queueNext = function (S) { const w = S.queue.items.filter((x) => x.status === "wait").sort((a, b) => a.no - b.no)[0]; if (!w) return null; w.status = "called"; w.calledAt = SM.now(); return w; };
})(typeof window !== "undefined" ? window : globalThis);
