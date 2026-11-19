/* Базовый UI: роутер, модальные окна, тосты, клавиатура госномера, нумпад, PIN, печать. */
(function () {
  const SM = window.SM;
  const U = (SM.ui = { act: {}, views: {}, view: "kassa" });
  const $ = (s, r) => (r || document).querySelector(s);
  U.$ = $; U.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  U.S = () => SM.load();
  U.commit = function () { SM.save(); U.render(); };
  U.who = function () { const S = U.S(); if (U.pinOk()) return "Владелец"; const id = S.ui.operator; return id ? SM.empName(S, id) : "Касса"; };
  U.toast = function (msg, err) { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg; $("#toast").appendChild(t); setTimeout(() => t.remove(), err ? 5200 : 2600); };
  /* ---------- Модальные окна: у каждого «✕ Закрыть» и закрытие тапом по фону ---------- */
  U.modal = function (o) {
    const bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal ' + (o.wide ? "wide" : "") + '" role="dialog"><div class="modal-h"><div class="t">' + o.title + '</div><button class="modal-x" data-close>✕ Закрыть</button></div><div class="modal-b">' + (o.body || "") + "</div>" + (o.foot ? '<div class="modal-f">' + o.foot + "</div>" : "") + "</div>";
    const close = () => { bg.remove(); if (o.onClose) o.onClose(); };
    bg.addEventListener("click", (e) => { if (e.target === bg || e.target.closest("[data-close]")) close(); });
    document.body.appendChild(bg);
    bg.close = close;
    if (o.mount) o.mount(bg.querySelector(".modal"), close);
    return bg;
  };
  U.confirm = function (title, text, okLabel, onOk, danger) {
    U.modal({ title, body: '<div style="font-size:1.1rem">' + text + "</div>", foot: '<button class="btn" data-close>Отмена</button><button class="btn ' + (danger ? "danger" : "primary") + '" data-ok>' + (okLabel || "Да") + "</button>", mount: (m, close) => { m.querySelector("[data-ok]").onclick = () => { close(); onOk(); }; } });
  };
  U.alert = function (title, html) { U.modal({ title, body: html, foot: '<button class="btn primary" data-close>Понятно</button>' }); };
  /* ---------- Номерной знак ---------- */
  U.plateHtml = function (p, sm) {
    if (!p) return '<span class="plate empty' + (sm ? " sm" : "") + '"><span class="num">госномер</span></span>';
    const pp = SM.plateParts(p);
    if (pp.free || !SM.plateValid(p)) return '<span class="plate free' + (sm ? " sm" : "") + '"><span class="num">' + SM.esc(SM.normPlate(p)) + "</span></span>";
    return '<span class="plate' + (sm ? " sm" : "") + '"><span class="num">' + SM.esc(pp.main) + '</span><span class="reg"><span class="rn">' + pp.region + '</span><span class="rus">RUS <i class="flag"></i></span></span></span>';
  };
  /* Клавиатура госномера (п.50): по шаблону буква-3 цифры-2 буквы-регион 2–3 цифры. */
  U.plateKeyboard = function (o) {
    let val = SM.normPlate(o.value || ""), free = !!o.free && !!val && !SM.plateValid(val);
    const rows = [["1","2","3","4","5","6","7","8","9","0"], ["А","В","Е","К","М","Н","О","⌫"], ["Р","С","Т","У","Х","Готово"]];
    const body = '<div style="text-align:center"><div data-disp></div><div class="hint" data-hint style="margin-top:6px"></div></div>' + (o.extra || "") +
      '<div class="kbd">' + rows.map((r, i) => '<div class="kr" style="grid-template-columns:repeat(' + (i === 0 ? 10 : r.length) + ',1fr)">' + r.map((k) => '<button class="key ' + (k === "Готово" ? "done wide" : k === "⌫" ? "del" : "") + '" data-k="' + k + '">' + k + "</button>").join("") + "</div>").join("") + "</div>" +
      '<div class="row" style="margin-top:10px;justify-content:space-between"><button class="btn sm ghost" data-free>Другой номер</button><button class="btn sm ghost" data-clr>Стереть всё</button></div>';
    const m = U.modal({ title: o.title || "Госномер", body, wide: false, mount: (el, close) => {
      const isL = (c) => SM.PLATE_LETTERS.indexOf(c) >= 0;
      function allowed(k) {
        if (free) return true;
        const n = val.length;
        if (n === 0 || n === 4 || n === 5) return isL(k);
        if (n >= 1 && n <= 3) return /\d/.test(k);
        if (n >= 6 && n <= 8) return /\d/.test(k);
        return false;
      }
      function draw() {
        el.querySelector("[data-disp]").innerHTML = val ? U.plateHtml(val) : '<span class="plate empty"><span class="num">' + (free ? "любой номер" : "А 000 АА 00") + "</span></span>";
        const ok = free ? val.length >= 1 : SM.plateValid(val);
        el.querySelectorAll("[data-k]").forEach((b) => { const k = b.dataset.k; if (k === "⌫") b.disabled = !val; else if (k === "Готово") b.disabled = !ok; else b.disabled = !allowed(k); });
        el.querySelector("[data-free]").textContent = free ? "Обычный номер" : "Другой номер";
        el.querySelector("[data-hint]").textContent = free ? "Свободный ввод: любые буквы и цифры (транзит, иностранный, мото)" : ["Буква", "Цифра", "Цифра", "Цифра", "Буква", "Буква", "Регион", "Регион", "Регион (3-я цифра или «Готово»)"][Math.min(val.length, 8)] + " · активны только подходящие кнопки";
      }
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-k]");
        if (b) { const k = b.dataset.k; if (k === "⌫") val = val.slice(0, -1); else if (k === "Готово") { close(); o.onDone(val); return; } else if (allowed(k)) val += k; draw(); }
        if (e.target.closest("[data-free]")) { free = !free; if (!free && !/^[АВЕКМНОРСТУХ]?\d{0,3}[АВЕКМНОРСТУХ]{0,2}\d{0,3}$/.test(val)) val = ""; draw(); }
        if (e.target.closest("[data-clr]")) { val = ""; draw(); }
        if (o.onExtra) o.onExtra(e, close);
      });
      draw();
    } });
    return m;
  };
  /* ---------- Нумпад: поле пустое, нельзя 0 ---------- */
  U.numpad = function (o) {
    let v = "", mode = o.mode || null;
    const body = (o.text ? '<div style="margin-bottom:8px">' + o.text + "</div>" : "") + (o.modes ? '<div class="pill-tabs" data-modes>' + o.modes.map((x) => '<button class="tab" data-mode="' + x.key + '">' + x.label + "</button>").join("") + "</div>" : "") +
      '<div class="numdisp empty" data-disp></div><div class="hint" data-hint style="margin-top:6px;min-height:1.2em"></div><div class="kbd"><div class="kr" style="grid-template-columns:repeat(3,1fr)">' + ["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => '<button class="key ' + (k === "C" || k === "⌫" ? "del" : "") + '" data-n="' + k + '">' + k + "</button>").join("") + "</div></div>";
    U.modal({ title: o.title, body, foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-ok disabled>' + (o.okLabel || "Готово") + "</button>", mount: (el, close) => {
      function draw() {
        const d = el.querySelector("[data-disp]"); d.classList.toggle("empty", !v);
        d.textContent = v ? SM.num(v) + (mode === "pct" ? " %" : o.unit != null ? o.unit : " ₽") : (o.placeholder || "введите сумму");
        const n = Number(v); const err = o.validate ? o.validate(n, mode) : null;
        el.querySelector("[data-ok]").disabled = !v || (!o.allowZero && !(n > 0)) || !!err;
        el.querySelector("[data-hint]").textContent = err || (o.hint || "");
        el.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
      }
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-n]"); if (b) { const k = b.dataset.n; if (k === "C") v = ""; else if (k === "⌫") v = v.slice(0, -1); else if (v.length < 7) v = (v === "0" ? "" : v) + k; draw(); }
        const mb = e.target.closest("[data-mode]"); if (mb) { mode = mb.dataset.mode; draw(); }
        if (e.target.closest("[data-ok]")) { const r = o.onDone(Number(v), mode); if (r !== false) close(); }
      });
      draw();
    } });
  };
  /* ---------- PIN владельца: повторно при уходе из админки и через 3 мин бездействия ---------- */
  let pinUntil = 0;
  U.pinOk = () => pinUntil > Date.now();
  U.pinTouch = () => { if (U.pinOk()) pinUntil = Date.now() + (U.S().settings.pinIdleMin || 3) * 60e3; };
  U.pinLock = () => { pinUntil = 0; };
  ["click", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, () => U.pinTouch(), true));
  setInterval(() => { if (!U.pinOk() && U.needsPinView()) { U.toast("PIN истёк — 3 минуты без действий"); U.go("kassa"); } }, 5000);
  U.needsPinView = () => U.view === "admin";
  U.requirePin = function (cb, why) {
    if (U.pinOk()) return cb();
    let v = "";
    U.modal({ title: "🔒 PIN владельца", body: '<div style="margin-bottom:8px">' + (why || "Раздел только для владельца") + '</div><div class="numdisp empty" data-disp>••••</div><div class="hint" style="text-align:center;margin-top:6px">Демо-PIN: <b>1234</b></div><div class="kbd"><div class="kr" style="grid-template-columns:repeat(3,1fr)">' + ["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => '<button class="key ' + (k === "C" || k === "⌫" ? "del" : "") + '" data-n="' + k + '">' + k + "</button>").join("") + "</div></div>", mount: (el, close) => {
      const d = el.querySelector("[data-disp]");
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-n]"); if (!b) return;
        const k = b.dataset.n; if (k === "C") v = ""; else if (k === "⌫") v = v.slice(0, -1); else if (v.length < 6) v += k;
        d.textContent = v ? "•".repeat(v.length) : "••••"; d.classList.toggle("empty", !v);
        if (v.length >= 4 && v === U.S().settings.pin) { pinUntil = Date.now() + (U.S().settings.pinIdleMin || 3) * 60e3; close(); cb(); }
        else if (v.length >= U.S().settings.pin.length && v !== U.S().settings.pin) { d.textContent = "Неверный PIN"; v = ""; }
      });
    } });
  };
  /* ---------- Печать ---------- */
  U.print = function (html, pageCss) {
    let root = $("#print-root"); if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
    root.innerHTML = html;
    let st = $("#page-style"); if (!st) { st = document.createElement("style"); st.id = "page-style"; document.head.appendChild(st); }
    st.textContent = "@page{" + (pageCss || "size:A4;margin:12mm") + "}";
    document.body.classList.add("printing");
    setTimeout(() => { try { window.print(); } catch (_) {} setTimeout(() => document.body.classList.remove("printing"), 500); }, 50);
  };
  /* ---------- «Готово» для экранной клавиатуры и тап вне поля (п.51) ---------- */
  document.addEventListener("focusin", (e) => { if (e.target.matches("input:not([type=checkbox]):not([type=radio]),textarea")) document.body.classList.add("typing"); });
  document.addEventListener("focusout", () => setTimeout(() => { if (!document.activeElement || !document.activeElement.matches("input,textarea")) document.body.classList.remove("typing"); }, 50));
  document.addEventListener("pointerdown", (e) => { const a = document.activeElement; if (a && a.matches("input,textarea") && !e.target.closest("input,textarea,select,label,#kbd-done")) a.blur(); });
  document.addEventListener("click", (e) => { if (e.target.id === "kbd-done" && document.activeElement) document.activeElement.blur(); });
  /* ---------- Действия ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
    const f = U.act[el.dataset.act]; if (f) { e.preventDefault(); f(el, e); }
  });
  /* ---------- Роутер и шапка ---------- */
  U.NAV = [ ["kassa", "Касса"], ["cars", "Машины"], ["shift", "Смена"], ["queue", "Очередь"], ["clients", "Клиенты"], ["storage", "Хранение"], ["warehouse", "Склад"], ["bookings", "Записи"], ["admin", "🔒 Админ"] ];
  U.go = function (v) {
    if (v === "admin" && !U.pinOk()) return U.requirePin(() => U.go("admin"));
    if (U.view === "admin" && v !== "admin") U.pinLock();
    U.view = v; U.render(); window.scrollTo(0, 0);
    try { history.replaceState(null, "", "#" + v); } catch (_) {}
  };
  U.act.go = (el) => U.go(el.dataset.v);
  U.badges = function (S) {
    const tk = SM.dayKey(Date.now());
    return { cars: SM.orders.open(S).length + SM.paint.active(S).length, queue: SM.live.waiting(S).length, storage: S.storage.filter((r) => ["soon", "overdue"].indexOf(SM.storage.status(S, r)) >= 0).length, bookings: S.bookings.filter((b) => b.date === tk && b.status === "new").length };
  };
  U.renderHeader = function () {
    const S = U.S(), b = U.badges(S), sh = SM.shift.current(S);
    const opName = S.ui.operator && sh && SM.shift.atWork(S, sh).indexOf(S.ui.operator) >= 0 ? SM.empName(S, S.ui.operator) : "выбрать";
    $("#hdr").innerHTML = '<img class="brand" src="logo-header.png" alt="Шинамашина"><button class="op-chip" data-act="operator">Кассир<b>' + SM.esc(opName) + "</b></button><nav class=\"nav\">" +
      U.NAV.map(([k, l]) => '<button class="nb ' + (U.view === k || (U.view === "order" && k === "kassa") ? "active" : "") + '" data-act="go" data-v="' + k + '">' + l + (b[k] ? '<span class="badge ' + (k === "warehouse" || k === "storage" ? "warn" : "") + '">' + b[k] + "</span>" : "") + "</button>").join("") + "</nav>" + (U.isStandalone() ? "" : '<button class="nb fs-btn" data-act="fullscreen" title="' + (document.fullscreenElement ? "Выйти из полного экрана" : "Во весь экран (без панели Chrome)") + '">' + (document.fullscreenElement ? "🗗" : "⛶") + "</button>");
    // Предупреждения об остатках склада на кассе не показываем — только на странице владельца (owner.html).
    $("#banner").innerHTML = "";
  };
  U.act.operator = function () {
    const S = U.S(), sh = SM.shift.current(S);
    if (!sh) return U.toast("Сначала откройте смену", true);
    const ids = SM.shift.atWork(S, sh);
    U.modal({ title: "Кто сейчас на кассе?", body: '<div class="hint" style="margin-bottom:8px">Имя пишется в историю заказа (кто добавил услугу, дал скидку, сменил статус).</div>' + ids.map((id) => '<button class="btn block ' + (S.ui.operator === id ? "primary" : "") + '" style="margin-bottom:8px" data-op="' + id + '">' + SM.esc(SM.empName(S, id)) + "</button>").join(""), mount: (el, close) => el.addEventListener("click", (e) => { const b = e.target.closest("[data-op]"); if (b) { S.ui.operator = b.dataset.op; close(); U.commit(); } }) });
  };
  /* ---------- Полный экран и установка как приложение (PWA) ---------- */
  U.isStandalone = () => !!(window.matchMedia && (matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches));
  U.isFullscreen = () => !!document.fullscreenElement || U.isStandalone();
  U.act.fullscreen = function () {
    const el = document.documentElement;
    if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); return; }
    if (!el.requestFullscreen) return U.alert("Полный экран", "Этот браузер не умеет полноэкранный режим. Установите кассу как приложение: меню Chrome ⋮ → «Добавить на главный экран».");
    el.requestFullscreen({ navigationUI: "hide" }).catch((e) => U.toast("Полный экран не включился: " + e.message, true));
  };
  document.addEventListener("fullscreenchange", () => { if (U.renderHeader && document.getElementById("hdr")) U.renderHeader(); });
  U.installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); U.installEvt = e; });
  window.addEventListener("appinstalled", () => { U.installEvt = null; U.toast("Касса установлена как приложение"); });
  U.act.install = function () {
    if (U.isStandalone()) return U.toast("Уже открыто как приложение");
    if (U.installEvt) { U.installEvt.prompt(); U.installEvt.userChoice.then(() => { U.installEvt = null; }); return; }
    U.alert("Установить кассу на планшет", '<ol style="margin-left:18px;line-height:1.5"><li>Откройте кассу в Chrome на планшете (по ссылке https://…).</li><li>Меню Chrome <b>⋮</b> → <b>«Добавить на главный экран»</b> (или «Установить приложение»).</li><li>Запускайте кассу с иконки «Касса демо» — она откроется <b>во весь экран, без адресной строки и вкладок Chrome</b>.</li></ol><div class="hint" style="margin-top:8px">Кнопка ⛶ в шапке включает полный экран и без установки (выход — жест «назад» или та же кнопка). Режим киоска Android лучше включать в APK.</div>');
  };
  /* ---------- Печать на сетевой принтер (только APK) ---------- */
  U.netPrint = function (lines, title) {
    const S = U.S(); const r = SM.printer.print(S, lines);
    if (r.ok) { U.toast("Отправлено на принтер " + S.settings.printerIp); return r; }
    const preview = '<pre class="ticket-prev">' + lines.map((l) => { l = typeof l === "string" ? { text: l } : l; const t = SM.esc(l.text || ""); return '<div style="text-align:' + (l.align || "left") + ";" + (l.big ? "font-size:1.6em;" : "") + (l.bold ? "font-weight:900" : "") + '">' + (t || "&nbsp;") + "</div>"; }).join("") + "</pre>";
    U.modal({ title: title || "Печать", body: '<div class="banner" style="margin:0 0 10px">' + SM.esc(r.msg) + "</div>" + (r.reason === "browser" ? '<div class="hint" style="margin-bottom:8px">Так талон будет выглядеть на ленте 58/80 мм (ESC/POS, ' + r.bytes.length + " байт подготовлено):</div>" + preview : "") });
    return r;
  };
  U.render = function () {
    U.renderHeader();
    const v = U.views[U.view] || U.views.kassa;
    const el = $("#view"); el.className = "v-" + U.view; document.body.classList.toggle("fit", U.view === "kassa");
    v(el, U.S());
  };
  U.start = function () {
    SM.load();
    SM.onSave((external) => { if (external) U.render(); });
    const h = (location.hash || "").slice(1);
    U.view = U.views[h] && h !== "admin" ? h : "kassa";
    U.render();
    // Напоминания о записи — автоматически раз в минуту (в демо отправка имитируется)
    U.runReminders = function () { const S = U.S(); const n = SM.reminders.run(S); if (!n.length) return; SM.save(); n.filter((e) => e.status === "sent").forEach((e) => U.toast("🔔 Напоминание " + SM.reminders.kindLabel(e.kind) + " → " + e.name + " (" + SM.reminders.channelLabel(e.channel) + ", имитация)")); if (U.view === "bookings" && !document.querySelector(".modal-bg")) U.render(); };
    U.runReminders(); setInterval(U.runReminders, 60000);
    setInterval(() => { if (["shift", "admin", "cars", "queue"].indexOf(U.view) >= 0 && !document.querySelector(".modal-bg") && !document.body.classList.contains("typing")) U.render(); }, 30000);
  };
})();
