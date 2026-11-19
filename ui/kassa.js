/* Главная кассы (по макету main_kassa), заказ/корзина, «Машины в работе». */
(function () {
  const SM = window.SM, U = SM.ui, A = U.act, esc = SM.esc;
  U.tab = "freq"; U.q = "";
  const TABS = [["freq", "★ Частые"], ["tire", "Шиномонтаж"], ["repair", "Ремонт"], ["small", "Мелочи"], ["goods", "Товары"], ["storage", "Хранение"], ["paint", "Покраска"]];
  U.activeOrder = function (S) { const o = S.ui.activeOrderId && SM.orders.get(S, S.ui.activeOrderId); return o && o.status !== "done" && o.status !== "cancel" ? o : null; };
  U.ctx = (S) => ({ radius: S.ui.radius, typeKey: S.ui.type });
  function applyClientWheel(S, c, car) {
    if (!c) return;
    c = car || SM.clients.cars(c)[0] || c;
    if (c.typeKey && SM.prices.TYPES.some((t) => t.key === c.typeKey)) S.ui.type = c.typeKey;
    if (c.wheel_size && SM.prices.RADII.indexOf(c.wheel_size) >= 0) { S.ui.radius = c.wheel_size; if (!SM.prices.hasRadius(S.prices, S.ui.type, S.ui.radius)) S.ui.type = "passenger"; }
  }
  /** Открыть заказ: только госномер или номер очереди. */
  U.openOrderFlow = function (cb, title) {
    const S = U.S();
    const waiting = SM.live.today(S).filter((q) => q.status !== "done" && !SM.orders.open(S).some((o) => o.queueNo === q.no && SM.dayKey(o.createdAt) === SM.live.day(q)));
    const extra = waiting.length ? '<div style="margin-top:10px"><div class="hint">или по номеру очереди:</div><div class="row" style="margin-top:6px">' + waiting.map((q) => '<button class="btn sm" data-q="' + q.no + '"' + (q.plate ? ' data-qp="' + esc(q.plate) + '"' : "") + ">Очередь №" + q.no + (q.plate ? " · " + esc(q.plate) : "") + "</button>").join("") + "</div></div>" : "";
    U.plateKeyboard({ title: title || "Принять машину — госномер", extra, onDone: (plate) => done({ plate }), onExtra: (e, close) => { const b = e.target.closest("[data-q]"); if (b) { close(); done(b.dataset.qp ? { plate: b.dataset.qp, queueNo: Number(b.dataset.q) } : { queueNo: Number(b.dataset.q) }); } } });
    function done(d) {
      const S = U.S();
      // Машина по талону встаёт на пост: на одном посту — одна машина
      let callMsg = "";
      if (d.queueNo) { const q = SM.live.find(S, d.queueNo); if (q && q.status === "wait") { const c = SM.live.call(S, q); if (!c.ok) return U.alert("Пост не свободен", esc(c.msg)); callMsg = " · пост " + c.post + (c.borrowed ? " (пост записи — успеваем до записи)" : ""); } }
      const r = SM.orders.create(S, d, U.who());
      if (!r.ok) return U.toast(r.msg, true);
      S.ui.activeOrderId = r.order.id;
      const c = r.order.clientId && SM.client(S, r.order.clientId);
      const car = c && SM.clients.car(c, r.order.carId);
      if (c && !r.existed) { applyClientWheel(S, c, car); U.toast("Клиент найден: " + (c.name || SM.phoneShow(c.phone)) + (car && SM.clients.cars(c).length > 1 ? " · " + SM.clients.label(car) : "") + (car && car.wheel_size ? " · " + car.wheel_size : "")); }
      else if (r.existed) U.toast("Эта машина уже в работе — открыт её заказ"); else U.toast("Заказ открыт. Клиента можно добавить позже." + callMsg);
      SM.save(); if (cb) cb(r.order); else U.render();
    }
  };
  function withOrder(fn) { const S = U.S(); const o = U.activeOrder(S); if (o) return fn(o); U.openOrderFlow((o2) => fn(o2)); }
  function addTile(key, qty) {
    const S0 = U.S(); const tile = SM.prices.find(S0.prices, key, S0.ui.type, S0.ui.radius); if (!tile) return;
    if (tile.price == null && !tile.manual) return U.toast("Для " + S0.ui.radius + " (" + SM.prices.typeLabel(S0.ui.type) + ") нет цены в прайсе", true);
    withOrder((o) => {
      const S = U.S();
      const go = (price) => { const r = SM.orders.addItem(S, o, tile, qty, U.ctx(S), U.who(), price); if (!r.ok) return U.toast(r.msg, true); U.commit(); };
      if (tile.manual) return U.numpad({ title: tile.name + " — цена", text: tile.note ? '<span class="hint">' + esc(tile.note) + "</span>" : "", hint: "Введите цену. 0 ₽ нельзя.", onDone: (n) => go(n) });
      go();
    });
  }
  A.radius = (el) => { const S = U.S(); S.ui.radius = el.dataset.r; if (!SM.prices.hasRadius(S.prices, S.ui.type, S.ui.radius)) { S.ui.type = "passenger"; U.toast("Для " + S.ui.radius + " есть только легковые цены"); } U.commit(); };
  A.type = (el) => { const S = U.S(); if (!SM.prices.hasRadius(S.prices, el.dataset.t, S.ui.radius)) return U.toast("Для «" + SM.prices.typeLabel(el.dataset.t) + "» в прайсе нет " + S.ui.radius + ". Выберите радиус R15–R22.", true); S.ui.type = el.dataset.t; U.commit(); };
  A.runflat = () => withOrder((o) => { const S = U.S(); SM.orders.setFlag(S, o, "runflat", !o.runflat, U.who()); U.commit(); });
  A.tab = (el) => { U.tab = el.dataset.t; U.q = ""; U.render(); };
  A.add = (el) => addTile(el.dataset.k, Number(el.dataset.q || 1));
  A.newOrder = () => U.openOrderFlow();
  A.switchOrder = (el) => { const S = U.S(); S.ui.activeOrderId = el.dataset.id; const o = SM.orders.get(S, el.dataset.id); const c = o && SM.client(S, o.clientId); applyClientWheel(S, c, c && SM.clients.car(c, o.carId)); U.commit(); };
  A.again = () => withOrder((o) => { const S = U.S(); const r = SM.orders.repeatLast(S, o, U.who()); if (!r.ok) return U.toast(r.msg, true); U.toast("Добавлено как в прошлый раз (" + SM.fmtDate(r.last.ts) + ")"); U.commit(); });
  A.dec = (el) => { const S = U.S(); const o = U.activeOrder(S) || SM.orders.get(S, el.dataset.o); const it = o.items.find((i) => i.id === el.dataset.id); if (!it) return; SM.orders.setQty(S, o, it.id, it.qty - 1, U.who()); U.commit(); };
  A.inc = (el) => { const S = U.S(); const o = SM.orders.get(S, el.dataset.o); const it = o.items.find((i) => i.id === el.dataset.id); const r = SM.orders.setQty(S, o, it.id, it.qty + 1, U.who()); if (r && r.ok === false && r.msg) return U.toast(r.msg, true); U.commit(); };
  A.goGoods = () => { U.tab = "goods"; U.q = ""; U.go("kassa"); };
  A.toCart = () => { if (!U.activeOrder(U.S())) return U.toast("Сначала примите машину", true); U.go("order"); };
  A.mobOrder = () => { const r = document.querySelector("#k-right .mini"); if (r) r.scrollIntoView({ behavior: "smooth", block: "center" }); };
  A.storageNew = () => U.storageForm && U.storageForm();
  A.storageFind = () => U.go("storage");

  function tileHtml(t, S, freqMode) {
    const pr = t.price == null ? (t.manual ? '<div class="pr na">от ' + SM.fmt(t.fromPrice) + " — ввести цену</div>" : '<div class="pr na">нет цены для ' + S.ui.radius + "</div>") : '<div class="pr">' + SM.fmt(t.price) + (t.unit ? "<small> / " + t.unit + "</small>" : "") + "</div>";
    const dis = t.price == null && !t.manual ? " disabled" : "";
    if (t.kind === "kit") return '<div class="tile kit' + (t.key === "r:Переобувка 4 колеса" ? " hot" : "") + '"><div><span class="kit-tag">КОМПЛЕКТ · ' + (t.wheels === 6 ? "6 КОЛЁС" : "4 КОЛЕСА") + '</span><div class="nm" style="margin-top:4px">' + esc(t.name) + '</div><div class="sub">' + esc(t.note) + (t.surchargeEligible ? " · +20% RunFlat" : "") + '</div></div><div class="krow">' + pr + '<button class="addkit" data-act="add" data-k="' + esc(t.key) + '" data-q="1"' + dis + ">+ В корзину</button></div></div>";
    const sub = t.radial ? S.ui.radius + " · " + SM.prices.typeLabel(S.ui.type) : t.note || (t.gift ? "" : "не зависит от радиуса");
    const btns = t.manual ? '<button class="one" data-act="add" data-k="' + esc(t.key) + '" data-q="1">Ввести цену</button>' : t.gift ? '<button class="one" data-act="add" data-k="gift" data-q="4">+ 4 пакета (0 ₽)</button>' : '<div class="q">' + [1, 2, 4].map((q) => '<button class="qb' + (q === 4 ? " x4" : "") + '" data-act="add" data-k="' + esc(t.key) + '" data-q="' + q + '"' + dis + ">×" + q + "</button>").join("") + "</div>";
    return '<div class="tile"><div class="th"><div><div class="nm">' + esc(t.name) + '</div><div class="sub">' + esc(sub) + "</div></div>" + pr + "</div>" + btns + "</div>";
  }
  U.views.kassa = function (el, S) {
    const cat = SM.prices.catalog(S.prices, S.ui.type, S.ui.radius);
    const o = U.activeOrder(S);
    let tiles;
    if (U.q) { const q = U.q.toLowerCase(); tiles = cat.filter((t) => t.name.toLowerCase().indexOf(q) >= 0); }
    else if (U.tab === "freq") tiles = SM.prices.frequent(S, 9).map((k) => cat.find((t) => t.key === k)).filter(Boolean);
    else if (U.tab === "storage" || U.tab === "paint" || U.tab === "goods") tiles = null;
    else tiles = cat.filter((t) => t.group === U.tab);
    // «Коммерческий» (R14C–R16C) и «Газель» (R16) показываем только там, где у них есть цены
    const typeBtns = SM.prices.TYPES.filter((t) => ["commercial", "gazel"].indexOf(t.key) < 0 || SM.prices.hasRadius(S.prices, t.key, S.ui.radius)).map((t) => { const has = SM.prices.hasRadius(S.prices, t.key, S.ui.radius); return '<button class="tb ' + (S.ui.type === t.key ? "active" : "") + '" data-act="type" data-t="' + t.key + '"' + (has ? "" : ' style="opacity:.4" title="нет ' + S.ui.radius + '"') + ">" + t.label + "</button>"; }).join("");
    const left = '<section class="k-left">' +
      '<div class="radii">' + SM.prices.RADII.map((r) => '<button class="rb ' + (S.ui.radius === r ? "active" : "") + '" data-act="radius" data-r="' + r + '">' + r + "</button>").join("") + "</div>" +
      '<div class="types n' + SM.prices.TYPES.filter((t) => ["commercial", "gazel"].indexOf(t.key) < 0 || SM.prices.hasRadius(S.prices, t.key, S.ui.radius)).length + '">' + typeBtns + '<button class="toggle ' + (o && o.runflat ? "on" : "") + '" data-act="runflat"><span class="sw"></span><span><b>+' + S.settings.surchargePct + "% RunFlat /</b><br>низкий профиль</span></button></div>" +
      '<div class="tabsrow">' + TABS.map(([k, l]) => '<button class="tab ' + (U.tab === k && !U.q ? "active" : "") + '" data-act="tab" data-t="' + k + '">' + l + "</button>").join("") + '<input class="search" id="svc-search" placeholder="🔍 Поиск услуги…" value="' + esc(U.q) + '"></div>' +
      (tiles ? '<div class="tiles">' + (tiles.length ? tiles.map((t) => tileHtml(t, S)).join("") : '<div class="empty" style="grid-column:1/-1">Ничего не найдено</div>') + "</div>" : U.tab === "paint" ? U.paintTab(S) : U.tab === "goods" ? goodsTab(S, o) : storageTab(S, o)) + "</section>";
    el.innerHTML = '<div class="kassa-wrap"><div class="kassa">' + left + '<aside class="k-right" id="k-right">' + rightHtml(S, o) + "</aside></div>" + bottomBar(S, o) + "</div>";
    const inp = el.querySelector("#svc-search");
    inp.addEventListener("input", () => { U.q = inp.value; const pos = inp.selectionStart; U.render(); const i2 = document.getElementById("svc-search"); i2.focus(); try { i2.setSelectionRange(pos, pos); } catch (_) {} });
  };
  /** Нижняя полоса «Итого + Корзина» — всегда закреплена внизу экрана кассы. */
  function bottomBar(S, o) {
    const t = o ? SM.cart.totals(o, S.settings) : null;
    const extra = t ? [t.surcharge ? "+" + S.settings.surchargePct + "% RunFlat " + SM.fmt(t.surcharge) : "", t.discount ? "скидка −" + SM.fmt(t.discount) : ""].filter(Boolean).join(" · ") : "";
    return '<div class="k-bar" id="k-bar">' + (o ? '<button class="kb-order" data-act="mobOrder">' + (o.plate ? U.plateHtml(o.plate, true) : "<b>Очередь №" + o.queueNo + "</b>") + "<span>Заказ №" + o.no + " · " + o.items.length + " поз.</span></button>" : '<div class="kb-order muted">Заказ не открыт — нажмите услугу или «Принять машину»</div>') +
      '<div class="kb-sum"><span>Итого' + (extra ? "<small>" + esc(extra) + "</small>" : "") + '</span><b data-total>' + SM.fmt(t ? t.total : 0) + "</b></div>" +
      '<button class="btn-cart kb-cart" data-act="toCart"' + (o ? "" : ' aria-disabled="true"') + ">Корзина <span class=\"cnt\">" + (o ? o.items.length : 0) + "</span> →</button></div>";
  }
  function goodsTab(S, o) {
    const list = SM.products.list(S);
    if (!list.length) return '<div class="card empty">Товаров нет. Владелец добавляет их в Админке → «Услуги и товары».</div>';
    return '<div class="tiles">' + list.map((p) => { const left = p.qty - (o ? SM.products.inOrder(o, p.id) : 0); return '<div class="tile goods"><div class="th"><div><div class="nm">' + esc(p.name) + '</div><div class="sub">товар · на складе ' + p.qty + " " + esc(p.unit) + (o && SM.products.inOrder(o, p.id) ? " · в заказе " + SM.products.inOrder(o, p.id) : "") + '</div></div><div class="pr">' + SM.fmt(p.price) + "<small> / " + esc(p.unit) + '</small></div></div><div class="q">' + [1, 2, 4].map((q) => '<button class="qb' + (q === 4 ? " x4" : "") + '" data-act="addGoods" data-id="' + p.id + '" data-q="' + q + '"' + (left < q ? " disabled" : "") + ">×" + q + "</button>").join("") + "</div></div>"; }).join("") + '<div class="tile" style="grid-column:1/-1;min-height:0"><div class="hint">Товары в чеке: без скидок, не входят в процент мастеров, при оплате списываются со склада товаров. Цены и остатки — у владельца (Админка → Услуги и товары).</div></div></div>';
  }
  A.addGoods = (el) => withOrder((o) => { const S = U.S(); const r = SM.products.addToOrder(S, o, el.dataset.id, Number(el.dataset.q || 1), U.who()); if (!r.ok) return U.toast(r.msg, true); U.commit(); });
  function storageTab(S, o) {
    const c = o && o.clientId ? SM.client(S, o.clientId) : null;
    const act = o ? SM.storage.activeForClient(S, o.clientId, o.plate) : [];
    const unpaid = o ? act.filter((r) => !r.paid && !SM.orders.storageInOrder(S, r.id)) : [];
    return '<div class="tiles" style="grid-template-columns:1fr 1fr"><div class="tile"><div class="nm">Принять комплект на хранение</div><div class="sub">Номер комплекта, место на стеллаже, срок, оплата, этикетка и акт приёма</div><button class="addkit" data-act="storageNew">+ Принять на хранение</button></div>' +
      '<div class="tile"><div class="nm">Выдать с хранения / найти</div><div class="sub">' + (act.length ? "У этого клиента на хранении: " + act.map((r) => r.no + " (" + r.place + ")").join(", ") : "Поиск по номеру комплекта, госномеру или телефону") + '</div><button class="one" data-act="storageFind">Открыть «Хранение» →</button></div>' +
      unpaid.map((r) => '<div class="tile"><div class="nm">Оплата хранения ' + r.no + '</div><div class="sub">' + r.qty + " × " + esc(r.size) + " · до " + SM.fmtDate(r.until) + '</div><div class="pr">' + SM.fmt(r.price) + '</div><button class="one" data-act="sToOrder" data-id="' + r.id + '">+ В чек (без скидки)</button></div>').join("") +
      '<div class="tile" style="grid-column:1/-1"><div class="hint">Цена хранения — по тарифу владельца (' + SM.prices.RADII.filter((r) => S.settings.storageTariff[r]).slice(2, 6).map((r) => r + " " + SM.fmt(S.settings.storageTariff[r])).join(" · ") + "… за комплект за " + (S.settings.storageSeasonMonths || 6) + " мес.; демо-значения примерные), подставляется сама. Хранение можно добавить в чек заказа: скидки на него не действуют, в процент мастеров оно не входит.</div></div></div>";
  }
  function rightHtml(S, o) {
    const open = SM.orders.open(S);
    const sw = open.length ? '<div class="order-switch">' + open.map((x) => '<button data-act="switchOrder" data-id="' + x.id + '" class="' + (o && o.id === x.id ? "active " : "") + (x.status === "ready" ? "ready" : "") + '">' + esc(SM.orders.title(x)) + " · " + SM.orders.chipLabel(x.status) + "</button>").join("") + '<button data-act="newOrder">+ Машина</button></div>' : "";
    if (!o) {
      return '<div class="card"><div class="cardh"><span>Новая машина</span><span class="demo-tag">демо</span></div><button class="accept-btn" data-act="newOrder">' + U.plateHtml("") + '<span class="btn primary block">Принять машину — госномер / очередь</span></button><div class="hint" style="margin-top:8px">Имя и телефон не нужны: клиент подтянется сам, если номер есть в базе.</div>' + sw + "</div>" +
        '<div class="card mini"><div class="cardh"><span>Заказ</span><span>пусто</span></div><div class="list"><div class="empty">Нажмите услугу — сначала откроется ввод госномера</div></div></div>';
    }
    const c = o.clientId ? SM.client(S, o.clientId) : null;
    const visits = c ? SM.clientVisits(S, c.id) : [];
    const ocar = c && SM.clients.car(c, o.carId), ncars = c ? SM.clients.cars(c).length : 0;
    const st = SM.storage.activeForClient(S, o.clientId, o.plate);
    const t = SM.cart.totals(o, S.settings);
    const last = visits[0];
    const lastLbl = last ? last.items.filter((i) => !i.gift).slice(0, 1).map((i) => i.name + (i.radius ? " " + i.radius : "")).join("") : "";
    return '<div class="card"><div class="cardh"><span>Заказ №' + o.no + " · " + (c ? "клиент найден" : "без клиента") + '</span><span class="chip ' + o.status + (o.status === "ready" ? " wait-pay" : "") + '">' + SM.orders.chipLabel(o.status) + "</span></div>" +
      '<button class="plate-btn" data-act="newOrder" title="Другая машина">' + (o.plate ? U.plateHtml(o.plate) : '<span class="plate free"><span class="num">Очередь №' + o.queueNo + "</span></span>") + "</button>" +
      '<div class="who">' + (c ? esc(c.name || SM.phoneShow(c.phone)) + "<small>" + (ncars > 1 ? "машина " + esc(ocar ? SM.clients.label(ocar) : "не выбрана") + " (из " + ncars + ") · " : "") + "визитов: " + visits.length + (last ? " · последний " + SM.fmtDate(last.ts) : "") + (o.loyalty ? " · скидка " + S.settings.loyaltyPct + "%" : "") + "</small>" : 'Клиент не указан<small>можно добавить позже — <a href="#" data-act="go" data-v="clients">Клиенты</a></small>') + "</div>" +
      (st.length ? '<div class="chip soon" style="margin-top:6px">🛞 На хранении: ' + st.map((r) => r.no + " · " + esc(r.place)).join(", ") + "</div>" : "") +
      (last ? '<button class="again" data-act="again">↻ Как в прошлый раз <small>(' + esc(lastLbl) + ")</small></button>" : "") + sw + "</div>" +
      '<div class="card mini"><div class="cardh"><span>Заказ</span><span>' + o.items.length + " поз.</span></div><div class=\"list\">" +
      (o.items.length ? o.items.map((i) => '<div class="ci"><div class="n">' + esc(i.name) + "<small>" + [i.radius, i.typeKey && SM.prices.typeLabel(i.typeKey), "×" + i.qty + (i.qty > 1 ? " · по " + SM.fmt(i.price) : ""), i.noDiscount ? "без скидки" : ""].filter(Boolean).join(" · ") + '</small></div><div class="p">' + SM.fmt(i.price * i.qty) + '</div><button class="rm" data-act="dec" data-id="' + i.id + '" data-o="' + o.id + '">−</button></div>').join("") : '<div class="empty">Добавьте услуги слева</div>') + "</div>" +
      "</div>";
  }

  /* ---------- Заказ / корзина ---------- */
  U.views.order = function (el, S) {
    const o = U.activeOrder(S);
    if (!o) { U.view = "kassa"; return U.views.kassa(el, S); }
    const c = o.clientId ? SM.client(S, o.clientId) : null;
    const t = SM.cart.totals(o, S.settings);
    const sh = SM.shift.current(S);
    const atWork = sh ? SM.shift.atWork(S, sh) : [];
    const idx = ["new", "work", "ready", "done"].indexOf(o.status);
    const lim = SM.cart.discountLimit(S.settings, t.discountBase);
    el.innerHTML = '<div class="order"><div class="col">' +
      '<div class="card"><div class="row"><button class="btn sm" data-act="go" data-v="kassa">← К услугам</button>' + (o.plate ? U.plateHtml(o.plate, true) : '<b>Очередь №' + o.queueNo + "</b>") + '<div class="grow"><b>Заказ №' + o.no + "</b> · " + (c ? esc(c.name || SM.phoneShow(c.phone)) + (SM.clients.cars(c).length > 1 ? ' · <a href="#" data-act="orderCar">' + esc(SM.clients.label(SM.clients.car(c, o.carId)) || "выбрать машину") + " ▾</a>" : "") : '<span class="muted">клиент не указан</span>') + '<br><small>открыт ' + SM.fmtTime(o.createdAt) + (o.note ? " · " + esc(o.note) : "") + '</small></div><button class="btn sm ghost" data-act="attachClient">' + (c ? "Сменить клиента" : "+ Клиент") + "</button></div>" +
      '<div class="steps" style="margin-top:10px">' + SM.orders.STATUS.map((s, i) => '<button class="step ' + (i === idx ? "cur" : i < idx ? "past" : "") + '" data-act="status" data-s="' + s.key + '"' + (s.key === "done" ? " disabled" : "") + ">" + (i < idx ? "✓ " : "") + s.label + "</button>").join("") + "</div></div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>Позиции</span><span>цена — тап, чтобы изменить</span></div>' +
      (o.items.length ? o.items.map((i) => '<div class="oi"><div class="nm">' + esc(i.name) + "<small>" + [i.radius, i.typeKey && SM.prices.typeLabel(i.typeKey), i.surchargeEligible && o.runflat ? "+" + S.settings.surchargePct + "%" : "", i.gift ? "подарок" : "", i.goods ? "товар · без скидки · не в % мастеров" : i.noDiscount ? "по тарифу · скидка не действует · не в % мастеров" : ""].filter(Boolean).join(" · ") + '</small></div><div class="qty"><button class="rm" data-act="dec" data-id="' + i.id + '" data-o="' + o.id + '">−</button><b>' + i.qty + '</b><button class="rm" data-act="inc" data-id="' + i.id + '" data-o="' + o.id + '"' + (i.storageId ? " disabled" : "") + '>+</button></div><button class="pricebtn" data-act="price" data-id="' + i.id + '"' + (i.gift || i.storageId || i.productId ? " disabled" : "") + ">" + SM.fmt(i.price * i.qty) + "</button></div>").join("") : '<div class="empty">Пусто — вернитесь к услугам</div>') +
      '<div class="row" style="margin-top:10px"><button class="toggle ' + (o.runflat ? "on" : "") + '" data-act="runflat" style="flex:1"><span class="sw"></span><span><b>+' + S.settings.surchargePct + '% RunFlat</b> / низкий профиль</span></button><button class="toggle ' + (o.loyalty ? "on" : "") + '" data-act="loyalty" style="flex:1"><span class="sw"></span><span><b>Постоянный −' + S.settings.loyaltyPct + "%</b></span></button></div>" +
      '<div class="row" style="margin-top:8px"><button class="btn" data-act="discount">Скидка…' + (o.discount ? " (" + (o.discount.type === "pct" ? o.discount.value + "%" : SM.fmt(o.discount.value)) + ")" : "") + '</button><button class="btn" data-act="add" data-k="gift" data-q="4">Пакеты в подарок</button><button class="btn" data-act="go" data-v="kassa">+ Услуга</button><button class="btn" data-act="goGoods">+ Товар</button></div>' +
      '<div class="hint" style="margin-top:6px">Лимит ручной скидки: ' + (lim ? "до " + SM.fmt(lim.rub) + " для этого заказа (" + lim.pct.toFixed(1).replace(".", ",") + "%)" : "без ограничений") + " · скидка постоянному в лимит не входит" + (t.storage ? " · на хранение скидки не действуют" : "") + "</div></div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>📷 Подписанный акт</span><span>' + (o.actPhotos || []).length + ' фото</span></div><div class="hint">Клиент подписал акт — сфотографируйте его планшетом: фото привяжется к заказу и к карточке клиента.</div><button class="btn" style="margin-top:8px" data-act="orderActPhoto">📷 Сфотографировать акт</button><div class="thumbs">' + U.photoThumbs(o.actPhotos) + "</div></div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>Исполнители (для истории)</span><span>ЗП считается по смене</span></div><div class="masters">' + S.employees.filter((e) => e.active).map((e) => '<button class="mchip ' + (o.masters.indexOf(e.id) >= 0 ? "on" : "") + '" data-act="master" data-id="' + e.id + '">' + (o.masters.indexOf(e.id) >= 0 ? "✓ " : "") + esc(e.name) + (atWork.indexOf(e.id) < 0 ? " (не на смене)" : "") + "</button>").join("") + "</div></div>" +
      '<div class="card" style="margin-top:10px"><div class="cardh"><span>История заказа</span><span>' + o.history.length + '</span></div><div class="hist">' + o.history.slice().reverse().map((h) => "<div><time>" + SM.fmtTime(h.ts) + "</time><b>" + esc(h.who) + ":</b> " + esc(h.text) + "</div>").join("") + "</div></div>" +
      '</div><div class="col"><div class="card" style="position:sticky;top:80px"><div class="cardh"><span>Итого</span><span>' + t.count + " шт.</span></div>" +
      '<div class="kv"><span>Услуги</span><b>' + SM.fmt(t.base) + "</b></div>" + (t.surcharge ? '<div class="kv"><span>+' + S.settings.surchargePct + "% RunFlat (с " + SM.fmt(t.surchargeBase) + ")</span><b>" + SM.fmt(t.surcharge) + "</b></div>" : "") + (t.loyalty ? '<div class="kv"><span>Скидка постоянному ' + S.settings.loyaltyPct + "%</span><b>−" + SM.fmt(t.loyalty) + "</b></div>" : "") + (t.manual ? '<div class="kv"><span>Скидка</span><b>−' + SM.fmt(t.manual) + "</b></div>" : "") +
      (t.storage ? '<div class="kv"><span>Хранение шин <small class="muted">(без скидки)</small></span><b>' + SM.fmt(t.storage) + "</b></div>" : "") +
      (t.goods ? '<div class="kv"><span>Товары <small class="muted">(без скидки)</small></span><b>' + SM.fmt(t.goods) + "</b></div>" : "") +
      '<div class="tot"><span>К оплате</span><span class="big-total">' + SM.fmt(t.total) + "</span></div>" +
      (sh ? '<div class="paybtns" style="margin-top:10px"><button class="pay cash" data-act="pay" data-p="cash">Наличные</button><button class="pay card" data-act="pay" data-p="card">Карта</button><button class="pay qr" data-act="pay" data-p="qr">QR / СБП</button></div>' : '<div class="banner" style="margin:10px 0 0">Смена не открыта — оплату принять нельзя.<button class="btn sm" data-act="go" data-v="shift">Открыть смену</button></div>') +
      '<div class="hint" style="margin-top:8px">Чек (демо): фискальный чек не печатается, Эвотор не подключён.</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm ghost grow" data-act="go" data-v="cars">Отложить</button><button class="btn sm danger" data-act="cancelOrder">Отменить заказ</button></div></div></div></div>';
  };
  A.status = (el) => { const S = U.S(); const o = U.activeOrder(S); SM.orders.setStatus(S, o, el.dataset.s, U.who()); U.commit(); };
  A.loyalty = () => { const S = U.S(); const o = U.activeOrder(S); const r = SM.orders.setFlag(S, o, "loyalty", !o.loyalty, U.who()); if (!r.ok) return U.alert("Скидка не прошла", esc(r.msg)); U.commit(); };
  A.master = (el) => { const S = U.S(); const o = U.activeOrder(S); const id = el.dataset.id; const ids = o.masters.indexOf(id) >= 0 ? o.masters.filter((x) => x !== id) : o.masters.concat(id); SM.orders.setMasters(S, o, ids, U.who()); U.commit(); };
  A.price = (el) => { const S = U.S(); const o = U.activeOrder(S); const it = o.items.find((i) => i.id === el.dataset.id); U.numpad({ title: "Цена за 1: " + esc(it.name), text: 'Сейчас: <b>' + SM.fmt(it.price) + "</b> за шт. Поле пустое — введите новую цену.", hint: "0 ₽ нельзя", onDone: (n) => { const r = SM.orders.setPrice(S, o, it.id, n, U.who()); if (!r.ok) { U.toast(r.msg, true); return false; } U.commit(); } }); };
  A.discount = () => {
    const S = U.S(); const o = U.activeOrder(S);
    U.numpad({ title: "Скидка на заказ", modes: [{ key: "rub", label: "₽" }, { key: "pct", label: "%" }], mode: (o.discount && o.discount.type) || "rub", text: '<button class="btn sm danger" data-act="discountClear">Убрать скидку</button>',
      validate: (n, mode) => { if (!(n > 0)) return null; const test = Object.assign({}, o, { discount: { type: mode, value: n } }); const c = SM.cart.checkDiscount(test, S.settings); return c.ok ? null : c.msg; },
      onDone: (n, mode) => { const r = SM.orders.setDiscount(S, o, { type: mode, value: n }, U.who()); if (!r.ok) { U.toast(r.msg, true); return false; } U.commit(); } });
  };
  A.discountClear = () => { const S = U.S(); const o = U.activeOrder(S); SM.orders.setDiscount(S, o, null, U.who()); document.querySelector(".modal-bg").close(); U.commit(); };
  A.cancelOrder = () => U.confirm("Отменить заказ?", "Заказ уйдёт из «Машин в работе». Это попадёт в историю.", "Отменить заказ", () => { const S = U.S(); SM.orders.cancel(S, U.activeOrder(S), U.who()); S.ui.activeOrderId = null; SM.save(); U.go("kassa"); }, true);
  A.orderActPhoto = () => U.takePhoto((data) => { const S = U.S(); const o = U.activeOrder(S); if (!o) return; const id = SM.photos.put(data); if (!id) return U.toast("Не хватило места для фото в браузере (демо)", true); SM.attachActPhoto(o, id, U.who()); U.commit(); U.toast("Фото акта прикреплено к заказу №" + o.no); });
  A.orderCar = () => { const S = U.S(); const o = U.activeOrder(S); const c = o && SM.client(S, o.clientId); if (!c) return; U.pickCar(c, (car) => { SM.orders.attachClient(S, o, c, U.who(), car); applyClientWheel(S, c, car); U.commit(); }, "Какая машина у клиента в работе?"); };
  A.attachClient = () => { U.attachMode = true; U.go("clients"); };
  A.pay = (el) => {
    const S = U.S(); const o = U.activeOrder(S); const p = el.dataset.p; const t = SM.cart.totals(o, S.settings);
    const chk = SM.cart.checkDiscount(o, S.settings); if (!chk.ok) return U.alert("Скидка больше лимита", esc(chk.msg));
    if (!o.items.some((i) => !i.gift && i.price > 0)) return U.toast("Добавьте услугу с ценой. Пакеты в подарок сами по себе не пробиваются.", true);
    const ru = { cash: "Наличные", card: "Карта", qr: "QR / СБП" }[p];
    U.modal({ title: "Подтвердите оплату", body: '<div style="font-size:1.15rem">' + ru + ': <b class="big-total">' + SM.fmt(t.total) + "</b></div>" + '<div class="hint" style="margin-top:8px">' + (p === "cash" ? "Возьмите наличные и положите в ящик." : p === "card" ? "Проведите оплату на терминале и дождитесь «Одобрено»." : "Покажите QR клиенту и дождитесь оплаты.") + "</div>", foot: '<button class="btn" data-close>Назад</button><button class="btn ok" data-ok>✓ Оплата получена — пробить чек</button>', mount: (m, close) => m.querySelector("[data-ok]").onclick = () => {
      close(); const r = SM.orders.pay(S, o, p, U.who()); if (!r.ok) return U.alert("Не получилось", esc(r.msg));
      S.ui.activeOrderId = null; SM.save(); U.go("kassa");
      const agg = {}; r.writeoff.lines.forEach((l) => { const a = (agg[l.itemId] = agg[l.itemId] || { name: l.name, unit: l.unit, qty: 0 }); a.qty += l.qty; }); const w = Object.values(agg);
      U.modal({ title: "✓ Чек №" + r.receipt.no + " (демо)", body: '<div class="kv"><span>' + ru + '</span><b class="big-total">' + SM.fmt(r.receipt.total) + "</b></div>" + r.receipt.items.map((i) => '<div class="kv"><span>' + esc(i.name) + " ×" + i.qty + (i.noDiscount ? ' <small class="muted">без скидки</small>' : "") + "</span><b>" + SM.fmt(i.price * i.qty) + "</b></div>").join("") + (r.receipt.totals.surcharge ? '<div class="kv"><span>+20% RunFlat</span><b>' + SM.fmt(r.receipt.totals.surcharge) + "</b></div>" : "") + (r.receipt.totals.discount ? '<div class="kv"><span>Скидка' + (r.receipt.totals.storage ? " (только на услуги " + SM.fmt(r.receipt.totals.discountBase) + ")" : "") + '</span><b>−' + SM.fmt(r.receipt.totals.discount) + "</b></div>" : "") +
        '<div class="h2" style="margin-top:12px">Списано со склада автоматически</div>' + (w.length ? w.map((l) => '<div class="kv"><span>' + esc(l.name) + "</span><b>" + SM.warehouse.fmtQty(l.qty, l.unit) + "</b></div>").join("") : '<div class="hint">Для этих услуг нормы расхода не заданы</div>') + '<div class="hint" style="margin-top:8px">Фискальный чек не печатается, Эвотор не подключён (демо).</div>', foot: '<button class="btn primary" data-close>Следующая машина</button>' });
    } });
  };

  /* ---------- Машины в работе ---------- */
  U.views.cars = function (el, S) {
    const open = SM.orders.open(S).sort((a, b) => a.createdAt - b.createdAt);
    const next = { new: "work", work: "ready", ready: null };
    el.innerHTML = '<div class="row" style="margin-bottom:10px"><div class="h1 grow">Машины в работе: ' + open.length + '</div><button class="btn primary" data-act="newOrder">+ Принять машину</button></div>' +
      (open.length ? '<div class="cars">' + open.map((o) => { const t = SM.cart.totals(o, S.settings); const c = o.clientId && SM.client(S, o.clientId); return '<div class="card car ' + o.status + '"><div class="row">' + (o.plate ? U.plateHtml(o.plate, true) : "<b>Очередь №" + o.queueNo + "</b>") + '<span class="chip ' + o.status + (o.status === "ready" ? " wait-pay" : "") + '" style="margin-left:auto">' + SM.orders.chipLabel(o.status) + "</span></div><div><b>Заказ №" + o.no + "</b> · " + SM.fmtTime(o.createdAt) + " · " + (c ? esc(c.name) : '<span class="muted">без клиента</span>') + '</div><div class="hint">' + (o.items.map((i) => esc(i.name) + (i.qty > 1 ? " ×" + i.qty : "")).join(", ") || "услуги не выбраны") + '</div><div class="hint">Исполнители: ' + (o.masters.map((id) => esc(SM.empName(S, id))).join(", ") || "—") + '</div><div class="row"><b class="grow" style="font-size:1.3rem">' + SM.fmt(t.total) + "</b>" + (next[o.status] ? '<button class="btn sm" data-act="carNext" data-id="' + o.id + '">→ ' + SM.orders.statusLabel(next[o.status]) + "</button>" : "") + '<button class="btn sm primary" data-act="carOpen" data-id="' + o.id + '">Открыть</button></div></div>'; }).join("") + "</div>" : '<div class="card empty">Сейчас машин в работе нет. Нажмите «Принять машину» и введите госномер или номер очереди.</div>') + '<div style="margin-top:14px">' + U.paintListHtml(S, true) + "</div>";
  };
  A.carOpen = (el) => { const S = U.S(); S.ui.activeOrderId = el.dataset.id; SM.save(); U.go("order"); };
  A.carNext = (el) => { const S = U.S(); const o = SM.orders.get(S, el.dataset.id); SM.orders.setStatus(S, o, { new: "work", work: "ready" }[o.status], U.who()); U.commit(); };
})();
