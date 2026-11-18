/* Вкладки «Смена» и «Очередь». */
(function () {
  const SM = window.SM, U = SM.ui, A = U.act, esc = SM.esc;
  const PAY_RU = { cash: "нал", card: "карта", qr: "QR" };
  U.payrollRowHtml = function (r, S) {
    return '<div class="kv"><span>Отработано по отметкам</span><b>' + SM.hoursLabel(r.hours) + "</b></div>" +
      '<div class="kv"><span>Личный процент</span><b>' + r.percent + "% (делится на число мастеров на смене)</b></div>" +
      '<div class="kv"><span>По проценту</span><b>' + SM.fmt(r.raw) + " → " + SM.fmt(r.rounded) + " (округл. до 50 ₽)</b></div>" +
      '<div class="kv"><span>Минимум ' + SM.fmt(S.settings.minPay) + "</span><b>" + (r.minApplied ? "применён (≥ " + S.settings.minPayHours + " ч)" : r.minEligible ? "не нужен — процент больше" : "не положен: меньше " + S.settings.minPayHours + " ч (осталось " + SM.hoursLabel(r.hoursTo8) + ")") + "</b></div>" +
      '<div class="tot"><span>Итого</span><span class="s">' + SM.fmt(r.pay) + "</span></div>";
  };
  U.views.shift = function (el, S) {
    const sh = SM.shift.current(S);
    if (!sh) {
      el.innerHTML = '<div class="split"><div class="card"><div class="h1">Открыть смену</div><div class="hint" style="margin:6px 0 10px">Отметьте, кто вышел. Время прихода запишется сейчас.</div>' +
        S.employees.filter((e) => e.active).map((e) => '<label class="check" style="margin-bottom:8px"><input type="checkbox" name="m" value="' + e.id + '"> ' + esc(e.name) + "</label>").join("") +
        '<div class="h2" style="margin-top:14px">Пересчитайте наличные в ящике</div><div class="kv"><span>Должно быть по учёту</span><b>' + SM.fmt(S.drawer.balance) + '</b></div><button class="btn block ghost" data-act="factOpen" id="fact-btn" style="margin-top:8px">Факт: <span class="muted">ввести сумму</span></button>' +
        '<button class="btn primary block" style="margin-top:12px;min-height:64px;font-size:1.2rem" data-act="shiftOpen">Открыть смену</button></div>' +
        '<div class="card"><div class="h2">Прошлые смены</div><div class="hint">История смен, ЗП и инкассация доступны только владельцу.</div><button class="btn block" style="margin-top:10px" data-act="pastShifts">🔒 Прошлые смены</button></div></div>';
      U._fact = "";
      return;
    }
    const rev = SM.shift.revenue(S, sh.id);
    const at = SM.shift.atWork(S, sh);
    const recs = S.receipts.filter((r) => r.shiftId === sh.id).sort((a, b) => b.ts - a.ts);
    const people = S.employees.filter((e) => e.active);
    el.innerHTML = '<div class="split l"><div>' +
      '<div class="card"><div class="row"><div class="grow"><div class="h1">Смена №' + sh.no + "</div><div class=\"hint\">открыта " + SM.fmtDT(sh.startedAt) + '</div></div><button class="btn sm" data-act="pastShifts">🔒 Прошлые смены</button></div>' +
      '<div class="kpis" style="margin-top:10px"><div class="kpi"><div class="l">Выручка</div><div class="v">' + SM.fmt(rev.total) + '</div></div><div class="kpi"><div class="l">Наличные</div><div class="v">' + SM.fmt(rev.cash) + '</div></div><div class="kpi"><div class="l">Безнал</div><div class="v">' + SM.fmt(rev.cashless) + '</div></div><div class="kpi"><div class="l">Чеков</div><div class="v">' + rev.count + "</div></div></div></div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>Кто на смене</span><span>тап по своему имени — моя ЗП за сегодня</span></div>' +
      people.map((e) => { const on = at.indexOf(e.id) >= 0; const a = sh.att.filter((x) => x.empId === e.id); const since = a.length ? a[a.length - 1].in : null; return '<div class="list-item" style="cursor:default"><button class="btn sm ghost grow" style="justify-content:flex-start' + (a.length ? "" : ";border-color:transparent;background:none") + '" data-act="mySalary" data-id="' + e.id + '"' + (a.length ? "" : " disabled") + ">" + (on ? "🟢 " : a.length ? "⚪ " : "") + esc(e.name) + (on ? ' <small class="muted">с ' + SM.fmtTime(since) + "</small>" : a.length ? ' <small class="muted">ушёл</small>' : "") + "</button>" + (on ? '<button class="btn sm danger" data-act="clockOut" data-id="' + e.id + '">Ушёл</button>' : '<button class="btn sm ok" data-act="clockIn" data-id="' + e.id + '">Пришёл</button>') + "</div>"; }).join("") + "</div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>Чеки текущей смены</span><span>' + recs.length + "</span></div>" + (recs.length ? '<table class="tbl"><tr><th>Время</th><th>№</th><th>Что</th><th>Оплата</th><th class="r">Сумма</th></tr>' + recs.map((r) => "<tr><td>" + SM.fmtTime(r.ts) + "</td><td>" + r.no + "</td><td>" + (r.plate ? esc(r.plate) + " · " : "") + esc(r.items.filter((i) => !i.gift).map((i) => i.name + (i.qty > 1 ? " ×" + i.qty : "")).join(", ")) + "</td><td>" + PAY_RU[r.payment] + '</td><td class="r"><b>' + SM.fmt(r.total) + "</b></td></tr>").join("") + "</table>" : '<div class="empty">Чеков пока нет</div>') + "</div>" +
      '</div><div><div class="card"><div class="cardh"><span>Денежный ящик</span></div><div class="tot"><span>Наличные в ящике</span><span class="s">' + SM.fmt(S.drawer.balance) + '</span></div><button class="btn block" style="margin-top:10px" data-act="collect">🔒 Инкассация (PIN владельца)</button></div>' +
      '<div class="card" style="margin-top:10px"><div class="h2">Закрыть смену</div><div class="hint">Покажем расчёт ЗП каждому мастеру. ЗП автоматически вычитается из наличных в ящике; если не хватает — выдаём сколько есть, остальное в долг.</div><button class="btn primary block" style="margin-top:10px;min-height:64px;font-size:1.15rem" data-act="shiftClose">Закрыть смену</button></div></div></div>';
  };
  A.factOpen = () => U.numpad({ title: "Факт: наличные в ящике", text: "Пересчитайте деньги и введите сумму. Если ящик пуст — 0.", allowZero: true, placeholder: "сумма по факту", onDone: (n) => { U._fact = String(n); const b = document.getElementById("fact-btn"); if (b) b.innerHTML = "Факт: <b>" + SM.fmt(n) + "</b>"; } });
  A.shiftOpen = () => {
    const S = U.S(); const ids = U.$$("input[name=m]:checked").map((i) => i.value);
    if (!ids.length) return U.toast("Отметьте хотя бы одного мастера", true);
    if (U._fact === "") return U.toast("Введите фактический остаток в ящике", true);
    const r = SM.shift.open(S, ids, U._fact); if (!r.ok) return U.toast(r.msg, true);
    S.ui.operator = ids[0]; const chk = r.shift.cashChecks[0];
    U.commit(); U.toast("Смена открыта" + (chk && chk.diff ? " · расхождение " + SM.fmt(chk.diff) : ""));
  };
  A.clockIn = (el) => {
    const S = U.S(); const id = el.dataset.id;
    U.numpad({ title: SM.empName(S, id) + " пришёл — пересчёт ящика", text: "По учёту в ящике: <b>" + SM.fmt(S.drawer.balance) + "</b>. Пересчитайте и введите факт.", allowZero: true, placeholder: "сумма по факту", okLabel: "Подтвердить и выйти на смену", onDone: (n) => { const r = SM.shift.clockIn(S, id, n); if (!r.ok) return U.toast(r.msg, true); U.commit(); U.toast(SM.empName(S, id) + " на смене" + (r.check && r.check.diff ? " · расхождение " + SM.fmt(r.check.diff) : " · касса сошлась")); } });
  };
  A.clockOut = (el) => {
    const S = U.S(); const id = el.dataset.id; const name = SM.empName(S, id);
    U.confirm(name + " ушёл со смены?", "Время ухода запишется сейчас. Дальше выручка делится на оставшихся.", "Да, ушёл", () => {
      const r = SM.shift.clockOut(S, id); if (!r.ok) return U.toast(r.msg, true);
      if (S.ui.operator === id) S.ui.operator = SM.shift.atWork(S)[0] || null;
      U.commit();
      U.modal({ title: "Расчёт: " + esc(name), body: U.payrollRowHtml(r.row, S) + '<div class="hint" style="margin-top:8px">Окончательно — при закрытии смены (выплата из ящика).</div>', foot: '<button class="btn primary" data-close>Понятно</button>' });
    });
  };
  A.mySalary = (el) => {
    const S = U.S(); const sh = SM.shift.current(S); const row = SM.payroll.forShift(S, sh).find((r) => r.empId === el.dataset.id);
    if (!row) return;
    U.modal({ title: "Моя ЗП за сегодня — " + esc(row.name), body: '<div class="hint" style="margin-bottom:8px">Видна только ваша сумма. Обновляется с каждым чеком.</div>' + U.payrollRowHtml(row, S), foot: '<button class="btn primary" data-close>Закрыть</button>' });
  };
  A.shiftClose = () => {
    const S = U.S(); const rows = SM.shift.preview(S); const total = rows.reduce((s, r) => s + r.pay, 0);
    const short = Math.max(0, total - S.drawer.balance);
    U.modal({ title: "Закрыть смену?", wide: true, body: rows.map((r) => '<div class="card" style="margin-bottom:8px"><div class="h2">' + esc(r.name) + "</div>" + U.payrollRowHtml(r, S) + "</div>").join("") +
      '<div class="kv"><span>ЗП всего</span><b>' + SM.fmt(total) + '</b></div><div class="kv"><span>Наличные в ящике</span><b>' + SM.fmt(S.drawer.balance) + "</b></div>" + (short ? '<div class="banner" style="margin:8px 0">Наличных не хватает на ' + SM.fmt(short) + ". Выдадим сколько есть, остальное запишется в долг.</div>" : ""),
      foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-ok>Закрыть смену и выдать ЗП</button>', mount: (m, close) => m.querySelector("[data-ok]").onclick = () => {
        close(); const r = SM.shift.close(S); if (!r.ok) return U.toast(r.msg, true); S.ui.operator = null; U.commit();
        const s = r.summary;
        U.modal({ title: "Смена №" + r.shift.no + " закрыта", body: '<div class="kv"><span>Выручка</span><b>' + SM.fmt(s.revenue.total) + '</b></div><div class="kv"><span>Наличные / безнал</span><b>' + SM.fmt(s.revenue.cash) + " / " + SM.fmt(s.revenue.cashless) + '</b></div><div class="kv"><span>Чеков</span><b>' + s.revenue.count + "</b></div>" +
          r.rows.map((x) => '<div class="kv"><span>' + esc(x.name) + " — " + SM.hoursLabel(x.hours) + (x.minApplied ? " · минимум" : "") + "</span><b>" + SM.fmt(x.paid) + (x.debt ? ' <span class="down">долг ' + SM.fmt(x.debt) + "</span>" : "") + "</b></div>").join("") +
          '<div class="kv"><span>ЗП выплачено из ящика</span><b>' + SM.fmt(s.paidTotal) + '</b></div><div class="kv"><span>Остаток в ящике после ЗП</span><b>' + SM.fmt(s.drawerAfter) + "</b></div>" + (s.notes.length ? '<div class="hint">' + s.notes.map(esc).join("<br>") + "</div>" : ""), foot: '<button class="btn primary" data-close>Готово</button>' });
      } });
  };
  A.collect = () => U.requirePin(() => { const S = U.S(); U.numpad({ title: "Инкассация", text: "В ящике: <b>" + SM.fmt(S.drawer.balance) + "</b>", validate: (n) => (n > S.drawer.balance ? "Больше, чем в ящике" : null), onDone: (n) => { const r = SM.shift.collect(S, n, S.settings.pin, "владелец"); if (!r.ok) { U.toast(r.msg, true); return false; } U.commit(); U.toast("Инкассация " + SM.fmt(n)); } }); }, "Инкассация — только владелец");
  U.shiftsTable = function (S, limit) {
    const list = S.shifts.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit || 60);
    return '<div class="scroll"><table class="tbl"><tr><th>Смена</th><th>Мастера</th><th class="r">Нал</th><th class="r">Безнал</th><th class="r">ЗП выплачено</th><th class="r">Долг</th><th class="r">Остаток после ЗП</th></tr>' + list.map((s) => "<tr><td>№" + s.no + "<br><small>" + SM.fmtDate(s.startedAt) + "</small></td><td>" + (s.payroll || []).map((r) => esc(r.name) + ": " + SM.fmt(r.pay) + (r.minApplied ? "*" : "")).join("<br>") + '</td><td class="r">' + SM.fmt(s.summary.revenue.cash) + '</td><td class="r">' + SM.fmt(s.summary.revenue.cashless) + '</td><td class="r">' + SM.fmt(s.summary.paidTotal) + '</td><td class="r">' + (s.summary.debtTotal ? SM.fmt(s.summary.debtTotal) : "—") + '</td><td class="r">' + SM.fmt(s.summary.drawerAfter) + "</td></tr>").join("") + '</table></div><div class="hint">* применён минимум ' + SM.fmt(S.settings.minPay) + "</div>";
  };
  A.pastShifts = () => U.requirePin(() => { const S = U.S(); U.modal({ title: "Закрытые смены", wide: true, body: U.shiftsTable(S, 60) }); }, "История прошлых смен — только по PIN владельца");

  /* ---------- Очередь ---------- */
  U.views.queue = function (el, S) {
    const items = S.queue.items.filter((q) => q.status !== "done");
    const waiting = items.filter((q) => q.status === "wait"), called = items.filter((q) => q.status === "called");
    el.innerHTML = '<div class="split"><div class="card"><div class="row"><div class="h1 grow">Очередь с улицы</div><button class="btn" data-act="qAdd">+ Талон (демо)</button></div>' +
      '<button class="btn primary block" style="min-height:76px;font-size:1.4rem;margin-top:12px" data-act="qNext"' + (waiting.length ? "" : " disabled") + ">Следующий →" + (waiting[0] ? " №" + waiting[0].no : "") + '</button><div class="h2" style="margin-top:12px">Ждут: ' + waiting.length + "</div>" +
      (waiting.length ? waiting.map((q) => '<div class="list-item" style="cursor:default"><b style="font-size:1.6rem;width:70px">№' + q.no + '</b><span class="grow muted">с ' + SM.fmtTime(q.ts) + " · " + esc(q.source) + "</span></div>").join("") : '<div class="empty">Никого</div>') + "</div>" +
      '<div class="card"><div class="h2">Вызваны — принять машину</div>' + (called.length ? called.map((q) => { const o = SM.orders.open(S).find((x) => x.queueNo === q.no); return '<div class="list-item" style="cursor:default"><b style="font-size:1.6rem;width:70px">№' + q.no + '</b><span class="grow">' + (o ? 'заказ №' + o.no + " · " + SM.orders.statusLabel(o.status) : "вызван " + SM.fmtTime(q.calledAt)) + "</span>" + (o ? '<button class="btn sm" data-act="carOpen" data-id="' + o.id + '">Открыть</button>' : '<button class="btn sm primary" data-act="qAccept" data-no="' + q.no + '">Принять машину</button><button class="btn sm ghost" data-act="qDrop" data-no="' + q.no + '">Ушёл</button>') + "</div>"; }).join("") : '<div class="empty">Нажмите «Следующий»</div>') +
      '<div class="hint" style="margin-top:8px">Заказ откроется по номеру очереди, госномер и клиента можно добавить позже. Табло с голосом не делаем (вычеркнуто).</div></div></div>';
  };
  A.qAdd = () => { const S = U.S(); const q = SM.queueAdd(S, "улица"); U.commit(); U.toast("Талон №" + q.no); };
  A.qNext = () => { const S = U.S(); const q = SM.queueNext(S); U.commit(); if (q) U.alert("Следующий", '<div class="qnum">№' + q.no + "</div>"); };
  A.qDrop = (el) => { const S = U.S(); const q = S.queue.items.find((x) => x.no === Number(el.dataset.no)); q.status = "done"; U.commit(); };
  A.qAccept = (el) => { const S = U.S(); const r = SM.orders.create(S, { queueNo: Number(el.dataset.no) }, U.who()); if (!r.ok) return U.toast(r.msg, true); S.ui.activeOrderId = r.order.id; SM.save(); U.go("kassa"); U.toast("Заказ по очереди №" + el.dataset.no + " открыт"); };
})();
