/* Клиенты: поиск по телефону / средним 3 цифрам ГРЗ, новый клиент с проверкой дублей, история визитов, согласие на ПД. */
(function () {
  const SM = window.SM, U = SM.ui, A = U.act, esc = SM.esc;
  U.cq = ""; U.csel = null;
  function search(S, q) {
    q = String(q || "").trim(); if (!q) return S.clients.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 40);
    const d = q.replace(/\D/g, ""), pl = SM.normPlate(q), low = q.toLowerCase();
    return S.clients.filter((c) => (d.length === 3 && /^\d{3}$/.test(q) && SM.plateMiddle(c.plate) === d) || (d.length >= 4 && c.phone.indexOf(d) >= 0) || (pl.length >= 2 && /[А-Я]/.test(pl) && c.plate.indexOf(pl) >= 0) || (c.name || "").toLowerCase().indexOf(low) >= 0 || (d.length >= 3 && !/^\d{3}$/.test(q) && c.phone.indexOf(d) >= 0));
  }
  U.views.clients = function (el, S) {
    const o = U.activeOrder(S);
    const list = search(S, U.cq);
    const sel = U.csel && SM.client(S, U.csel);
    el.innerHTML = (U.attachMode && o ? '<div class="banner" style="margin:0 0 10px">Выберите клиента для заказа №' + o.no + ' и нажмите «Привязать к заказу»<button class="btn sm ghost" data-act="attachCancel">Отмена</button></div>' : "") +
      '<div class="row" style="margin-bottom:10px"><input class="inp grow" id="c-q" style="flex:1;min-width:200px" placeholder="Телефон, 3 цифры номера (770), госномер или имя" value="' + esc(U.cq) + '"><button class="btn" data-act="cPlate">⌨ Госномер</button><button class="btn primary" data-act="cNew">+ Новый клиент</button></div>' +
      '<div class="split"><div class="card"><div class="cardh"><span>' + (U.cq ? "Найдено: " + list.length : "Последние клиенты") + '</span><span class="demo-tag">демо</span></div>' + (list.length ? list.map((c) => '<div class="list-item ' + (sel && sel.id === c.id ? "sel" : "") + '" data-act="cSel" data-id="' + c.id + '">' + U.plateHtml(c.plate, true) + '<div class="grow"><b>' + esc(c.name || "без имени") + "</b><br><small>" + SM.phoneShow(c.phone) + (c.wheel_size ? " · " + c.wheel_size : "") + "</small></div></div>").join("") : '<div class="empty">Не найдено. Нажмите «Новый клиент».</div>') + "</div>" +
      '<div id="c-detail">' + (sel ? detail(S, sel, o) : '<div class="card empty">👆 Выберите клиента выше (в списке)</div>') + "</div></div>";
    const inp = el.querySelector("#c-q");
    inp.addEventListener("input", () => { U.cq = inp.value; const p = inp.selectionStart; U.render(); const i2 = document.getElementById("c-q"); i2.focus(); try { i2.setSelectionRange(p, p); } catch (_) {} });
  };
  function detail(S, c, o) {
    const v = SM.clientVisits(S, c.id); const st = S.storage.filter((r) => r.clientId === c.id);
    return '<div class="card"><div class="row">' + U.plateHtml(c.plate) + '<div class="grow"><div class="h1">' + esc(c.name || "без имени") + "</div><div>" + SM.phoneShow(c.phone) + "</div></div></div>" +
      '<div class="kv" style="margin-top:8px"><span>Авто</span><b>' + esc(c.car || "—") + '</b></div><div class="kv"><span>Колёса</span><b>' + esc(c.wheel_size || "—") + (c.typeKey ? " · " + SM.prices.typeLabel(c.typeKey) : "") + '</b></div><div class="kv"><span>Согласие на ПД</span><b>' + (c.consent ? '<span class="up">✓ ' + SM.fmtDT(c.consent.at) + " (" + esc(c.consent.source || "") + ")</span>" : '<span class="down">нет</span>') + '</b></div><div class="kv"><span>Визитов</span><b>' + v.length + (v.length ? " · скидка " + S.settings.loyaltyPct + "% постоянному" : "") + "</b></div>" +
      '<div class="row" style="margin-top:10px">' + (o ? '<button class="btn primary" data-act="cAttach" data-id="' + c.id + '">Привязать к заказу №' + o.no + "</button>" : "") + (c.plate ? '<button class="btn" data-act="cOrder" data-id="' + c.id + '">Новый заказ по номеру</button>' : "") + '<button class="btn ghost" data-act="cEdit" data-id="' + c.id + '">Изменить</button></div></div>' +
      (st.length ? '<div class="card" style="margin-top:10px"><div class="cardh"><span>Хранение</span></div>' + st.map((r) => { const s = SM.storage.status(S, r); return '<div class="kv"><span>' + r.no + " · " + esc(r.size) + " · место " + esc(r.place) + '</span><span class="chip ' + s + '">' + SM.storage.STATUS_RU[s] + "</span></div>"; }).join("") + "</div>" : "") +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>История визитов</span><span>' + v.length + "</span></div>" + (v.length ? v.slice(0, 20).map((r) => '<div class="kv"><span>' + SM.fmtDate(r.ts) + " · " + esc(r.items.filter((i) => !i.gift).map((i) => i.name + (i.radius ? " " + i.radius : "") + (i.qty > 1 ? " ×" + i.qty : "")).join(", ")) + "</span><b>" + SM.fmt(r.total) + "</b></div>").join("") : '<div class="empty">Визитов ещё не было</div>') + "</div>";
  }
  A.cSel = (el) => { U.csel = el.dataset.id; U.render(); const d = document.getElementById("c-detail"); if (d && window.matchMedia("(orientation: portrait), (max-width: 900px)").matches) d.scrollIntoView({ behavior: "smooth", block: "start" }); };
  A.cPlate = () => U.plateKeyboard({ title: "Поиск по госномеру", onDone: (p) => { U.cq = p; U.render(); } });
  A.attachCancel = () => { U.attachMode = false; U.go("order"); };
  A.cAttach = (el) => { const S = U.S(); const o = U.activeOrder(S); SM.orders.attachClient(S, o, SM.client(S, el.dataset.id), U.who()); U.attachMode = false; SM.save(); U.go("order"); U.toast("Клиент привязан"); };
  A.cOrder = (el) => { const S = U.S(); const c = SM.client(S, el.dataset.id); const r = SM.orders.create(S, { plate: c.plate }, U.who()); if (!r.ok) return U.toast(r.msg, true); S.ui.activeOrderId = r.order.id; if (c.wheel_size) S.ui.radius = c.wheel_size; if (c.typeKey && SM.prices.hasRadius(S.prices, c.typeKey, S.ui.radius)) S.ui.type = c.typeKey; SM.save(); U.go("kassa"); };
  U.clientForm = function (c, onSaved) {
    const S = U.S(); let plate = c ? c.plate : "";
    const R = SM.prices.RADII;
    U.modal({ title: c ? "Изменить клиента" : "Новый клиент", wide: true, body: '<div class="grid2"><div><label class="fld">Госномер</label><button class="btn block ghost" data-pl style="min-height:66px">' + U.plateHtml(plate, true) + '</button></div><div><label class="fld">Телефон</label><input class="inp" type="tel" inputmode="tel" data-f="phone" placeholder="+7 900 000-00-00" value="' + esc(c ? SM.phoneShow(c.phone) : "") + '"></div>' +
      '<div><label class="fld">Имя</label><input class="inp" data-f="name" value="' + esc(c ? c.name : "") + '"></div><div><label class="fld">Автомобиль</label><input class="inp" data-f="car" value="' + esc(c ? c.car : "") + '"></div>' +
      '<div><label class="fld">Радиус колёс</label><select class="inp" data-f="wheel_size"><option value="">—</option>' + R.map((r) => "<option" + (c && c.wheel_size === r ? " selected" : "") + ">" + r + "</option>").join("") + '</select></div><div><label class="fld">Тип машины</label><select class="inp" data-f="typeKey"><option value="">—</option>' + SM.prices.TYPES.map((t) => '<option value="' + t.key + '"' + (c && c.typeKey === t.key ? " selected" : "") + ">" + t.label + "</option>").join("") + "</select></div></div>" +
      '<label class="check" style="margin-top:12px"><input type="checkbox" data-f="consent"' + (c && c.consent ? " checked disabled" : "") + "> Клиент дал согласие на обработку персональных данных" + (c && c.consent ? " (" + SM.fmtDT(c.consent.at) + ")" : "") + "</label>" + SM.consentDetails() + '<div class="hint" style="margin-top:4px">Перед отметкой дайте клиенту прочитать текст (шаблон, юристом не проверен).</div><div class="hint" style="margin-top:6px">Удобнее, если клиент заполнит анкету сам: <a href="client.html" target="_blank">анкета клиента</a>.</div><div data-err class="down" style="margin-top:8px;font-weight:700"></div>',
      foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>', mount: (m, close) => {
        m.querySelector("[data-pl]").onclick = () => U.plateKeyboard({ title: "Госномер клиента", value: plate, onDone: (p) => { plate = p; m.querySelector("[data-pl]").innerHTML = U.plateHtml(p, true); } });
        m.querySelector("[data-save]").onclick = () => {
          const f = (k) => m.querySelector('[data-f="' + k + '"]');
          const d = { name: f("name").value.trim(), phone: f("phone").value, plate, car: f("car").value.trim(), wheel_size: f("wheel_size").value, typeKey: f("typeKey").value };
          const err = m.querySelector("[data-err]");
          if (!d.phone && !d.plate) return (err.textContent = "Нужен телефон или госномер");
          if (d.phone && SM.normPhone(d.phone).length !== 11) return (err.textContent = "Телефон: 11 цифр");
          const consent = f("consent").checked && !(c && c.consent) ? { at: SM.now(), source: "касса" } : c ? c.consent : null;
          if (c) {
            const dupP = d.phone && SM.clientByPhone(S, d.phone), dupL = d.plate && SM.clientByPlate(S, d.plate);
            if ((dupP && dupP.id !== c.id) || (dupL && dupL.id !== c.id)) return (err.textContent = "Телефон или номер уже есть у другого клиента: " + ((dupP && dupP.id !== c.id ? dupP : dupL).name || ""));
            Object.assign(c, { name: d.name, phone: SM.normPhone(d.phone), plate: SM.normPlate(d.plate), car: d.car, wheel_size: d.wheel_size, typeKey: d.typeKey, consent });
            close(); U.commit(); return;
          }
          const r = SM.addClient(S, Object.assign(d, { consent }));
          if (!r.ok) { err.innerHTML = esc(r.msg) + ' <button class="btn sm" data-open="' + r.dup.id + '">Открыть его</button>'; err.querySelector("[data-open]").onclick = () => { close(); U.csel = r.dup.id; U.cq = ""; U.go("clients"); }; return; }
          close(); U.csel = r.client.id; SM.save(); if (onSaved) onSaved(r.client); else U.render(); U.toast("Клиент сохранён");
        };
      } });
  };
  A.cNew = () => U.clientForm(null);
  A.cEdit = (el) => U.clientForm(SM.client(U.S(), el.dataset.id));
})();
