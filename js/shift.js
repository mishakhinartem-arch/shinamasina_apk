/* Смена: открытие, приход/уход, денежный ящик, закрытие с автовычетом ЗП, инкассация. */
(function (root) {
  const SM = root.SM;
  const Sh = (SM.shift = {});
  Sh.current = (S) => S.shifts.find((s) => !s.endedAt) || null;
  Sh.atWork = (S, sh) => { sh = sh || Sh.current(S); if (!sh) return []; return sh.att.filter((a) => !a.out).map((a) => a.empId); };
  Sh.drawerMove = function (S, delta, type, note, ts) {
    S.drawer.balance = SM.round2(S.drawer.balance + delta);
    S.drawer.moves.push({ ts: ts || SM.now(), delta: SM.round2(delta), type, note: note || "", balance: S.drawer.balance });
  };
  /** Открыть смену. fact — пересчитанная наличность (поле «Факт» вводится вручную, по умолчанию пустое). */
  Sh.open = function (S, empIds, fact) {
    if (Sh.current(S)) return { ok: false, msg: "Смена уже открыта" };
    if (!empIds || !empIds.length) return { ok: false, msg: "Выберите хотя бы одного мастера" };
    const now = SM.now();
    const sh = { id: SM.uid("sh"), no: S.shifts.length + 1, startedAt: now, endedAt: null, att: empIds.map((id) => ({ empId: id, in: now, out: null })), cashChecks: [] };
    if (fact !== undefined && fact !== null && fact !== "") Sh.recordCashCheck(S, sh, empIds[0], Number(fact));
    S.shifts.push(sh);
    return { ok: true, shift: sh };
  };
  Sh.recordCashCheck = function (S, sh, empId, fact) {
    const expected = S.drawer.balance;
    const diff = SM.round2(fact - expected);
    sh.cashChecks = sh.cashChecks || [];
    sh.cashChecks.push({ ts: SM.now(), empId, expected, fact, diff });
    if (diff !== 0) Sh.drawerMove(S, diff, "recount", "Пересчёт при приходе: " + (diff > 0 ? "излишек" : "недостача"));
    return { expected, fact, diff };
  };
  Sh.clockIn = function (S, empId, fact) {
    const sh = Sh.current(S); if (!sh) return { ok: false, msg: "Смена не открыта" };
    if (Sh.atWork(S, sh).indexOf(empId) >= 0) return { ok: false, msg: "Уже на смене" };
    sh.att.push({ empId, in: SM.now(), out: null });
    let check = null;
    if (fact !== undefined && fact !== null && fact !== "") check = Sh.recordCashCheck(S, sh, empId, Number(fact));
    return { ok: true, check };
  };
  /** «Ушёл»: закрыть отметку и вернуть расчёт этого мастера. */
  Sh.clockOut = function (S, empId) {
    const sh = Sh.current(S); if (!sh) return { ok: false, msg: "Смена не открыта" };
    const a = sh.att.find((x) => x.empId === empId && !x.out); if (!a) return { ok: false, msg: "Мастер не на смене" };
    a.out = SM.now();
    const row = SM.payroll.forShift(S, sh).find((r) => r.empId === empId);
    return { ok: true, row };
  };
  Sh.revenue = function (S, shiftId) {
    const r = { total: 0, cash: 0, card: 0, qr: 0, cashless: 0, count: 0, storage: 0 };
    S.receipts.forEach((x) => { if (x.shiftId !== shiftId) return; r.total += x.total; r[x.payment] += x.total; if (x.kind === "service") r.count++; r.storage += SM.cart.storageAmount(x); });
    r.cashless = r.card + r.qr; return r;
  };
  Sh.preview = function (S) { const sh = Sh.current(S); return sh ? SM.payroll.forShift(S, sh) : []; };
  /** Закрыть смену: ЗП вычитается из налички ящика; не хватает — выдаём сколько есть, остальное в долг. */
  Sh.close = function (S) {
    const sh = Sh.current(S); if (!sh) return { ok: false, msg: "Смена не открыта" };
    const now = SM.now();
    sh.att.forEach((a) => { if (!a.out) a.out = now; });
    sh.endedAt = now;
    const rows = SM.payroll.forShift(S, sh, now);
    const day = SM.dayKey(sh.startedAt);
    const drawerBefore = S.drawer.balance;
    let remaining = Math.max(0, drawerBefore);
    let paidTotal = 0, debtTotal = 0; const notes = [];
    rows.forEach((r) => {
      let paid = 0;
      if (SM.payroll.isDayPaid(S, r.empId, day)) { notes.push(r.name + ": день уже оплачен — сумма ушла в долг"); }
      else { paid = Math.min(r.pay, remaining); remaining -= paid; if (paid > 0) SM.payroll.payDay(S, { empId: r.empId, day, shiftId: sh.id, amount: paid, due: r.pay }); }
      r.paid = paid; r.debt = r.pay - paid; paidTotal += paid; debtTotal += r.debt;
    });
    if (paidTotal > 0) Sh.drawerMove(S, -paidTotal, "payroll", "ЗП за смену №" + sh.no, now);
    const rev = Sh.revenue(S, sh.id);
    sh.payroll = rows;
    sh.summary = { revenue: rev, payTotal: rows.reduce((s, r) => s + r.pay, 0), paidTotal, debtTotal, drawerBefore, drawerAfter: S.drawer.balance, notes, shortfall: debtTotal > 0 };
    return { ok: true, shift: sh, rows, summary: sh.summary };
  };
  /** Инкассация — только по PIN владельца. */
  Sh.collect = function (S, amount, pin, note) {
    if (pin !== S.settings.pin) return { ok: false, msg: "Неверный PIN владельца" };
    amount = Math.round(Number(amount) || 0);
    if (!(amount > 0)) return { ok: false, msg: "Введите сумму" };
    if (amount > S.drawer.balance) return { ok: false, msg: "В ящике только " + SM.fmt(S.drawer.balance) };
    Sh.drawerMove(S, -amount, "collect", "Инкассация" + (note ? ": " + note : ""));
    S.collections.push({ id: SM.uid("col"), ts: SM.now(), amount, note: note || "", after: S.drawer.balance });
    return { ok: true };
  };
})(typeof window !== "undefined" ? window : globalThis);
