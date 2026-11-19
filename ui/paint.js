/* Покраска дисков: приём (наряд без оплаты), список «В покраске», добавление услуг из прайса, выдача одним чеком, акт приёма. */
(function () {
  const SM = window.SM, U = SM.ui, A = U.act, esc = SM.esc, PN = SM.paint;
  const chip = (p) => '<span class="chip ' + (p.status === "ready" ? "ok" : p.status === "paint" ? "soon" : "") + '">' + PN.STATUS[p.status] + "</span>";
  const who = (S, p) => { const c = p.clientId && SM.client(S, p.clientId); return esc(p.name || (c && c.name) || "") + (p.phone ? " · " + SM.phoneShow(p.phone) : ""); };
  U.paintCard = function (S, p) {
    const t = PN.totals(S, p);
    return '<div class="card paint-card ' + p.status + '"><div class="row">' + (p.plate ? U.plateHtml(p.plate, true) : "") + "<b>" + PN.title(p) + '</b><span style="margin-left:auto">' + chip(p) + '</span></div><div style="margin-top:6px">' + who(S, p) + '</div><div class="hint">' + p.disks + " диск(а) " + esc(p.radius) + " · «" + esc(p.color) + "» · " + (p.caps ? "с колпачками" : "без колпачков") + " · " + (p.tires ? "с резиной (" + esc(p.tireBrand) + ")" : "без резины") + (p.straighten ? " · правка " + p.straighten.qty + " шт" : "") + '</div><div class="hint">Принят ' + SM.fmtDate(p.createdAt) + " · позиций: " + p.items.length + '</div><div class="row" style="margin-top:6px"><span class="grow">К оплате при выдаче: <b style="font-size:1.2rem">' + SM.fmt(t.total) + '</b></span><button class="btn sm primary" data-act="paintOpen" data-id="' + p.id + '">Открыть</button></div></div>';
  };
  U.paintListHtml = function (S, compact) {
    const list = PN.active(S);
    if (!list.length) return compact ? "" : '<div class="card empty">В покраске сейчас ничего нет</div>';
    return '<div class="h2" style="margin:4px 0 8px">🎨 В покраске: ' + list.length + " · к оплате при выдаче " + SM.fmt(PN.due(S)) + '</div><div class="cars" style="margin-bottom:12px">' + list.map((p) => U.paintCard(S, p)).join("") + "</div>";
  };
  U.paintTab = function (S) {
    return '<div class="paint-tab"><div class="tiles" style="grid-template-columns:1fr 1fr;flex:none"><div class="tile"><div class="nm">Принять диски в покраску</div><div class="sub">Отложенный заказ-наряд: сейчас денег не берём. Колпачки, резина, правка, любые услуги из прайса — всё оплачивается одним чеком при выдаче.</div><button class="addkit" data-act="paintNew">+ Принять в покраску</button></div>' +
      '<div class="tile"><div class="nm">В покраске: ' + PN.active(S).length + '</div><div class="sub">К оплате при выдаче: ' + SM.fmt(PN.due(S)) + '</div><button class="one" data-act="go" data-v="cars">Все наряды → «Машины»</button></div></div>' +
      '<div class="paint-list">' + U.paintListHtml(S) + "</div></div>";
  };
  /* ---------- Приём в покраску ---------- */
  /* Выбор услуги из прайса: выбрал в списке — услуга сразу добавляется в наряд и в «Итого» (баг 19.11: раньше нужно было
     отдельно нажимать «+ Добавить», и если не нажать — сумма не менялась). Комплект — ×1, поштучные — ×4, количество правится −/+.
     Только для услуг «цена вводится» появляются поля цены и кнопка «+ Добавить». */
  function svcPicker(S, ctx) {
    const cat = SM.prices.catalog(S.prices, ctx.typeKey, ctx.radius).filter((t) => !t.gift && (t.price != null || t.manual));
    return '<div class="row"><select class="inp" data-svc style="flex:2;min-width:220px"><option value="">+ Выберите услугу — добавится сразу…</option>' + cat.map((t) => '<option value="' + esc(t.key) + '">' + esc(t.name) + " — " + (t.manual ? "цена вводится" : SM.fmt(t.price) + (t.kind === "kit" ? " (комплект)" : " / шт")) + "</option>").join("") + '</select><span data-manualbox style="display:none" class="row"><select class="inp" data-svq style="flex:0 0 90px"><option>1</option><option>2</option><option>4</option></select><input class="inp" data-svp type="number" inputmode="numeric" placeholder="цена, ₽" style="flex:0 0 120px"><button class="btn" data-svadd>+ Добавить</button></span></div>';
  }
  /** onAdd({ key, qty, typeKey, radius, price, name }) → true, если добавлено. */
  function bindPicker(m, S, ctxFn, onAdd) {
    const sel = () => m.querySelector("[data-svc]");
    m.addEventListener("change", (e) => {
      if (!e.target.matches("[data-svc]")) return;
      const key = e.target.value, box = m.querySelector("[data-manualbox]"); if (!key) { box.style.display = "none"; return; }
      const c = ctxFn(); const tile = SM.prices.find(S.prices, key, c.typeKey, c.radius); if (!tile) return;
      if (tile.manual) { box.style.display = ""; m.querySelector("[data-svp]").focus(); return; }
      box.style.display = "none";
      if (!(tile.price > 0)) return U.toast("Нет цены для " + c.radius, true);
      onAdd({ key, qty: tile.kind === "kit" ? 1 : 4, typeKey: c.typeKey, radius: c.radius, price: tile.price, name: tile.name + (tile.radial ? " (" + SM.prices.typeLabel(c.typeKey) + ")" : "") });
      const s2 = sel(); if (s2) s2.value = "";
    });
    m.addEventListener("click", (e) => {
      if (!e.target.closest("[data-svadd]")) return;
      const key = sel().value, c = ctxFn(); const tile = key && SM.prices.find(S.prices, key, c.typeKey, c.radius); if (!tile) return U.toast("Выберите услугу", true);
      const price = Math.round(Number(m.querySelector("[data-svp]").value));
      if (!(price > 0)) return U.toast("Введите цену для «" + tile.name + "»", true);
      onAdd({ key, qty: Number(m.querySelector("[data-svq]").value) || 1, typeKey: c.typeKey, radius: c.radius, price, name: tile.name });
      sel().value = ""; m.querySelector("[data-manualbox]").style.display = "none"; m.querySelector("[data-svp]").value = "";
    });
  }
  U.paintCondHtml = (sel) => '<div class="cond-grid" data-conds>' + PN.DISK_CONDITIONS.map((x) => '<label><input type="checkbox" data-cond value="' + esc(x) + '"' + ((sel || []).indexOf(x) >= 0 ? " checked" : "") + "> " + esc(x) + "</label>").join("") + "</div>";
  U.paintForm = function () {
    const S = U.S(); let plate = "", clientId = null; const services = [];
    const R = SM.prices.RADII, T = SM.prices.TYPES;
    const body = '<div class="grid2"><div><label class="fld">Госномер</label><button class="btn block ghost" data-pl style="min-height:60px">' + U.plateHtml("", true) + '</button></div><div><label class="fld">Телефон</label><input class="inp" type="tel" inputmode="tel" data-f="phone" placeholder="+7 900 000-00-00"></div>' +
      '<div><label class="fld">Имя клиента</label><input class="inp" data-f="name"></div><div><label class="fld">Автомобиль</label><input class="inp" data-f="car"></div>' +
      '<div><label class="fld">Количество дисков</label><select class="inp" data-f="disks">' + [1, 2, 3, 4, 5, 6, 8].map((n) => "<option" + (n === 4 ? " selected" : "") + ">" + n + "</option>").join("") + '</select></div><div><label class="fld">Радиус</label><select class="inp" data-f="radius">' + R.map((r) => "<option" + (r === S.ui.radius ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div>" +
      '<div><label class="fld">Цвет</label><input class="inp" data-f="color" placeholder="например, чёрный матовый"></div><div><label class="fld">Сумма покраски, ₽</label><input class="inp" type="number" inputmode="numeric" data-f="paintPrice" placeholder="за все диски"></div></div>' +
      '<label class="fld">Состояние дисков при приёмке <small class="muted">(можно несколько — попадёт в акт)</small></label>' + U.paintCondHtml([]) +
      '<div class="checks"><label class="check big"><input type="checkbox" data-f="caps"> С колпачками</label><label class="check big"><input type="checkbox" data-f="tires"> С резиной</label><label class="check big"><input type="checkbox" data-f="straighten"> Нужна правка дисков</label></div>' +
      '<div data-tirebox style="display:none"><label class="fld">Марка резины</label><input class="inp" data-f="tireBrand" placeholder="например, Nokian Hakkapeliitta"></div>' +
      '<div data-strbox class="grid2" style="display:none"><div><label class="fld">Правка: сколько дисков</label><select class="inp" data-f="strQty">' + [1, 2, 3, 4, 5, 6, 8].map((n) => "<option>" + n + "</option>").join("") + '</select></div><div><label class="fld">Сумма правки, ₽</label><input class="inp" type="number" inputmode="numeric" data-f="strSum"></div></div>' +
      '<div class="h2" style="margin-top:12px">Услуги из прайса в этот наряд <small class="muted">(снятие/установка, монтаж, балансировка…)</small></div><div class="row" style="margin-bottom:6px"><label class="fld" style="margin:0">Тип авто</label><select class="inp" data-f="typeKey" style="max-width:240px">' + T.map((t) => '<option value="' + t.key + '"' + (t.key === S.ui.type ? " selected" : "") + ">" + t.label + "</option>").join("") + '</select></div><div data-picker></div><div data-svlist class="svlist"></div>' +
      '<label class="fld">Комментарий</label><input class="inp" data-f="comment"><div class="banner" style="margin:10px 0 0">Оплата при выдаче. Сейчас деньги не берём — наряд попадёт в список «В покраске».</div><div data-total class="h2" style="margin-top:8px"></div><div data-err class="down" style="font-weight:700;margin-top:6px"></div>';
    U.modal({ title: "🎨 Приём дисков в покраску", wide: true, body, foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-save>Принять в покраску (без оплаты)</button>', mount: (m, close) => {
      const f = (k) => m.querySelector('[data-f="' + k + '"]');
      const ctx = () => ({ typeKey: f("typeKey").value, radius: f("radius").value });
      const drawPicker = () => { m.querySelector("[data-picker]").innerHTML = svcPicker(S, ctx()); };
      const parts = () => { const pp = Number(f("paintPrice").value) || 0, st = f("straighten").checked ? Number(f("strSum").value) || 0 : 0, sv = services.reduce((a, x) => a + x.price * x.qty, 0); return { pp, st, sv, total: pp + st + sv }; };
      const drawList = () => {
        m.querySelector("[data-svlist]").innerHTML = services.map((x, i) => '<div class="kv"><span>' + esc(x.name) + (x.radius ? " " + x.radius : "") + ' <span class="svq-ctl"><button class="btn sm ghost" data-svdec="' + i + '">−</button><b>×' + x.qty + '</b><button class="btn sm ghost" data-svinc="' + i + '">+</button></span></span><b>' + SM.fmt(x.price * x.qty) + ' <button class="btn sm ghost" data-svrm="' + i + '">✕</button></b></div>').join("");
        const t = parts();
        m.querySelector("[data-total]").innerHTML = "Итого к оплате при выдаче: " + SM.fmt(t.total) + '<div class="hint" style="font-weight:600">покраска ' + SM.fmt(t.pp) + (t.st ? " + правка " + SM.fmt(t.st) : "") + (t.sv ? " + услуги из прайса " + SM.fmt(t.sv) : "") + "</div>";
      };
      const toggles = () => { m.querySelector("[data-tirebox]").style.display = f("tires").checked ? "" : "none"; m.querySelector("[data-strbox]").style.display = f("straighten").checked ? "" : "none"; drawList(); };
      m.querySelector("[data-pl]").onclick = () => U.plateKeyboard({ title: "Госномер клиента", value: plate, onDone: (p) => { plate = p; m.querySelector("[data-pl]").innerHTML = U.plateHtml(p, true); const fc = SM.clients.findByPlate(S, p); if (fc) { fillClient(fc.client, fc.car); U.toast("Клиент найден: " + (fc.client.name || SM.phoneShow(fc.client.phone)) + " · " + SM.clients.label(fc.car)); } } });
      m.addEventListener("change", (e) => { if (e.target.matches('[data-f="tires"],[data-f="straighten"]')) toggles(); if (e.target.matches('[data-f="typeKey"],[data-f="radius"]')) drawPicker(); if (e.target.matches("[data-f]")) drawList(); });
      m.addEventListener("input", (e) => { if (e.target.matches('[data-f="paintPrice"],[data-f="strSum"]')) drawList(); });
      m.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-svrm]"); if (rm) { services.splice(Number(rm.dataset.svrm), 1); drawList(); return; }
        const inc = e.target.closest("[data-svinc]"); if (inc) { services[Number(inc.dataset.svinc)].qty++; drawList(); return; }
        const dec = e.target.closest("[data-svdec]"); if (dec) { const x = services[Number(dec.dataset.svdec)]; if (x.qty > 1) x.qty--; else services.splice(Number(dec.dataset.svdec), 1); drawList(); return; }
      });
      bindPicker(m, S, ctx, (x) => { const same = services.find((y) => y.key === x.key && y.price === x.price && y.radius === x.radius && y.typeKey === x.typeKey); if (same) same.qty += x.qty; else services.push(x); drawList(); U.toast("Добавлено: " + x.name + " ×" + x.qty + " — итого " + SM.fmt(parts().total)); });
      const fillClient = (c, car) => { if (!c) return; car = car || SM.clients.cars(c)[0] || {}; if (c.name) f("name").value = c.name; if (c.phone) f("phone").value = SM.phoneShow(c.phone); if (!f("car").value) f("car").value = car.car || ""; if (!plate && car.plate) { plate = car.plate; m.querySelector("[data-pl]").innerHTML = U.plateHtml(plate, true); } if (car.wheel_size && R.indexOf(car.wheel_size) >= 0) { f("radius").value = car.wheel_size; drawPicker(); } clientId = c.id; };
      U.clientSuggest(f("phone"), (x) => { fillClient(x.client, x.car); U.toast("Клиент из базы: " + (x.client.name || SM.phoneShow(x.client.phone))); });
      U.clientSuggest(f("name"), (x) => { fillClient(x.client, x.car); U.toast("Клиент из базы: " + (x.client.name || SM.phoneShow(x.client.phone))); });
      m.querySelector("[data-save]").onclick = () => {
        const d = { plate, clientId, diskCondition: Array.from(m.querySelectorAll("[data-cond]:checked")).map((x) => x.value), phone: SM.phoneVal(f("phone").value), name: f("name").value.trim(), car: f("car").value.trim(), radius: f("radius").value, disks: f("disks").value, color: f("color").value, caps: f("caps").checked, tires: f("tires").checked, tireBrand: f("tireBrand").value, straighten: f("straighten").checked ? { qty: f("strQty").value, sum: f("strSum").value } : null, paintPrice: f("paintPrice").value, services: services.map((x) => ({ key: x.key, qty: x.qty, typeKey: x.typeKey, radius: x.radius, price: x.price })), comment: f("comment").value };
        const S2 = U.S(); const r = PN.create(S2, d, U.who());
        if (!r.ok) { m.querySelector("[data-err]").textContent = r.msg; return; }
        close(); SM.save(); U.render(); U.toast(PN.title(r.order) + " принят в покраску — оплата при выдаче");
        A.paintOpen({ dataset: { id: r.order.id } });
      };
      drawPicker(); toggles();
    } });
  };
  A.paintNew = () => U.paintForm();
  /* ---------- Наряд: услуги, готово, выдача с оплатой ---------- */
  A.paintOpen = (el) => {
    const S = U.S(); const p = PN.get(S, el.dataset.id); if (!p) return;
    const t = PN.totals(S, p), open = p.status === "paint" || p.status === "ready", sh = SM.shift.current(S);
    const ctx = { typeKey: S.ui.type, radius: p.radius && SM.prices.RADII.indexOf(p.radius) >= 0 ? p.radius : S.ui.radius };
    const body = '<div class="row">' + (p.plate ? U.plateHtml(p.plate, true) : "") + '<div class="grow"><b>' + who(S, p) + "</b>" + (p.car ? "<br><small>" + esc(p.car) + "</small>" : "") + "</div>" + chip(p) + "</div>" +
      '<div class="kv" style="margin-top:8px"><span>Диски</span><b>' + p.disks + " шт " + esc(p.radius) + " · цвет «" + esc(p.color) + '»</b></div><div class="kv"><span>Колпачки</span><b>' + (p.caps ? "с колпачками" : "без колпачков") + '</b></div><div class="kv"><span>Резина</span><b>' + (p.tires ? "с резиной: " + esc(p.tireBrand) : "без резины") + '</b></div><div class="kv"><span>Правка</span><b>' + (p.straighten ? p.straighten.qty + " шт · " + SM.fmt(p.straighten.sum) : "не нужна") + "</b></div>" + (p.comment ? '<div class="kv"><span>Комментарий</span><b>' + esc(p.comment) + "</b></div>" : "") + '<div class="kv"><span>Состояние дисков</span><b>' + esc(PN.condText(p) || "не указано") + "</b></div>" +
      '<div class="h2" style="margin-top:10px">Позиции наряда</div>' + p.items.map((i) => { const q = open && i.key !== "paint" && i.key !== "f:Правка дисков"; return '<div class="kv"><span>' + esc(i.name) + (i.radius && i.key !== "paint" ? " " + i.radius : "") + (q ? ' <span class="svq-ctl"><button class="btn sm ghost" data-dec="' + i.id + '">−</button><b>×' + i.qty + '</b><button class="btn sm ghost" data-inc="' + i.id + '">+</button></span>' : i.qty > 1 ? " ×" + i.qty : "") + "</span><b>" + SM.fmt(i.price * i.qty) + (open && i.key !== "paint" ? ' <button class="btn sm ghost" data-rm="' + i.id + '">✕</button>' : "") + "</b></div>"; }).join("") +
      (open ? '<div class="h2" style="margin-top:10px">+ Услуга из прайса <small class="muted">(' + ctx.radius + " · " + SM.prices.typeLabel(ctx.typeKey) + ")</small></div>" + svcPicker(S, ctx) : "") +
      '<div class="tot"><span>' + (open ? "К оплате при выдаче" : "Оплачено") + '</span><span class="big-total">' + SM.fmt(t.total) + "</span></div>" +
      '<div class="h2" style="margin-top:10px">📷 Подписанный акт</div><button class="btn sm" data-actphoto>📷 Сфотографировать акт</button><div class="thumbs">' + U.photoThumbs(p.actPhotos) + "</div>" +
      (open ? (sh ? '<div class="h2" style="margin-top:8px">Выдать клиенту и оплатить одним чеком</div><div class="paybtns"><button class="pay cash" data-pay="cash">Наличные</button><button class="pay card" data-pay="card">Карта</button><button class="pay qr" data-pay="qr">QR / СБП</button></div>' : '<div class="banner" style="margin:10px 0 0">Смена не открыта — выдать с оплатой нельзя.</div>') : "") +
      '<details style="margin-top:10px"><summary class="hint">История наряда (' + p.history.length + ')</summary><div class="hist">' + p.history.slice().reverse().map((h) => "<div><time>" + SM.fmtDT(h.ts) + "</time><b>" + esc(h.who) + ":</b> " + esc(h.text) + "</div>").join("") + "</div></details>";
    const foot = '<button class="btn" data-act="paintAct" data-id="' + p.id + '">🖨 Акт приёма</button>' + (p.status === "paint" ? '<button class="btn ok" data-ready>✓ Покрашено — готово</button>' : "") + (open ? '<button class="btn danger" data-cancel>Отменить наряд</button>' : "") + '<button class="btn" data-close>Закрыть</button>';
    U.modal({ title: "🎨 " + PN.title(p), wide: true, body, foot, mount: (m, close) => {
      const reopen = () => { close(); SM.save(); U.render(); A.paintOpen({ dataset: { id: p.id } }); };
      if (open) bindPicker(m, S, () => ctx, (x) => { const r = PN.addService(S, p, x, U.who()); if (!r.ok) return U.toast(r.msg, true); U.toast("Добавлено: " + x.name + " — к оплате " + SM.fmt(PN.totals(S, p).total)); reopen(); });
      m.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-rm]"); if (rm) { const r = PN.removeItem(S, p, rm.dataset.rm, U.who()); if (!r.ok) return U.toast(r.msg, true); return reopen(); }
        const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
        if (inc || dec) { const it = p.items.find((i) => i.id === (inc || dec).dataset[inc ? "inc" : "dec"]); const r = PN.setQty(S, p, it.id, it.qty + (inc ? 1 : -1), U.who()); if (!r.ok) return U.toast(r.msg, true); return reopen(); }
        if (e.target.closest("[data-actphoto]")) return U.takePhoto((data) => { const id = SM.photos.put(data); if (!id) return U.toast("Не хватило места для фото в браузере (демо)", true); SM.attachActPhoto(p, id, U.who()); U.toast("Фото акта прикреплено к наряду"); reopen(); });
        if (e.target.closest("[data-ready]")) { PN.setReady(S, p, U.who()); U.toast("Готово — можно звонить клиенту"); return reopen(); }
        if (e.target.closest("[data-cancel]")) { close(); return U.confirm("Отменить " + PN.title(p) + "?", "Наряд уйдёт из «В покраске». Денег по нему не брали.", "Отменить наряд", () => { PN.cancel(S, p, U.who()); U.commit(); }, true); }
        const pb = e.target.closest("[data-pay]"); if (!pb) return;
        const pay = pb.dataset.pay, ru = { cash: "Наличные", card: "Карта", qr: "QR / СБП" }[pay];
        close();
        U.modal({ title: "Подтвердите оплату", body: '<div style="font-size:1.15rem">' + PN.title(p) + " · " + ru + ': <b class="big-total">' + SM.fmt(t.total) + '</b></div><div class="hint" style="margin-top:8px">Один чек на всё: покраска' + (p.straighten ? ", правка" : "") + (p.items.length > (p.straighten ? 2 : 1) ? ", услуги из прайса" : "") + ".</div>", foot: '<button class="btn" data-close>Назад</button><button class="btn ok" data-ok>✓ Оплата получена — выдать и пробить чек</button>', mount: (m2, close2) => (m2.querySelector("[data-ok]").onclick = (ev) => {
          ev.target.disabled = true; close2(); const r = PN.pay(S, p, pay, U.who()); if (!r.ok) return U.alert("Не получилось", esc(r.msg));
          SM.save(); U.render();
          U.modal({ title: "✓ Чек №" + r.receipt.no + " (демо) — " + PN.title(p) + " выдан", body: r.receipt.items.map((i) => '<div class="kv"><span>' + esc(i.name) + " ×" + i.qty + "</span><b>" + SM.fmt(i.price * i.qty) + "</b></div>").join("") + '<div class="tot"><span>' + ru + '</span><span class="big-total">' + SM.fmt(r.receipt.total) + '</span></div><div class="hint" style="margin-top:8px">Фискальный чек не печатается, Эвотор не подключён (демо).</div>', foot: '<button class="btn primary" data-close>Готово</button>' });
        }) });
      });
    } });
  };
  /* ---------- Акт приёма-передачи (печать A4) ---------- */
  A.paintAct = (el) => {
    const S = U.S(); const p = PN.get(S, el.dataset.id); const t = PN.totals(S, p);
    U.print('<div class="act"><div style="text-align:right;font-size:11px">ИП Мишахин Артем Алексеевич · ИНН 773580864120 · ОГРНИП 325774600692668<br>Андреевка, Алабушевская ул., 2 стр. 2 · +7 (995) 506-95-62</div><h2>АКТ ПРИЁМА-ПЕРЕДАЧИ ДИСКОВ В ПОКРАСКУ<br>' + PN.title(p) + " от " + SM.fmtDT(p.createdAt) + "</h2>" +
      "<table><tr><td>Клиент</td><td>" + esc(p.name || "") + " " + SM.phoneShow(p.phone) + "</td></tr><tr><td>Автомобиль / госномер</td><td>" + esc(p.car || "") + " " + esc(p.plate || "") + "</td></tr><tr><td>Диски</td><td>" + p.disks + " шт, " + esc(p.radius) + "</td></tr><tr><td>Цвет</td><td>" + esc(p.color) + "</td></tr><tr><td>Состояние дисков</td><td>" + esc(PN.condText(p) || "не указано") + "</td></tr><tr><td>Колпачки</td><td>" + (p.caps ? "с колпачками" : "без колпачков") + "</td></tr><tr><td>Резина</td><td>" + (p.tires ? "с резиной, марка: " + esc(p.tireBrand) : "без резины") + "</td></tr><tr><td>Правка дисков</td><td>" + (p.straighten ? p.straighten.qty + " шт, " + SM.fmt(p.straighten.sum) : "не требуется") + "</td></tr>" + (p.comment ? "<tr><td>Комментарий</td><td>" + esc(p.comment) + "</td></tr>" : "") + "</table>" +
      "<table><tr><th>Работа / услуга</th><th>Кол-во</th><th>Сумма</th></tr>" + p.items.map((i) => "<tr><td>" + esc(i.name) + "</td><td>" + i.qty + "</td><td>" + SM.fmt(i.price * i.qty) + "</td></tr>").join("") + '<tr><td colspan="2"><b>Итого к оплате при выдаче</b></td><td><b>' + SM.fmt(t.total) + "</b></td></tr></table>" +
      "<p>Оплата производится при выдаче дисков. Состояние дисков при приёме: <b>" + (PN.condText(p) ? esc(PN.condText(p)) : "______________________________________________") + "</b></p><p>Сдал (клиент): ____________ / ____________ &nbsp;&nbsp;&nbsp; Принял: ____________ / ____________</p><p>Получил после покраски, претензий нет: ____________ / ____________ «___» __________ 20__ г.</p>" +
      '<div style="font-size:10px;margin-top:10px">Демо-версия, данные вымышлены. Шаблон акта юристом не проверен.</div></div>');
  };
})();
