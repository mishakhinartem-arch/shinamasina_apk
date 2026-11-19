/* Клиенты: поиск по телефону / госномеру любой машины / 3 цифрам / имени; один клиент — несколько машин;
   карточка редактируется без PIN, каждая правка — в историю (что было → что стало, кто на смене, когда). */
(function () {
  const SM = window.SM, U = SM.ui, A = U.act, esc = SM.esc, CL = SM.clients;
  U.cq = ""; U.csel = null; U.cselCar = null;
  function list(S, q) {
    q = String(q || "").trim();
    if (!q) return S.clients.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 40).map((c) => ({ client: c, car: null, by: "" }));
    return CL.search(S, q);
  }
  const carLine = (car) => [car.car, car.wheel_size, car.typeKey && SM.prices.typeLabel(car.typeKey), car.pFront || car.pRear ? "давление " + (car.pFront || "—") + " / " + (car.pRear || "—") : ""].filter(Boolean).join(" · ");
  U.views.clients = function (el, S) {
    const o = U.activeOrder(S);
    const items = list(S, U.cq);
    const sel = U.csel && SM.client(S, U.csel);
    el.innerHTML = (U.attachMode && o ? '<div class="banner" style="margin:0 0 10px">Выберите клиента для заказа №' + o.no + ' и нажмите «Привязать к заказу»<button class="btn sm ghost" data-act="attachCancel">Отмена</button></div>' : "") +
      '<div class="row" style="margin-bottom:10px"><input class="inp grow" id="c-q" style="flex:1;min-width:200px" placeholder="Телефон, 3 цифры номера (770), госномер или имя" value="' + esc(U.cq) + '"><button class="btn" data-act="cPlate">⌨ Госномер</button><button class="btn primary" data-act="cNew">+ Новый клиент</button></div>' +
      '<div class="split"><div class="card"><div class="cardh"><span>' + (U.cq ? "Найдено: " + items.length : "Последние клиенты") + '</span><span class="demo-tag">демо</span></div>' +
      (items.length ? items.map((x) => { const c = x.client, cars = CL.cars(c), pl = x.car ? x.car.plate : c.plate; return '<div class="list-item ' + (sel && sel.id === c.id ? "sel" : "") + '" data-act="cSel" data-id="' + c.id + '"' + (x.car ? ' data-car="' + x.car.id + '"' : "") + ">" + U.plateHtml(pl, true) + '<div class="grow"><b>' + esc(c.name || "без имени") + "</b><br><small>" + SM.phoneShow(c.phone) + (x.car ? " · " + esc(carLine(x.car)) : cars.length > 1 ? " · машин: " + cars.length : c.wheel_size ? " · " + c.wheel_size : "") + "</small></div></div>"; }).join("") : '<div class="empty">Не найдено. Нажмите «Новый клиент».</div>') + "</div>" +
      '<div id="c-detail">' + (sel ? detail(S, sel, o) : '<div class="card empty">👆 Выберите клиента выше (в списке)</div>') + "</div></div>";
    const inp = el.querySelector("#c-q");
    inp.addEventListener("input", () => { U.cq = inp.value; const p = inp.selectionStart; U.render(); const i2 = document.getElementById("c-q"); i2.focus(); try { i2.setSelectionRange(p, p); } catch (_) {} });
  };
  function detail(S, c, o) {
    const cars = CL.cars(c), all = SM.clientVisits(S, c.id), st = S.storage.filter((r) => r.clientId === c.id);
    const photos = CL.actPhotos(S, c);
    const visitRow = (r) => '<div class="kv"><span>' + SM.fmtDate(r.ts) + " · " + esc(r.items.filter((i) => !i.gift).map((i) => i.name + (i.radius ? " " + i.radius : "") + (i.qty > 1 ? " ×" + i.qty : "")).join(", ")) + "</span><b>" + SM.fmt(r.total) + "</b></div>";
    return '<div class="card"><div class="row">' + U.plateHtml((CL.car(c, U.cselCar) || cars[0] || {}).plate) + '<div class="grow"><div class="h1">' + esc(c.name || "без имени") + "</div><div>" + SM.phoneShow(c.phone) + "</div></div></div>" +
      '<div class="kv" style="margin-top:8px"><span>Согласие на ПД</span><b>' + (c.consent ? '<span class="up">✓ ' + SM.fmtDT(c.consent.at) + " (" + esc(c.consent.source || "") + ")</span>" : '<span class="down">нет</span>') + '</b></div><div class="kv"><span>Напоминания о записи</span><b>' + (c.notify && c.notify.consent && c.notify.channel ? '<span class="up">🔔 ' + SM.reminders.channelLabel(c.notify.channel) + "</span>" : c.notify && c.notify.channel ? '<span class="down">' + SM.reminders.channelLabel(c.notify.channel) + " · нет согласия</span>" : '<span class="muted">не напоминать</span>') + '</b></div><div class="kv"><span>Визитов (все машины)</span><b>' + all.length + (all.length ? " · скидка " + S.settings.loyaltyPct + "% постоянному на все машины" : "") + "</b></div>" +
      '<div class="row" style="margin-top:10px">' + (o ? '<button class="btn primary" data-act="cAttach" data-id="' + c.id + '">Привязать к заказу №' + o.no + "</button>" : "") + '<button class="btn ghost" data-act="cEdit" data-id="' + c.id + '">✎ Изменить карточку</button></div></div>' +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>Машины клиента</span><span>' + cars.length + "</span></div>" + (cars.length ? cars.map((car) => { const v = CL.carVisits(S, c, car); return '<div class="car-row' + (U.cselCar === car.id ? " sel" : "") + '" style="' + (U.cselCar === car.id ? "border-color:var(--accent);background:var(--accent-soft)" : "") + '"><div class="row">' + U.plateHtml(car.plate, true) + '<div class="grow"><b>' + esc(car.car || "—") + "</b><br><small>" + esc([car.wheel_size, car.typeKey && SM.prices.typeLabel(car.typeKey)].filter(Boolean).join(" · ") || "размер не указан") + " · давление перед <b>" + esc(car.pFront || "—") + "</b> / зад <b>" + esc(car.pRear || "—") + "</b></small></div>" + (car.plate ? '<button class="btn sm" data-act="cOrder" data-id="' + c.id + '" data-car="' + car.id + '">Новый заказ</button>' : "") + "</div>" +
        '<details style="margin-top:6px"' + (U.cselCar === car.id || cars.length === 1 ? " open" : "") + '><summary class="hint">История визитов этой машины (' + v.length + ")</summary>" + (v.length ? v.slice(0, 15).map(visitRow).join("") : '<div class="empty">Визитов ещё не было</div>') + "</details></div>"; }).join("") : '<div class="empty">Машин нет — добавьте в «Изменить карточку»</div>') + "</div>" +
      (st.length ? '<div class="card" style="margin-top:10px"><div class="cardh"><span>Хранение</span></div>' + st.map((r) => { const s = SM.storage.status(S, r); return '<div class="kv"><span>' + r.no + " · " + esc(r.size) + " · место " + esc(r.place) + (r.comment ? " · «" + esc(r.comment) + "»" : "") + '</span><span class="chip ' + s + '">' + SM.storage.STATUS_RU[s] + "</span></div>"; }).join("") + "</div>" : "") +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>📷 Подписанные акты</span><span>' + photos.length + '</span></div><div class="hint">Фото акта делается в заказе, наряде покраски или хранении — или прямо здесь.</div><button class="btn sm" style="margin-top:6px" data-act="cActPhoto" data-id="' + c.id + '">📷 Сфотографировать акт</button><div class="thumbs">' + U.photoThumbs(photos.concat((c.actPhotos || []).map((p) => Object.assign({ where: "Карточка клиента" }, p))).sort((a, b) => b.ts - a.ts)) + "</div></div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>История изменений карточки</span><span>' + (c.history || []).length + "</span></div>" + ((c.history || []).length ? '<div class="chist">' + c.history.slice().reverse().map((h) => "<div><time>" + SM.fmtDT(h.ts) + "</time><b>" + esc(h.who) + ":</b> " + esc(h.text) + "</div>").join("") + "</div>" : '<div class="empty">Изменений не было</div>') + "</div>";
  }
  A.cSel = (el) => { U.csel = el.dataset.id; U.cselCar = el.dataset.car || null; U.render(); const d = document.getElementById("c-detail"); if (d && window.matchMedia("(orientation: portrait), (max-width: 900px)").matches) d.scrollIntoView({ behavior: "smooth", block: "start" }); };
  A.cPlate = () => U.plateKeyboard({ title: "Поиск по госномеру", onDone: (p) => { U.cq = p; const f = CL.findByPlate(U.S(), p); if (f) { U.csel = f.client.id; U.cselCar = f.car.id; } U.render(); } });
  A.attachCancel = () => { U.attachMode = false; U.go("order"); };
  A.cAttach = (el) => {
    const S = U.S(); const o = U.activeOrder(S); const c = SM.client(S, el.dataset.id);
    const finish = (car) => { SM.orders.attachClient(S, o, c, U.who(), car); U.attachMode = false; SM.save(); U.go("order"); U.toast("Клиент привязан" + (car && CL.cars(c).length > 1 ? " · " + CL.label(car) : "")); };
    const pre = CL.car(c, U.cselCar) || (o.plate && CL.cars(c).find((x) => x.plate === o.plate));
    if (pre) return finish(pre);
    U.pickCar(c, finish);
  };
  A.cOrder = (el) => { const S = U.S(); const c = SM.client(S, el.dataset.id); const car = CL.car(c, el.dataset.car) || CL.cars(c)[0]; if (!car || !car.plate) return U.toast("У машины нет госномера", true); const r = SM.orders.create(S, { plate: car.plate }, U.who()); if (!r.ok) return U.toast(r.msg, true); S.ui.activeOrderId = r.order.id; if (car.wheel_size) S.ui.radius = car.wheel_size; if (car.typeKey && SM.prices.hasRadius(S.prices, car.typeKey, S.ui.radius)) S.ui.type = car.typeKey; SM.save(); U.go("kassa"); };
  A.cActPhoto = (el) => U.takePhoto((data) => { const S = U.S(); const c = SM.client(S, el.dataset.id); const id = SM.photos.put(data); if (!id) return U.toast("Не хватило места для фото в браузере (демо)", true); SM.attachActPhoto(c, id, U.who()); c.history.push({ ts: SM.now(), who: U.who(), text: "Прикреплено фото подписанного акта" }); U.commit(); U.toast("Фото акта сохранено в карточке"); });
  /* ---------- Форма клиента: несколько машин, давление с автоточкой ---------- */
  const carRowHtml = (car, i, n) => {
    const R = SM.prices.RADII;
    return '<div class="car-row" data-row="' + i + '"><div class="row"><b class="grow">Машина ' + (i + 1) + "</b>" + (n > 1 || car.plate || car.car ? '<button class="btn sm ghost" data-rmcar="' + i + '">✕ Удалить машину</button>' : "") + '</div><div class="grid3"><div><label class="fld">Госномер</label><button class="btn block ghost" data-cpl="' + i + '" style="min-height:60px">' + U.plateHtml(car.plate, true) + '</button></div><div><label class="fld">Марка / модель</label><input class="inp" data-cf="car" value="' + esc(car.car || "") + '" placeholder="Kia Rio"></div><div><label class="fld">Радиус</label><select class="inp" data-cf="wheel_size"><option value="">—</option>' + R.map((r) => "<option" + (car.wheel_size === r ? " selected" : "") + ">" + r + "</option>").join("") + '</select></div>' +
      '<div><label class="fld">Тип машины</label><select class="inp" data-cf="typeKey"><option value="">—</option>' + SM.prices.TYPES.map((t) => '<option value="' + t.key + '"' + (car.typeKey === t.key ? " selected" : "") + ">" + t.label + "</option>").join("") + '</select></div><div><label class="fld">Давление перед</label><input class="inp" data-cf="pFront" data-pressure inputmode="numeric" placeholder="2.2" value="' + esc(car.pFront || "") + '"></div><div><label class="fld">Давление зад</label><input class="inp" data-cf="pRear" data-pressure inputmode="numeric" placeholder="2.4" value="' + esc(car.pRear || "") + '"></div></div></div>';
  };
  U.clientForm = function (c, onSaved) {
    const S = U.S();
    let cars = c ? CL.cars(c).map((x) => Object.assign({}, x)) : [CL.newCar({})];
    U.modal({ title: c ? "Изменить карточку клиента" : "Новый клиент", wide: true, body: '<div class="grid2"><div><label class="fld">Телефон</label><input class="inp" type="tel" inputmode="tel" data-f="phone" placeholder="+7 900 000-00-00" value="' + esc(c ? SM.phoneShow(c.phone) : "") + '"></div><div><label class="fld">Имя</label><input class="inp" data-f="name" value="' + esc(c ? c.name : "") + '"></div></div>' +
      '<div data-cars></div><button class="btn sm" style="margin-top:8px" data-addcar>+ Добавить машину</button>' +
      '<div class="grid2" style="margin-top:10px"><div><label class="fld">Напоминать о записи через</label><select class="inp" data-f="channel"><option value="">не напоминать</option>' + SM.reminders.CHANNELS.map((x) => '<option value="' + x.key + '"' + (c && c.notify && c.notify.channel === x.key ? " selected" : "") + ">" + x.label + "</option>").join("") + '</select></div><div><label class="check" style="margin-top:28px"><input type="checkbox" data-f="remindOk"' + (c && c.notify && c.notify.consent ? " checked" : "") + "> Клиент согласен получать напоминания</label></div></div>" +
      '<label class="check" style="margin-top:12px"><input type="checkbox" data-f="consent"' + (c && c.consent ? " checked disabled" : "") + "> Клиент дал согласие на обработку персональных данных" + (c && c.consent ? " (" + SM.fmtDT(c.consent.at) + ")" : "") + "</label>" + SM.consentDetails() + '<div class="hint" style="margin-top:4px">Перед отметкой дайте клиенту прочитать текст (шаблон, юристом не проверен).</div>' + (c ? '<div class="hint" style="margin-top:6px">PIN не нужен. Все изменения попадут в историю карточки: что было → что стало, кто на смене, дата и время. Визиты сохраняются.</div>' : '<div class="hint" style="margin-top:6px">Удобнее, если клиент заполнит анкету сам: <a href="client.html" target="_blank">клиентский планшет</a>.</div>') + '<div data-err class="down" style="margin-top:8px;font-weight:700"></div>',
      foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>', mount: (m, close) => {
        const f = (k) => m.querySelector('[data-f="' + k + '"]');
        const readRows = () => m.querySelectorAll("[data-row]").forEach((row) => { const i = Number(row.dataset.row); row.querySelectorAll("[data-cf]").forEach((inp) => { cars[i][inp.dataset.cf] = inp.value.trim(); }); });
        const draw = () => { m.querySelector("[data-cars]").innerHTML = cars.map((x, i) => carRowHtml(x, i, cars.length)).join(""); };
        draw();
        if (!c) U.clientSuggest(f("phone"), (x) => { close(); U.csel = x.client.id; U.cselCar = x.car ? x.car.id : null; U.cq = ""; U.go("clients"); U.toast("Такой клиент уже есть — открыта его карточка"); }, { noCar: true });
        m.addEventListener("click", (e) => {
          const pb = e.target.closest("[data-cpl]"); if (pb) { readRows(); const i = Number(pb.dataset.cpl); return U.plateKeyboard({ title: "Госномер — машина " + (i + 1), value: cars[i].plate, onDone: (p) => { cars[i].plate = SM.normPlate(p); draw(); } }); }
          const rb = e.target.closest("[data-rmcar]"); if (rb) { readRows(); const i = Number(rb.dataset.rmcar); const car = cars[i]; return U.confirm("Удалить машину?", esc(CL.label(car) || "машина без номера") + " уйдёт из карточки. История визитов сохранится.", "Удалить", () => { cars.splice(i, 1); draw(); }, true); }
          if (e.target.closest("[data-addcar]")) { readRows(); cars.push(CL.newCar({})); draw(); }
        });
        m.querySelector("[data-save]").onclick = () => {
          readRows();
          const err = m.querySelector("[data-err]");
          const phone = SM.phoneVal(f("phone").value), name = f("name").value.trim();
          const clean = cars.filter((x) => x.plate || x.car || x.wheel_size || x.pFront || x.pRear);
          if (phone && SM.normPhone(phone).length !== 11) return (err.textContent = "Телефон: +7 и 10 цифр");
          const consent = f("consent").checked && !(c && c.consent) ? { at: SM.now(), source: "касса" } : c ? c.consent : null;
          if (c) {
            const r = CL.update(S, c, { name, phone, cars: clean }, U.who());
            if (!r.ok) return (err.textContent = r.msg);
            if (consent && !c.consent) { c.consent = consent; c.history.push({ ts: SM.now(), who: U.who(), text: "Отмечено согласие на обработку ПД" }); }
            SM.reminders.setClient(S, c, f("channel").value, f("remindOk").checked, "касса");
            close(); U.commit(); U.toast(r.changes.length ? "Сохранено · изменений: " + r.changes.length : "Без изменений"); return;
          }
          if (!phone && !clean.some((x) => x.plate)) return (err.textContent = "Нужен телефон или госномер");
          for (const x of clean) { if (!SM.pressureValid(x.pFront) || !SM.pressureValid(x.pRear)) return (err.textContent = "Давление: от 1.0 до 6.0 (например, 2.2)"); const f2 = x.plate && CL.findByPlate(S, x.plate); if (f2) { err.innerHTML = "Госномер " + esc(x.plate) + " уже у клиента " + esc(f2.client.name || "") + ' <button class="btn sm" data-open="' + f2.client.id + '">Открыть его</button>'; err.querySelector("[data-open]").onclick = () => { close(); U.csel = f2.client.id; U.cselCar = f2.car.id; U.cq = ""; U.go("clients"); }; return; } }
          const r = SM.addClient(S, { name, phone, cars: clean, consent });
          if (!r.ok) { err.innerHTML = esc(r.msg) + ' <button class="btn sm" data-open="' + r.dup.id + '">Открыть его</button>'; err.querySelector("[data-open]").onclick = () => { close(); U.csel = r.dup.id; U.cq = ""; U.go("clients"); }; return; }
          SM.reminders.setClient(S, r.client, f("channel").value, f("remindOk").checked, "касса");
          close(); U.csel = r.client.id; U.cselCar = null; SM.save(); if (onSaved) onSaved(r.client); else U.render(); U.toast("Клиент сохранён");
        };
      } });
  };
  A.cNew = () => U.clientForm(null);
  A.cEdit = (el) => U.clientForm(SM.client(U.S(), el.dataset.id));
})();
