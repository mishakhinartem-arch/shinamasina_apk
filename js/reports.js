/* Расходы (постоянные и разовые) и отчёты: выручка, ЗП, расходы, себестоимость расходников, чистая прибыль. */
(function (root) {
  const SM = root.SM;
  const R = (SM.reports = {});
  const E = (SM.expenses = {});
  /** Постоянный расход. Если число месяца уже прошло — по умолчанию учитывается со следующего месяца (баг Постового исправлен);
      fromThisMonth = true — учесть и в текущем месяце. */
  E.addRecurring = function (S, d, fromThisMonth) {
    const amount = Math.round(Number(d.amount) || 0), day = Math.min(28, Math.max(1, Number(d.day) || 1));
    if (!(amount > 0)) return { ok: false, msg: "Сумма должна быть больше 0" };
    if (!d.name) return { ok: false, msg: "Укажите название" };
    const now = SM.now(), mk = SM.monthKey(now), today = new Date(now).getDate();
    const startMonth = fromThisMonth || day >= today ? mk : SM.monthAdd(mk, 1);
    const rec = { id: SM.uid("rx"), name: d.name, category: d.category || "Прочее", amount, day, startMonth, endMonth: null, createdAt: now };
    S.expenses.recurring.push(rec);
    return { ok: true, rec };
  };
  E.stopRecurring = function (S, id) { const r = S.expenses.recurring.find((x) => x.id === id); if (r) r.endMonth = SM.monthAdd(SM.monthKey(SM.now()), 0); };
  E.addOneoff = function (S, d) {
    const amount = Math.round(Number(d.amount) || 0);
    if (!(amount > 0)) return { ok: false, msg: "Сумма должна быть больше 0" };
    const rec = { id: SM.uid("ox"), ts: d.ts || SM.now(), name: d.name || d.category || "Расход", category: d.category || "Прочее", amount };
    S.expenses.oneoff.push(rec); return { ok: true, rec };
  };
  /** Все расходы, попадающие в период [from, to): постоянные — по числу месяца. */
  E.inRange = function (S, from, to) {
    const out = [];
    S.expenses.recurring.forEach((r) => {
      let mk = SM.monthKey(from); const last = SM.monthKey(to - 1);
      for (let g = 0; g < 240 && mk <= last; g++, mk = SM.monthAdd(mk, 1)) {
        if (mk < r.startMonth || (r.endMonth && mk > r.endMonth)) continue;
        const [y, m] = mk.split("-").map(Number); const ts = new Date(y, m - 1, r.day, 12).getTime();
        if (ts >= from && ts < to) out.push({ ts, name: r.name, category: r.category, amount: r.amount, recurring: true, id: r.id });
      }
    });
    S.expenses.oneoff.forEach((o) => { if (o.ts >= from && o.ts < to) out.push({ ts: o.ts, name: o.name, category: o.category, amount: o.amount, recurring: false, id: o.id }); });
    return out.sort((a, b) => a.ts - b.ts);
  };
  /** Начисленная ЗП за период: по закрытым сменам + премии − штрафы (аванс — это выплата, не расход). */
  R.payrollAccrued = function (S, from, to) {
    let s = 0; const per = {};
    S.shifts.forEach((sh) => { if (!sh.endedAt || sh.startedAt < from || sh.startedAt >= to) return; (sh.payroll || []).forEach((r) => { s += r.pay; const p = (per[r.empId] = per[r.empId] || { empId: r.empId, shifts: 0, hours: 0, pay: 0, adj: 0 }); p.shifts++; p.hours += r.hours; p.pay += r.pay; }); });
    S.payroll.adjustments.forEach((a) => { if (a.ts < from || a.ts >= to || a.type === "advance") return; const k = a.type === "bonus" ? 1 : -1; s += k * a.amount; const p = (per[a.empId] = per[a.empId] || { empId: a.empId, shifts: 0, hours: 0, pay: 0, adj: 0 }); p.adj += k * a.amount; });
    return { total: s, per: Object.values(per).map((p) => Object.assign(p, { name: SM.empName(S, p.empId), total: p.pay + p.adj })) };
  };
  R.range = function (S, from, to) {
    const rec = S.receipts.filter((r) => r.ts >= from && r.ts < to);
    const svc = rec.filter((r) => r.kind === "service"), sto = rec.filter((r) => r.kind === "storage");
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const revenue = sum(rec, (r) => r.total), cash = sum(rec.filter((r) => r.payment === "cash"), (r) => r.total);
    const card = sum(rec.filter((r) => r.payment === "card"), (r) => r.total), qr = sum(rec.filter((r) => r.payment === "qr"), (r) => r.total);
    const services = sum(svc, (r) => SM.cart.serviceAmount(r)), storage = sum(sto, (r) => r.total) + sum(svc, (r) => SM.cart.storageAmount(r));
    const pay = R.payrollAccrued(S, from, to);
    const exp = E.inRange(S, from, to); const expenses = sum(exp, (e) => e.amount);
    const material = SM.warehouse.costInRange(S, from, to);
    const goods = sum(svc, (r) => SM.cart.goodsAmount(r)), goodsCost = Math.round(sum(svc, (r) => r.goodsCost || 0));
    const top = {}, radii = {};
    svc.forEach((r) => r.items.forEach((i) => { if (i.gift || i.noDiscount) return; const k = i.name; const t = (top[k] = top[k] || { name: k, qty: 0, sum: 0 }); t.qty += i.qty; t.sum += i.price * i.qty; if (i.radius) { const rr = (radii[i.radius] = radii[i.radius] || { name: i.radius, qty: 0, sum: 0 }); rr.qty += i.qty; rr.sum += i.price * i.qty; } }));
    const byCat = {}; exp.forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + e.amount));
    const discounts = sum(svc, (r) => (r.totals && r.totals.discount) || 0);
    return { from, to, revenue, cash, cashless: card + qr, card, qr, services, storage, checks: svc.length, avgCheck: svc.length ? Math.round(services / svc.length) : 0, discounts, payroll: pay.total, staff: pay.per, expenses, expenseList: exp, expenseByCat: byCat, material, goods, goodsCost, profit: Math.round(revenue - pay.total - expenses - material - goodsCost), topServices: Object.values(top).sort((a, b) => b.sum - a.sum).slice(0, 8), topRadii: Object.values(radii).sort((a, b) => b.qty - a.qty).slice(0, 10) };
  };
  R.month = function (S, mk) { const [a, b] = SM.monthRange(mk); return R.range(S, a, b); };
  /** Сравнение с прошлым месяцем на ту же дату (для текущего — за равное число дней). */
  R.compare = function (S, mk) {
    const cur = R.month(S, mk); const prevMk = SM.monthAdd(mk, -1);
    const [a, b] = SM.monthRange(mk), [pa, pb] = SM.monthRange(prevMk), now = SM.now();
    // Текущий месяц сравниваем с теми же днями прошлого месяца, закрытый — с полным прошлым.
    const partial = now >= a && now < b;
    const prev = partial ? R.range(S, pa, Math.min(pb, pa + (now - a))) : R.month(S, prevMk);
    prev.full = R.month(S, prevMk);
    const delta = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
    return { cur, prev, prevMk, partial, days: Math.ceil((now - a) / 864e5), d: { revenue: delta(cur.revenue, prev.revenue), profit: delta(cur.profit, prev.profit), checks: delta(cur.checks, prev.checks), avgCheck: delta(cur.avgCheck, prev.avgCheck) } };
  };
})(typeof window !== "undefined" ? window : globalThis);
