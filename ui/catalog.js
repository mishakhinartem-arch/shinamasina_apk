/* Админка → «Услуги и товары» (по PIN): владелец сам добавляет, правит и скрывает услуги и товары. */
(function () {
  const SM = window.SM, U = SM.ui, A = U.act, esc = SM.esc, P = SM.prices;
  U.catGroup = "tire";
  const REF = { typeKey: "passenger", radius: "R16" };
  function priceSummary(S, t) {
    if (t.custom && t.mode === "radial") { const c = (S.prices.custom || []).find((x) => "c:" + x.id === t.key); const v = []; Object.keys(c.grid || {}).forEach((tk) => Object.keys(c.grid[tk]).forEach((r) => v.push(c.grid[tk][r]))); return v.length ? "по радиусу: " + SM.fmt(Math.min(...v)) + " – " + SM.fmt(Math.max(...v)) : "—"; }
    if (t.radial) { const v = []; P.TYPES.forEach((ty) => P.RADII.forEach((r) => { const x = P.radiusPrice(S.prices, ty.key, t.name, r); if (x) v.push(x); })); return v.length ? "по радиусу: " + SM.fmt(Math.min(...v)) + " – " + SM.fmt(Math.max(...v)) : "—"; }
    if (t.manual) return "от " + SM.fmt(t.fromPrice) + " · вводится";
    return SM.fmt(t.price);
  }
  U.catalogHtml = function (S) {
    const all = P.catalog(S.prices, REF.typeKey, REF.radius, { all: true }).filter((t) => !t.gift && t.group === U.catGroup);
    const prods = SM.products.list(S, true);
    return '<div class="card"><div class="row"><div class="h2 grow" style="margin:0">Услуги</div>' + P.GROUPS.map((g) => '<button class="btn sm ' + (U.catGroup === g.key ? "dark" : "") + '" data-act="catGroup" data-g="' + g.key + '">' + g.label + "</button>").join("") + '<button class="btn sm primary" data-act="svcNew">+ Услуга</button></div>' +
      '<div class="scroll"><table class="tbl" style="margin-top:8px"><tr><th>Услуга</th><th>Цена</th><th>Вид</th><th></th></tr>' + all.map((t) => { const hid = P.isHidden(S.prices, t.key); return '<tr class="' + (hid ? "muted-row" : "") + '"><td><b>' + esc(t.name) + "</b>" + (t.custom ? ' <span class="chip">добавлена</span>' : "") + (t.custom && !W.normsFor(S, t.key).length ? ' <span class="nonorm">· нет нормы списания</span>' : "") + (hid ? ' <span class="chip">скрыта</span>' : "") + "</td><td>" + priceSummary(S, t) + "</td><td><small>" + (t.custom ? P.MODES[t.mode] : t.radial ? P.MODES.radial : t.manual ? P.MODES.manual : P.MODES.fixed) + '</small></td><td class="r"><button class="btn sm" data-act="svcEdit" data-k="' + esc(t.key) + '">Изменить</button><button class="btn sm ghost" data-act="svcHide" data-k="' + esc(t.key) + '">' + (hid ? "Показать" : "Скрыть") + "</button></td></tr>"; }).join("") + "</table></div>" +
      '<div class="hint" style="margin-top:6px">Скрытая услуга не видна на кассе (в старых чеках остаётся). Встроенные услуги из прайса можно скрыть и поменять цены; название — только у добавленных. Цены по радиусам меняются и через Excel.</div></div>' +
      '<div class="card" style="margin-top:10px"><div class="row"><div class="h2 grow" style="margin:0">Товары</div><button class="btn sm primary" data-act="prodNew">+ Товар</button></div>' +
      (prods.length ? '<div class="scroll"><table class="tbl" style="margin-top:8px"><tr><th>Товар</th><th class="r">Продажа</th><th class="r">Закупка</th><th class="r">Наценка</th><th class="r">Остаток</th><th class="r">Мин.</th><th></th></tr>' + prods.map((p) => '<tr class="' + (p.hidden ? "muted-row" : "") + '"><td><b>' + esc(p.name) + "</b>" + (p.hidden ? ' <span class="chip">скрыт</span>' : "") + '</td><td class="r">' + SM.fmt(p.price) + '</td><td class="r">' + SM.fmt(p.cost) + '</td><td class="r">' + (p.cost > 0 ? Math.round(((p.price - p.cost) / p.cost) * 100) + "%" : "—") + '</td><td class="r"><b>' + p.qty + " " + esc(p.unit) + '</b></td><td class="r">' + p.min + '</td><td class="r"><button class="btn sm" data-act="prodEdit" data-id="' + p.id + '">Изменить</button><button class="btn sm ghost" data-act="prodHide" data-id="' + p.id + '">' + (p.hidden ? "Показать" : "Скрыть") + "</button></td></tr>").join("") + "</table></div>" : '<div class="empty">Товаров пока нет</div>') +
      '<div class="hint" style="margin-top:6px">Товары продаются на кассе (вкладка «Товары») и списываются со склада товаров при оплате. В чеке без скидок и не входят в процент мастеров. Закупка идёт в отчёт прибыли.</div></div>';
  };
  U.catalogMount = function () {};
  A.catGroup = (el) => { U.catGroup = el.dataset.g; U.render(); };
  A.svcHide = (el) => { const S = U.S(); const k = el.dataset.k; const r = P.setHidden(S.prices, k, !P.isHidden(S.prices, k)); if (!r.ok) return U.toast(r.msg, true); U.commit(); U.toast(P.isHidden(S.prices, k) ? "Скрыто с кассы" : "Снова видно на кассе"); };
  /* ---------- Форма услуги ---------- */
  function gridHtml(S, getter) {
    return '<div class="scroll"><table class="tbl price-grid"><tr><th>Тип авто</th>' + P.RADII.map((r) => "<th>" + r + "</th>").join("") + "</tr>" + P.TYPES.map((ty) => "<tr><td><b>" + ty.label + "</b></td>" + P.RADII.map((r) => (P.hasRadius(S.prices, ty.key, r) ? '<td><input class="inp" type="number" inputmode="numeric" data-g="' + ty.key + "|" + r + '" value="' + (getter(ty.key, r) || "") + '"></td>' : '<td class="na">—</td>')).join("") + "</tr>").join("") + "</table></div>";
  }
  function readGrid(m) { const g = {}; m.querySelectorAll("[data-g]").forEach((i) => { const [t, r] = i.dataset.g.split("|"); (g[t] = g[t] || {})[r] = i.value; }); return g; }
  /* ---------- «Расходует со склада» (правка 19.11): связь услуги с материалами склада прямо в окне услуги ---------- */
  const W = SM.warehouse;
  function usesBlock() { return '<div class="card" data-uses style="margin-top:12px;padding:10px"><div class="h2" style="margin:0 0 4px">Расходует со склада</div><div class="hint">Что списывается со склада при оплате 1 услуги. Позицию ищите по первым буквам; если её нет — заведите тут же (цена закупки «не задана», впишете во вкладке «Склад»).</div><div data-urows></div><input class="inp" data-usearch autocomplete="off" placeholder="+ добавить материал: начните вводить название" style="margin-top:8px"><div class="wsugg" data-usugg style="display:none"></div></div>'; }
  function mountUses(m, S, key) {
    const uses = key ? W.serviceUses(S, key).map((u) => ({ itemId: u.itemId, name: u.name, unit: u.unit, perUnit: u.perUnit })) : [];
    const rows = m.querySelector("[data-urows]"), inp = m.querySelector("[data-usearch]"), sugg = m.querySelector("[data-usugg]");
    const render = () => { rows.innerHTML = uses.length ? uses.map((u, i) => '<div class="uses-row"><div><b>' + esc(u.name) + "</b>" + (u.newItem ? ' <span class="chip">новая позиция</span>' : "") + '</div><div class="row" style="gap:4px"><input class="inp" type="number" inputmode="decimal" step="0.01" data-uq="' + i + '" value="' + u.perUnit + '"> ' + esc(u.unit) + '</div><button type="button" class="btn sm danger" data-udel="' + i + '">✕</button></div>').join("") : '<div class="nonorm" style="margin-top:6px">Нет нормы списания — при оплате со склада ничего не спишется.</div>'; };
    const showSugg = () => {
      const q = W.normName(inp.value); if (!q) { sugg.style.display = "none"; return; }
      const list = S.warehouse.items.filter((i) => !W.isBox(i) && W.normName(i.name).indexOf(q) === 0 || (!W.isBox(i) && i.name.toLowerCase().split(/\s+/).some((w) => W.normName(w).indexOf(q) === 0))).slice(0, 8);
      const exact = list.some((i) => W.normName(i.name) === q);
      sugg.innerHTML = list.map((i) => '<button type="button" data-uid="' + i.id + '">' + esc(i.name) + ' <small class="muted">(' + esc(i.unit) + ", остаток " + W.fmtQty(i.qty, i.unit) + ")</small></button>").join("") + (exact ? "" : '<button type="button" data-unew>＋ Новая позиция склада «' + esc(inp.value.trim()) + '», шт</button>');
      sugg.style.display = "";
    };
    inp.addEventListener("input", showSugg);
    sugg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-uid]"), nb = e.target.closest("[data-unew]");
      if (b) { const it = W.item(S, b.dataset.uid); if (!uses.some((u) => u.itemId === it.id)) uses.push({ itemId: it.id, name: it.name, unit: it.unit, perUnit: 1 }); }
      else if (nb) { const n = inp.value.trim(); if (n && !uses.some((u) => u.newItem && W.normName(u.name) === W.normName(n))) uses.push({ newItem: { name: n, unit: "шт", min: 0 }, name: n, unit: "шт", perUnit: 1 }); }
      else return;
      inp.value = ""; sugg.style.display = "none"; render();
    });
    rows.addEventListener("input", (e) => { const i = e.target.dataset.uq; if (i != null) uses[Number(i)].perUnit = e.target.value; });
    rows.addEventListener("click", (e) => { const d = e.target.closest("[data-udel]"); if (d) { uses.splice(Number(d.dataset.udel), 1); render(); } });
    render();
    return {
      check: () => { const bad = uses.find((u) => !(Number(String(u.perUnit).replace(",", ".")) > 0)); return bad ? "«Расходует со склада»: количество для «" + bad.name + "» должно быть больше 0" : null; },
      save: (k) => W.setServiceUses(S, k, uses.map((u) => ({ itemId: u.itemId, newItem: u.newItem, perUnit: u.perUnit })))
    };
  }
  function svcForm(key) {
    const S = U.S();
    const tile = key ? P.catalog(S.prices, REF.typeKey, REF.radius, { all: true }).find((t) => t.key === key) : null;
    const custom = !tile || tile.custom ? (tile ? (S.prices.custom || []).find((x) => "c:" + x.id === key) : { name: "", group: U.catGroup, mode: "fixed", price: "", fromPrice: "", grid: {}, note: "" }) : null;
    if (custom) {
      const body = '<label class="fld">Название</label><input class="inp" data-f="name" value="' + esc(custom.name) + '"><div class="grid2"><div><label class="fld">Раздел на кассе</label><select class="inp" data-f="group">' + P.GROUPS.map((g) => '<option value="' + g.key + '"' + (custom.group === g.key ? " selected" : "") + ">" + g.label + "</option>").join("") + '</select></div><div><label class="fld">Вид цены</label><select class="inp" data-f="mode">' + Object.keys(P.MODES).map((k) => '<option value="' + k + '"' + (custom.mode === k ? " selected" : "") + ">" + P.MODES[k] + "</option>").join("") + "</select></div></div>" +
        '<div data-m="fixed"><label class="fld">Цена, ₽</label><input class="inp" type="number" inputmode="numeric" data-f="price" value="' + (custom.price || "") + '"></div>' +
        '<div data-m="manual"><label class="fld">Цена «от», ₽ (подсказка кассиру)</label><input class="inp" type="number" inputmode="numeric" data-f="fromPrice" value="' + (custom.fromPrice || "") + '"></div>' +
        '<div data-m="radial"><div class="hint" style="margin:6px 0">Цена за 1 шт по радиусу и типу авто. Пусто — для этого радиуса услуги нет.</div>' + gridHtml(S, (t, r) => custom.grid && custom.grid[t] && custom.grid[t][r]) + '<label class="check"><input type="checkbox" data-f="surcharge"' + (custom.surcharge ? " checked" : "") + "> Действует надбавка +" + S.settings.surchargePct + "% RunFlat</label></div>" +
        '<label class="fld">Подсказка (необязательно)</label><input class="inp" data-f="note" value="' + esc(custom.note || "") + '">' + usesBlock() + '<div data-err class="down" style="font-weight:700;margin-top:8px"></div>';
      U.modal({ title: tile ? "Изменить услугу" : "Новая услуга", wide: true, body, foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>', mount: (m, close) => {
        const f = (k) => m.querySelector('[data-f="' + k + '"]');
        const vis = () => m.querySelectorAll("[data-m]").forEach((d) => (d.style.display = d.dataset.m === f("mode").value ? "" : "none"));
        f("mode").onchange = vis; vis();
        const U2 = mountUses(m, S, tile ? key : null);
        m.querySelector("[data-save]").onclick = () => {
          const ue = U2.check(); if (ue) { m.querySelector("[data-err]").textContent = ue; return; }
          const d = { name: f("name").value, group: f("group").value, mode: f("mode").value, price: f("price").value, fromPrice: f("fromPrice").value, grid: readGrid(m), note: f("note").value, surcharge: f("surcharge").checked };
          const r = tile ? P.updateCustom(S.prices, custom.id, d) : P.addCustom(S.prices, d);
          if (!r.ok) { m.querySelector("[data-err]").textContent = r.msg; return; }
          const ur = U2.save(tile ? key : r.key); if (!ur.ok) { m.querySelector("[data-err]").textContent = ur.msg; return; }
          U.catGroup = d.group; close(); U.commit(); U.toast(tile ? "Услуга сохранена" : "Услуга добавлена — уже на кассе");
        };
      } });
      return;
    }
    // Встроенная услуга: цены (по радиусу — сетка; фикс — одно поле)
    const body = '<div class="h2">' + esc(tile.name) + "</div>" + (tile.radial ? '<div class="hint" style="margin-bottom:6px">Цена за услугу по радиусу и типу авто (Коммерческий — колонки R14C/R15C/R16C, Газель — R16). Пусто — нет цены.</div>' + gridHtml(S, (t, r) => P.radiusPrice(S.prices, t, tile.name, r)) : '<label class="fld">' + (tile.manual ? "Цена «от», ₽ (на кассе вводится)" : "Цена, ₽") + '</label><input class="inp" type="number" inputmode="numeric" data-f="price" value="' + (tile.manual ? tile.fromPrice : tile.price) + '">') + '<div class="hint" style="margin-top:6px">Название встроенной услуги не меняется (на нём держатся нормы склада и история). Нужна другая — добавьте свою и скройте эту.</div>' + usesBlock() + '<div data-err class="down" style="font-weight:700;margin-top:8px"></div>';
    U.modal({ title: "Цены услуги", wide: true, body, foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>', mount: (m, close) => {
      const U2 = mountUses(m, S, key);
      m.querySelector("[data-save]").onclick = () => {
        const ue = U2.check(); if (ue) { m.querySelector("[data-err]").textContent = ue; return; }
        const ur = U2.save(key); if (!ur.ok) { m.querySelector("[data-err]").textContent = ur.msg; return; }
        if (tile.radial) { const g = readGrid(m); let n = 0; Object.keys(g).forEach((t) => Object.keys(g[t]).forEach((r) => { const was = P.radiusPrice(S.prices, t, tile.name, r); const v = g[t][r] === "" ? null : Math.round(Number(g[t][r])); if ((was || null) !== (v > 0 ? v : null)) { P.setRadialPrice(S.prices, tile.name, t, r, g[t][r]); n++; } })); close(); U.commit(); U.toast("Изменено цен: " + n); return; }
        const r = P.setFlatPrice(S.prices, tile.name, m.querySelector('[data-f="price"]').value); if (!r.ok) { m.querySelector("[data-err]").textContent = r.msg; return; }
        close(); U.commit(); U.toast("Цена сохранена");
      };
    } });
  }
  A.svcNew = () => svcForm(null);
  A.svcEdit = (el) => svcForm(el.dataset.k);
  /* ---------- Форма товара ---------- */
  function prodForm(id) {
    const S = U.S(); const p = id ? SM.products.get(S, id) : { name: "", price: "", cost: "", qty: 0, min: 0 };
    const body = '<label class="fld">Название</label><input class="inp" data-f="name" value="' + esc(p.name) + '"><div class="grid2"><div><label class="fld">Цена продажи, ₽</label><input class="inp" type="number" inputmode="numeric" data-f="price" value="' + p.price + '"></div><div><label class="fld">Закупка за шт, ₽</label><input class="inp" type="number" inputmode="decimal" data-f="cost" value="' + p.cost + '"></div><div><label class="fld">Остаток, шт</label><input class="inp" type="number" inputmode="numeric" data-f="qty" value="' + p.qty + '"></div><div><label class="fld">Минимальный остаток (предупреждение владельцу)</label><input class="inp" type="number" inputmode="numeric" data-f="min" value="' + p.min + '"></div></div><div data-err class="down" style="font-weight:700;margin-top:8px"></div>';
    U.modal({ title: id ? "Изменить товар" : "Новый товар", wide: true, body, foot: '<button class="btn" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>', mount: (m, close) => {
      m.querySelector("[data-save]").onclick = () => {
        const f = (k) => m.querySelector('[data-f="' + k + '"]').value;
        const d = { name: f("name"), price: f("price"), cost: f("cost"), qty: f("qty"), min: f("min") };
        const r = id ? SM.products.update(S, id, d) : SM.products.add(S, d);
        if (!r.ok) { m.querySelector("[data-err]").textContent = r.msg; return; }
        close(); U.commit(); U.toast(id ? "Товар сохранён" : "Товар добавлен — уже на кассе (вкладка «Товары»)");
      };
    } });
  }
  A.prodNew = () => prodForm(null);
  A.prodEdit = (el) => prodForm(el.dataset.id);
  A.prodHide = (el) => { const S = U.S(); const p = SM.products.get(S, el.dataset.id); SM.products.setHidden(S, p.id, !p.hidden); U.commit(); U.toast(p.hidden ? "Товар скрыт с кассы" : "Товар снова на кассе"); };
})();
