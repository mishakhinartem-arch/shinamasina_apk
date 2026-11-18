/* Зарплата: личный % мастера / число мастеров на смене в каждом периоде, округление до 50 ₽,
   минимум 4 000 ₽ только при ≥ 8 ч по отметкам. Аванс/премия/штраф — в расчётном листе. */
(function (root) {
  const SM = root.SM;
  const Pay = (SM.payroll = {});
  Pay.hours = function (shift, empId, now) {
    const end = shift.endedAt || now || SM.now();
    let ms = 0;
    (shift.att || []).forEach((a) => { if (a.empId === empId) ms += Math.max(0, (a.out || end) - a.in); });
    return ms / 36e5;
  };
  /**
   * Периодный расчёт (как calc_period_payroll в рабочей кассе): события = начало смены, приходы/уходы, конец.
   * В каждом периоде выручка периода × (% мастера / N) / 100, где N — кто на смене.
   * @param shift {startedAt, endedAt, att:[{empId,in,out}]}
   * @param ledger [{ts, delta}] — выручка смены (услуги)
   */
  Pay.calcShift = function (shift, ledger, employees, settings, now) {
    settings = settings || SM.DEFAULT_SETTINGS;
    now = now || SM.now();
    const end = shift.endedAt || now;
    const att = shift.att || [];
    const ev = new Set([shift.startedAt, end]);
    att.forEach((a) => { ev.add(a.in); if (a.out) ev.add(a.out); });
    const times = Array.from(ev).filter((t) => t >= shift.startedAt && t <= end).sort((a, b) => a - b);
    const raw = {}; const ids = [];
    att.forEach((a) => { if (ids.indexOf(a.empId) < 0) ids.push(a.empId); raw[a.empId] = 0; });
    const emp = (id) => employees.find((e) => e.id === id) || { id, name: "?", percent: 0 };
    for (let i = 0; i < times.length - 1; i++) {
      const t0 = times[i], t1 = times[i + 1]; if (t1 <= t0) continue;
      const present = [];
      att.forEach((a) => { if (a.in <= t0 && (!a.out || a.out > t0) && present.indexOf(a.empId) < 0) present.push(a.empId); });
      const last = i === times.length - 2;
      let cash = 0;
      ledger.forEach((l) => { if (l.ts >= t0 && (last ? l.ts <= t1 : l.ts < t1)) cash += l.delta; });
      if (!present.length || !cash) continue;
      present.forEach((id) => { raw[id] += (cash * (Math.max(0, emp(id).percent) / present.length)) / 100; });
    }
    const minPay = settings.minPay || 4000, minH = settings.minPayHours || 8;
    return ids.map((id) => {
      const e = emp(id), h = Pay.hours(shift, id, now), r = SM.round2(raw[id] || 0), rounded = SM.round50(r);
      const eligible = h >= minH - 1e-9;
      const pay = eligible ? Math.max(rounded, minPay) : rounded;
      const atWork = att.some((a) => a.empId === id && !a.out) && !shift.endedAt;
      return { empId: id, name: e.name, percent: e.percent, hours: h, raw: r, rounded, minEligible: eligible, minApplied: eligible && rounded < minPay, hoursTo8: Math.max(0, minH - h), pay, atWork };
    });
  };
  Pay.ledgerFor = function (S, shiftId) { return S.receipts.filter((r) => r.shiftId === shiftId && r.kind === "service").map((r) => ({ ts: r.ts, delta: SM.cart.serviceAmount(r) })); }; // хранение не входит в базу процента
  Pay.forShift = function (S, shift, now) { return Pay.calcShift(shift, Pay.ledgerFor(S, shift.id), S.employees, S.settings, now); };

  /* Аванс / премия / штраф */
  Pay.addAdjustment = function (S, a) {
    const amount = Math.round(Number(a.amount) || 0);
    if (!(amount > 0)) return { ok: false, msg: "Сумма должна быть больше 0" };
    if (["advance", "bonus", "fine"].indexOf(a.type) < 0) return { ok: false, msg: "Неизвестный тип" };
    const rec = { id: SM.uid("adj"), empId: a.empId, type: a.type, amount, ts: a.ts || SM.now(), note: a.note || "", fromDrawer: !!a.fromDrawer };
    S.payroll.adjustments.push(rec);
    if (rec.type === "advance" && rec.fromDrawer) SM.shift.drawerMove(S, -amount, "advance", "Аванс: " + SM.empName(S, a.empId));
    return { ok: true, rec };
  };
  Pay.TYPE_RU = { advance: "Аванс", bonus: "Премия", fine: "Штраф" };
  /** Выплата за день: один день нельзя оплатить дважды. */
  Pay.isDayPaid = (S, empId, day) => S.payroll.payments.some((p) => p.empId === empId && p.day === day && p.kind === "shift" && p.amount > 0);
  Pay.payDay = function (S, p) {
    if (Pay.isDayPaid(S, p.empId, p.day)) return { ok: false, msg: SM.empName(S, p.empId) + ": день " + SM.fmtDay(p.day) + " уже оплачен. Дважды один день оплатить нельзя." };
    const rec = Object.assign({ id: SM.uid("pay"), ts: SM.now(), kind: "shift" }, p);
    S.payroll.payments.push(rec);
    return { ok: true, rec };
  };
  Pay.payDebt = function (S, empId, amount, fromDrawer) {
    amount = Math.round(Number(amount) || 0);
    if (!(amount > 0)) return { ok: false, msg: "Сумма должна быть больше 0" };
    S.payroll.payments.push({ id: SM.uid("pay"), ts: SM.now(), kind: "debt", empId, amount, day: SM.dayKey(SM.now()) });
    if (fromDrawer) SM.shift.drawerMove(S, -amount, "debt", "Выплата долга: " + SM.empName(S, empId));
    return { ok: true };
  };
  /** Расчётный лист за период [from, to). */
  Pay.payslip = function (S, empId, from, to) {
    const shifts = [];
    S.shifts.forEach((sh) => {
      if (!sh.endedAt || sh.startedAt < from || sh.startedAt >= to) return;
      const row = (sh.payroll || []).find((r) => r.empId === empId); if (!row) return;
      shifts.push({ shiftId: sh.id, day: SM.dayKey(sh.startedAt), hours: row.hours, raw: row.raw, pay: row.pay, minApplied: row.minApplied, paid: row.paid || 0 });
    });
    const adj = S.payroll.adjustments.filter((a) => a.empId === empId && a.ts >= from && a.ts < to).sort((a, b) => a.ts - b.ts);
    const pays = S.payroll.payments.filter((p) => p.empId === empId && p.ts >= from && p.ts < to);
    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
    const accruedShifts = sum(shifts, (s) => s.pay);
    const bonus = sum(adj.filter((a) => a.type === "bonus"), (a) => a.amount);
    const fine = sum(adj.filter((a) => a.type === "fine"), (a) => a.amount);
    const advance = sum(adj.filter((a) => a.type === "advance"), (a) => a.amount);
    const paidShift = sum(pays, (p) => p.amount);
    const accrued = accruedShifts + bonus - fine;
    const paid = paidShift + advance;
    return { empId, name: SM.empName(S, empId), from, to, shifts, adjustments: adj, payments: pays, hours: sum(shifts, (s) => s.hours), accruedShifts, bonus, fine, advance, paidShift, accrued, paid, debt: accrued - paid };
  };
})(typeof window !== "undefined" ? window : globalThis);
