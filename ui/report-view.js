/* Отчёт за месяц/период — общий для админки кассы и страницы владельца. */
(function () {
  const SM = window.SM, esc = SM.esc;
  SM.reportHtml = function (S, mk) {
    const c = SM.reports.compare(S, mk), r = c.cur, p = c.prev;
    const lbl = c.partial ? "к 1–" + c.days + " числу прошлого мес." : "к прошлому месяцу";
    const d = (v) => (v == null ? "" : '<div class="d ' + (v >= 0 ? "up" : "down") + '">' + (v >= 0 ? "▲ " : "▼ ") + Math.abs(v) + "% " + lbl + "</div>");
    const maxS = Math.max(1, ...r.topServices.map((x) => x.sum)), maxR = Math.max(1, ...r.topRadii.map((x) => x.qty));
    return '<div class="kpis">' +
      '<div class="kpi"><div class="l">Выручка</div><div class="v">' + SM.fmt(r.revenue) + "</div>" + d(c.d.revenue) + "</div>" +
      '<div class="kpi"><div class="l">Наличные</div><div class="v">' + SM.fmt(r.cash) + '</div></div><div class="kpi"><div class="l">Безнал (карта+QR)</div><div class="v">' + SM.fmt(r.cashless) + "</div></div>" +
      '<div class="kpi"><div class="l">Чеков</div><div class="v">' + r.checks + "</div>" + d(c.d.checks) + '</div><div class="kpi"><div class="l">Средний чек</div><div class="v">' + SM.fmt(r.avgCheck) + "</div>" + d(c.d.avgCheck) + "</div>" +
      '<div class="kpi"><div class="l">Доход от хранения</div><div class="v">' + SM.fmt(r.storage) + "</div></div>" +
      '<div class="kpi"><div class="l">Зарплата</div><div class="v">−' + SM.fmt(r.payroll) + '</div></div><div class="kpi"><div class="l">Расходы</div><div class="v">−' + SM.fmt(r.expenses) + '</div></div><div class="kpi"><div class="l">Расходники (себест.)</div><div class="v">−' + SM.fmt(r.material) + "</div></div>" +
      '<div class="kpi profit"><div class="l">Чистая прибыль</div><div class="v">' + SM.fmt(r.profit) + "</div>" + d(c.d.profit) + "</div></div>" +
      '<div class="hint" style="margin:6px 0 10px">Чистая прибыль = выручка − ЗП (смены + премии − штрафы) − расходы − себестоимость списанных расходников. ' + (c.partial ? "Сравнение — с теми же днями прошлого месяца (" + SM.monthName(c.prevMk) + ": за те же дни выручка " + SM.fmt(p.revenue) + ", прибыль " + SM.fmt(p.profit) + "; за весь месяц выручка " + SM.fmt(p.full.revenue) + ")." : SM.monthName(c.prevMk) + ": выручка " + SM.fmt(p.revenue) + ", прибыль " + SM.fmt(p.profit) + ".") + "</div>" +
      '<div class="split"><div class="card"><div class="cardh"><span>Топ услуг</span><span>сумма</span></div>' + r.topServices.map((x) => '<div style="margin:6px 0"><div class="kv" style="border:0;padding:0"><span>' + esc(x.name) + " · " + x.qty + " шт</span><b>" + SM.fmt(x.sum) + '</b></div><div class="bar" style="width:' + Math.round((x.sum / maxS) * 100) + '%"></div></div>').join("") + "</div>" +
      '<div class="card"><div class="cardh"><span>Топ радиусов</span><span>колёс/услуг</span></div>' + r.topRadii.map((x) => '<div style="margin:6px 0"><div class="kv" style="border:0;padding:0"><span>' + x.name + "</span><b>" + x.qty + '</b></div><div class="bar" style="background:#2563eb;width:' + Math.round((x.qty / maxR) * 100) + '%"></div></div>').join("") + "</div></div>" +
      '<div class="split" style="margin-top:10px"><div class="card"><div class="cardh"><span>Сотрудники</span><span>смены · часы · ЗП</span></div>' + (r.staff.length ? r.staff.map((x) => '<div class="kv"><span>' + esc(x.name) + " · " + x.shifts + " см. · " + Math.round(x.hours) + " ч" + (x.adj ? " · премии/штрафы " + SM.fmt(x.adj) : "") + "</span><b>" + SM.fmt(x.total) + "</b></div>").join("") : '<div class="empty">Нет закрытых смен</div>') + "</div>" +
      '<div class="card"><div class="cardh"><span>Расходы по категориям</span><span>' + SM.fmt(r.expenses) + "</span></div>" + Object.keys(r.expenseByCat).map((k) => '<div class="kv"><span>' + esc(k) + "</span><b>" + SM.fmt(r.expenseByCat[k]) + "</b></div>").join("") + (r.expenseList.length ? '<details style="margin-top:6px"><summary class="hint">Все расходы (' + r.expenseList.length + ")</summary>" + r.expenseList.map((e) => '<div class="kv"><span>' + SM.fmtDate(e.ts) + " · " + esc(e.name) + (e.recurring ? " (пост.)" : "") + "</span><b>" + SM.fmt(e.amount) + "</b></div>").join("") + "</details>" : "") + "</div></div>";
  };
  SM.realtimePayHtml = function (S) {
    const sh = SM.shift.current(S); if (!sh) return '<div class="empty">Смена сейчас закрыта</div>';
    const rows = SM.payroll.forShift(S, sh), rev = SM.shift.revenue(S, sh.id);
    return '<div class="hint" style="margin-bottom:6px">Смена №' + sh.no + " с " + SM.fmtTime(sh.startedAt) + " · выручка услуг " + SM.fmt(rev.total - rev.storage) + " · обновлено " + SM.fmtTime(SM.now()) + '</div><div class="scroll"><table class="tbl"><tr><th>Мастер</th><th class="r">Часы</th><th class="r">%</th><th class="r">Сейчас</th><th>Минимум ' + SM.fmt(S.settings.minPay) + "</th></tr>" + rows.map((r) => "<tr><td><b>" + esc(r.name) + "</b><br><small>" + (r.atWork ? "🟢 на смене" : "ушёл") + '</small></td><td class="r">' + SM.hoursLabel(r.hours) + '</td><td class="r">' + r.percent + '%</td><td class="r"><b>' + SM.fmt(r.pay) + "</b><br><small>по % " + SM.fmt(r.rounded) + "</small></td><td>" + (r.minEligible ? (r.minApplied ? '<span class="chip ok">дотянул 8 ч — минимум</span>' : '<span class="chip ok">8 ч есть, % выше</span>') : '<span class="chip soon">до 8 ч: ' + SM.hoursLabel(r.hoursTo8) + "</span>") + "</td></tr>").join("") + "</table></div>";
  };
})();
