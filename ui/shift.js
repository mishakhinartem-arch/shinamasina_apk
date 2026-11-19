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
        '<div id="shift-rows">' + [0, 1].map(() => U.shiftRowHtml(S)).join("") + '</div><button class="btn sm ghost" data-act="shiftRowAdd">+ Ещё сотрудник</button>' +
        '<div class="hint" style="margin-top:4px">Каждая строка — один сотрудник: выберите из списка.</div><div class="h2" style="margin-top:14px">Пересчитайте наличные в ящике</div><div class="kv"><span>Должно быть по учёту</span><b>' + SM.fmt(S.drawer.balance) + '</b></div><button class="btn block ghost" data-act="factOpen" id="fact-btn" style="margin-top:8px">Факт: <span class="muted">ввести сумму</span></button>' +
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
      people.filter((e) => sh.att.some((x) => x.empId === e.id)).map((e) => { const on = at.indexOf(e.id) >= 0; const a = sh.att.filter((x) => x.empId === e.id); const since = a.length ? a[a.length - 1].in : null; return '<div class="list-item" style="cursor:default"><button class="btn sm ghost grow" style="justify-content:flex-start' + (a.length ? "" : ";border-color:transparent;background:none") + '" data-act="mySalary" data-id="' + e.id + '"' + (a.length ? "" : " disabled") + ">" + (on ? "🟢 " : a.length ? "⚪ " : "") + esc(e.name) + (on ? ' <small class="muted">с ' + SM.fmtTime(since) + "</small>" : a.length ? ' <small class="muted">ушёл</small>' : "") + "</button>" + (on ? '<button class="btn sm danger" data-act="clockOut" data-id="' + e.id + '">Ушёл</button>' : '<button class="btn sm ok" data-act="clockIn" data-id="' + e.id + '">Пришёл</button>') + "</div>"; }).join("") +
      (people.some((e) => at.indexOf(e.id) < 0) ? '<div class="shift-row" style="margin-top:8px"><select class="inp" id="clockin-sel"><option value="">+ Вышел ещё сотрудник — выберите…</option>' + people.filter((e) => at.indexOf(e.id) < 0).map((e) => '<option value="' + e.id + '">' + esc(e.name) + "</option>").join("") + '</select><button class="btn ok" data-act="clockInSel">Пришёл</button></div>' : "") + "</div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>Чеки текущей смены</span><span>' + recs.length + "</span></div>" + (recs.length ? '<table class="tbl"><tr><th>Время</th><th>№</th><th>Что</th><th>Оплата</th><th class="r">Сумма</th></tr>' + recs.map((r) => "<tr><td>" + SM.fmtTime(r.ts) + "</td><td>" + r.no + "</td><td>" + (r.plate ? esc(r.plate) + " · " : "") + esc(r.items.filter((i) => !i.gift).map((i) => i.name + (i.qty > 1 ? " ×" + i.qty : "")).join(", ")) + "</td><td>" + PAY_RU[r.payment] + '</td><td class="r"><b>' + SM.fmt(r.total) + "</b></td></tr>").join("") + "</table>" : '<div class="empty">Чеков пока нет</div>') + "</div>" +
      '</div><div><div class="card"><div class="cardh"><span>Денежный ящик</span></div><div class="tot"><span>Наличные в ящике</span><span class="s">' + SM.fmt(S.drawer.balance) + '</span></div><button class="btn block" style="margin-top:10px" data-act="collect">🔒 Инкассация (PIN владельца)</button></div>' +
      '<div class="card" style="margin-top:10px"><div class="h2">Закрыть смену</div><div class="hint">Покажем расчёт ЗП каждому мастеру. ЗП автоматически вычитается из наличных в ящике; если не хватает — выдаём сколько есть, остальное в долг.</div><button class="btn primary block" style="margin-top:10px;min-height:64px;font-size:1.15rem" data-act="shiftClose">Закрыть смену</button></div></div></div>';
  };
  /** Строка «Кто на смене»: выпадающий список сотрудников. */
  U.shiftRowHtml = (S) => '<div class="shift-row"><select class="inp" name="m-sel"><option value="">— выберите сотрудника —</option>' + S.employees.filter((e) => e.active).map((e) => '<option value="' + e.id + '">' + esc(e.name) + "</option>").join("") + '</select><button class="btn sm ghost" data-act="shiftRowDel" title="Убрать строку">✕</button></div>';
  A.shiftRowAdd = () => { const box = document.getElementById("shift-rows"); if (box) box.insertAdjacentHTML("beforeend", U.shiftRowHtml(U.S())); };
  A.shiftRowDel = (el) => { const r = el.closest(".shift-row"); if (r && document.querySelectorAll("#shift-rows .shift-row").length > 1) r.remove(); else if (r) r.querySelector("select").value = ""; };
  A.clockInSel = () => { const v = (document.getElementById("clockin-sel") || {}).value; if (!v) return U.toast("Выберите сотрудника в списке", true); A.clockIn({ dataset: { id: v } }); };
  A.factOpen = () => U.numpad({ title: "Факт: наличные в ящике", text: "Пересчитайте деньги и введите сумму. Если ящик пуст — 0.", allowZero: true, placeholder: "сумма по факту", onDone: (n) => { U._fact = String(n); const b = document.getElementById("fact-btn"); if (b) b.innerHTML = "Факт: <b>" + SM.fmt(n) + "</b>"; } });
  A.shiftOpen = () => {
    const S = U.S(); const ids = U.$$("select[name=m-sel]").map((i) => i.value).filter((v, i, a) => v && a.indexOf(v) === i);
    if (!ids.length) return U.toast("Выберите хотя бы одного сотрудника в строках", true);
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

  /* ---------- Очередь: живая очередь (талоны с планшета), посты, ожидание ---------- */
  U.views.queue = function (el, S) {
    const L = SM.live, P = L.posts(S), today = L.today(S);
    const waiting = L.waiting(S), called = today.filter((q) => q.status === "called");
    const tk = SM.dayKey(SM.now()), nowMin = new Date(SM.now()).getHours() * 60 + new Date(SM.now()).getMinutes();
    const bk = SM.booking.forDay(S, tk).filter((b) => b.status !== "done" && b.status !== "cancel");
    const curBk = bk.filter((b) => { const [h, m] = b.time.split(":").map(Number); const t = h * 60 + m; return t <= nowMin + 30 && t + (S.settings.slotMin || 60) > nowMin - 30; });
    const nextBk = bk.filter((b) => { const [h, m] = b.time.split(":").map(Number); return h * 60 + m > nowMin; })[0];
    const PS = L.postsState(S), borrow = L.canBorrow(S, L.dur(S, waiting[0]));
    const postCard = (p) => {
      const o = p.occ, bk = p.kind === "booking";
      const who = !o ? "" : o.type === "queue" ? "талон №" + o.q.no + (o.q.plate ? " · " + esc(o.q.plate) : "") + (o.q.borrowed ? " (из живой очереди)" : "") : (o.booking ? "запись " + o.booking.time + " · " : "") + esc(SM.orders.title(o.order)) + " · " + SM.orders.statusLabel(o.order.status);
      const free = bk ? "свободен" + (nextBk ? " · след. запись " + nextBk.time : "") + (waiting.length && borrow.ok && borrow.post === p.n ? '<br><b>можно взять из очереди — успеваем до записи</b>' : "") : "свободен";
      return '<div class="post ' + (bk ? "bk" : "live") + (o && o.type === "queue" && o.q.borrowed ? " borrowed" : "") + '"><div class="pn">Пост ' + p.n + '</div><div class="pt">' + (bk ? "Онлайн-запись" : "Живая очередь") + '</div><div class="ps">' + (o ? "🚗 " + who : free) + "</div>" + (o ? '<button class="btn sm ghost rel" data-act="qRelease" data-n="' + p.n + '">✓ Освободить пост</button>' : "") + "</div>";
    };
    el.innerHTML = '<div class="row" style="margin-bottom:8px"><div class="h1 grow">Живая очередь · ' + SM.fmtDay(tk) + '</div><span class="chip ' + (S.settings.seasonMode ? "ok" : "") + '">' + (S.settings.seasonMode ? "Сезон: " + P.total + " поста, " + P.booking + " под запись" : "Не сезон: очередь на все посты") + '</span><a class="btn" href="queue.html" target="_blank">Планшет очереди для клиентов ↗</a></div>' +
      '<div class="posts">' + PS.map(postCard).join("") + '</div><div class="hint" style="margin-top:6px">На одном посту — одна машина. «Готова, ждёт оплаты» пост освобождает. Если записей нет и до ближайшей успеваем (≈' + L.dur(S, waiting[0]) + " мин на машину), машина из живой очереди встаёт на свободный пост записи.</div>" +
      '<div class="split" style="margin-top:10px"><div class="card"><div class="row"><div class="h2 grow" style="margin:0">Ждут: ' + waiting.length + '</div><button class="btn sm" data-act="qAdd">+ Талон вручную</button></div>' +
      '<button class="btn primary block" style="min-height:76px;font-size:1.4rem;margin-top:10px" data-act="qNext"' + (waiting.length ? "" : " disabled") + ">Следующий →" + (waiting[0] ? " №" + waiting[0].no : "") + "</button>" +
      '<div style="margin-top:10px">' + (waiting.length ? waiting.map((q) => '<div class="list-item" style="cursor:default"><b style="font-size:1.6rem;width:70px">№' + q.no + '</b><span class="grow">' + (q.plate ? U.plateHtml(q.plate, true) + " " : "") + '<small class="muted">с ' + SM.fmtTime(q.ts) + " · " + esc(q.source) + '</small></span><span class="chip soon">' + L.waitLabel(L.waitMin(S, q.no)) + "</span></div>").join("") : '<div class="empty">Никого</div>') + "</div></div>" +
      '<div class="card"><div class="h2">Вызваны — принять машину</div>' + (called.length ? called.map((q) => { const o = SM.orders.open(S).find((x) => x.queueNo === q.no && SM.dayKey(x.createdAt) === tk); return '<div class="list-item" style="cursor:default"><b style="font-size:1.6rem;width:70px">№' + q.no + '</b><span class="grow">' + (q.plate ? esc(q.plate) + " · " : "") + "пост " + (q.post || "?") + " · " + (o ? "заказ №" + o.no + " · " + SM.orders.statusLabel(o.status) : "вызван " + SM.fmtTime(q.calledAt)) + "</span>" + (o ? '<button class="btn sm" data-act="carOpen" data-id="' + o.id + '">Открыть</button>' : '<button class="btn sm primary" data-act="qAccept" data-no="' + q.no + '">Принять машину</button><button class="btn sm ghost" data-act="qDrop" data-no="' + q.no + '">Ушёл</button>') + "</div>"; }).join("") : '<div class="empty">Нажмите «Следующий»</div>') +
      '<div class="hint" style="margin-top:8px">Нумерация талонов каждый день начинается с №1. Ожидание примерное: среднее время услуг машин впереди (полный шиномонтаж ' + S.settings.durFull + " мин, на дисках " + S.settings.durWheels + " мин, снять/поставить " + S.settings.durMount + " мин) / постов живой очереди (" + P.live + "). Настройки — Админка → Настройки → «Сезон и посты». Табло с голосом не делаем.</div></div></div>";
  };
  A.qAdd = () => U.plateKeyboard({ title: "Талон вручную — госномер (можно без номера)", extra: '<button class="btn block ghost" style="margin-top:10px" data-noplate>Без госномера</button>', onDone: (p) => add(p), onExtra: (e, close) => { if (e.target.closest("[data-noplate]")) { close(); add(""); } } });
  function add(plate) { const S = U.S(); const q = SM.queueAdd(S, "касса", plate); U.commit(); U.toast("Талон №" + q.no + " · ожидание " + SM.live.waitLabel(SM.live.waitMin(S, q.no))); }
  A.qNext = () => { const S = U.S(); const r = SM.live.next(S); if (!r.ok) return U.alert("Свободного поста нет", esc(r.msg)); const q = r.ticket; U.commit(); U.alert("Следующий", '<div class="qnum">№' + q.no + '</div><div style="text-align:center;font-size:1.3rem">' + (q.plate ? esc(q.plate) + " · " : "") + "проезжайте на пост " + q.post + "</div>" + (r.borrowed ? '<div class="hint" style="text-align:center;margin-top:6px">Пост записи свободен, до ближайшей записи успеваем.</div>' : "")); };
  A.qRelease = (el) => { const S = U.S(); const r = SM.live.release(S, Number(el.dataset.n)); if (!r.ok) return U.toast(r.msg, true); U.commit(); U.toast("Пост " + el.dataset.n + " свободен"); };
  A.qDrop = (el) => { const S = U.S(); SM.live.done(S, Number(el.dataset.no), SM.dayKey(SM.now())); U.commit(); };
  A.qAccept = (el) => { const S = U.S(); const q = SM.live.find(S, Number(el.dataset.no)); if (q && q.status === "wait") { const c = SM.live.call(S, q); if (!c.ok) return U.alert("Свободного поста нет", esc(c.msg)); } const r = SM.orders.create(S, q && q.plate ? { plate: q.plate, queueNo: q.no } : { queueNo: Number(el.dataset.no) }, U.who()); if (!r.ok) return U.toast(r.msg, true); if (!r.order.queueNo) r.order.queueNo = Number(el.dataset.no); S.ui.activeOrderId = r.order.id; SM.save(); U.go("kassa"); U.toast("Заказ по очереди №" + el.dataset.no + " открыт"); };
})();
