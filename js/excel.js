/* Прайс ⇄ Excel: строки таблицы, сравнение «было → стало», применение. Сам .xlsx — через SheetJS (vendor/xlsx.full.min.js). */
(function (root) {
  const SM = root.SM;
  const X = (SM.excel = {});
  X.SECTIONS = ["passenger", "crossover", "jeep", "commercial"];
  X.COLS = ["Раздел", "Услуга", "Радиус", "Цена, ₽", "Примечание"];
  X.priceRows = function (P) {
    const rows = [];
    X.SECTIONS.forEach((sk) => { const s = P[sk]; Object.keys(s.services).forEach((svc) => s.radii.forEach((r, i) => rows.push({ "Раздел": s.name, "Услуга": svc, "Радиус": r, "Цена, ₽": s.services[svc][i], "Примечание": "" }))); });
    ["repair", "extras"].forEach((sk) => P[sk].items.forEach((it) => rows.push({ "Раздел": P[sk].name, "Услуга": it.name, "Радиус": "", "Цена, ₽": it.manualPrice ? it.fromPrice : it.price, "Примечание": it.manualPrice ? "цена вводится вручную, здесь — «от»" : it.note || "" })));
    return rows;
  };
  function locate(P, row) {
    const sec = String(row["Раздел"] || "").trim(), name = String(row["Услуга"] || "").trim(), rad = String(row["Радиус"] || "").trim().toUpperCase();
    for (const sk of X.SECTIONS) { const s = P[sk]; if (s.name !== sec) continue; const i = s.radii.map((x) => x.toUpperCase()).indexOf(rad); if (i < 0 || !s.services[name]) return null; return { get: () => s.services[name][i], set: (v) => (s.services[name][i] = v) }; }
    for (const sk of ["repair", "extras"]) { const s = P[sk]; if (s.name !== sec) continue; const it = s.items.find((x) => x.name === name); if (!it) return null; const k = it.manualPrice ? "fromPrice" : "price"; return { get: () => it[k], set: (v) => (it[k] = v) }; }
    return null;
  }
  /** Сравнить загруженные строки с текущим прайсом. */
  X.diff = function (P, rows) {
    const changes = [], errors = [];
    rows.forEach((row, idx) => {
      if (!row["Услуга"]) return;
      const loc = locate(P, row);
      if (!loc) { errors.push("Строка " + (idx + 2) + ": не найдено «" + row["Услуга"] + " " + (row["Радиус"] || "") + "» в разделе «" + row["Раздел"] + "»"); return; }
      const raw = row["Цена, ₽"];
      const v = Math.round(Number(String(raw).replace(/\s/g, "").replace(",", ".")));
      if (raw === "" || raw == null || !(v > 0)) { errors.push("Строка " + (idx + 2) + ": цена «" + raw + "» — нужна сумма больше 0"); return; }
      const was = loc.get();
      if (Number(was) !== v) changes.push({ section: row["Раздел"], name: row["Услуга"], radius: row["Радиус"] || "", was: Number(was), now: v, row });
    });
    return { changes, errors };
  };
  X.apply = function (P, changes) { changes.forEach((c) => { const loc = locate(P, c.row); if (loc) loc.set(c.now); }); return changes.length; };
  X.stockRows = (S, withCost) => S.warehouse.items.map((i) => { const r = { "Позиция": i.name, "Ед.": i.unit, "Остаток": Math.round(i.qty * 100) / 100, "Минимум": i.min, "Статус": i.qty < i.min ? "заканчивается" : "ok" }; if (withCost) { r["Цена закупки за ед., ₽"] = i.cost; r["Сумма, ₽"] = Math.round(i.qty * i.cost); } return r; });
})(typeof window !== "undefined" ? window : globalThis);
