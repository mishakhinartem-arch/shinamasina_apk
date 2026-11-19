/* Клиенты: один телефон — несколько машин (госномер, марка, размер, давление перед/зад у каждой),
   поиск по любому госномеру, редактирование карточки без PIN с историей изменений, фото актов. */
(function (root) {
  const SM = root.SM;
  const CL = (SM.clients = {});
  /** Давление: вводятся только цифры, точка ставится сама после первой цифры: 22 → 2.2, 30 → 3.0, 225 → 2.25. */
  SM.pressureFromDigits = function (s) {
    const d = String(s == null ? "" : s).replace(/\D/g, "").slice(0, 3);
    if (!d) return "";
    return d.length === 1 ? d : d[0] + "." + d.slice(1);
  };
  SM.pressureValid = function (p) { if (p === "" || p == null) return true; const n = Number(p); return /^\d(\.\d{1,2})?$/.test(String(p)) && n >= 1 && n <= 6; };
  const CAR_FIELDS = ["plate", "car", "wheel_size", "typeKey", "pFront", "pRear"];
  CL.CAR_LABEL = { plate: "Госномер", car: "Авто", wheel_size: "Радиус", typeKey: "Тип", pFront: "Давление перед", pRear: "Давление зад" };
  CL.newCar = function (d) {
    d = d || {};
    return { id: d.id || SM.uid("car"), plate: SM.normPlate(d.plate || ""), car: String(d.car || "").trim(), wheel_size: d.wheel_size || "", typeKey: d.typeKey || "", pFront: d.pFront != null && d.pFront !== "" ? String(d.pFront) : "", pRear: d.pRear != null && d.pRear !== "" ? String(d.pRear) : "", prevPlates: (d.prevPlates || []).slice() };
  };
  /** Гарантирует список машин у клиента (старые данные v3 — одна машина из полей plate/car/wheel_size/typeKey). */
  CL.cars = function (c) {
    if (!c) return [];
    if (!Array.isArray(c.cars)) {
      c.cars = c.plate || c.car || c.wheel_size ? [CL.newCar({ plate: c.plate, car: c.car, wheel_size: c.wheel_size, typeKey: c.typeKey })] : [];
    }
    if (!Array.isArray(c.history)) c.history = [];
    return c.cars;
  };
  /** Поля plate/car/wheel_size/typeKey клиента — зеркало первой машины (для старого кода и отчётов). */
  CL.syncPrimary = function (c) {
    const p = CL.cars(c)[0] || {};
    c.plate = p.plate || ""; c.car = p.car || ""; c.wheel_size = p.wheel_size || ""; c.typeKey = p.typeKey || "";
    return c;
  };
  CL.car = (c, carId) => (c && carId ? CL.cars(c).find((x) => x.id === carId) || null : null);
  /** Машина по госномеру (любой машины любого клиента). */
  CL.findByPlate = function (S, plate) {
    const p = SM.normPlate(plate); if (!p) return null;
    for (const c of S.clients) { const car = CL.cars(c).find((x) => x.plate === p); if (car) return { client: c, car }; }
    return null;
  };
  CL.label = (car) => (car ? [car.plate, car.car].filter(Boolean).join(" · ") || "машина без номера" : "");
  /**
   * Поиск клиента: госномер (или 3 цифры номера) → сразу конкретная машина; телефон / имя → клиент (машина не выбрана).
   * Возвращает [{ client, car, by }].
   */
  CL.search = function (S, q, limit) {
    q = String(q || "").trim(); if (!q) return [];
    const out = [], d = q.replace(/\D/g, "").replace(/^8(?=\d{3})/, "7"), pl = SM.normPlate(q), low = q.toLowerCase();
    const isMid = /^\d{3}$/.test(q);
    const plateLike = /\d/.test(pl) && /[АВЕКМНОРСТУХ]/.test(pl) && /^[АВЕКМНОРСТУХ]?\d{0,3}[АВЕКМНОРСТУХ]{0,2}\d{0,3}$/.test(pl);
    S.clients.forEach((c) => {
      const cars = CL.cars(c);
      let plateHit = false;
      cars.forEach((car) => {
        if ((isMid && SM.plateMiddle(car.plate) === q) || (plateLike && pl.length >= 2 && car.plate.indexOf(pl) >= 0)) { out.push({ client: c, car, by: "plate" }); plateHit = true; }
      });
      if (plateHit) return;
      const ph = SM.normPhone(c.phone);
      if (!plateLike && d.length >= 4 && ph.indexOf(d) >= 0) out.push({ client: c, car: null, by: "phone" });
      else if (low.length >= 2 && !/^\d+$/.test(low) && (c.name || "").toLowerCase().indexOf(low) >= 0) out.push({ client: c, car: null, by: "name" });
    });
    return limit ? out.slice(0, limit) : out;
  };
  /** Визиты по конкретной машине (старые чеки без carId — по госномеру; у клиента с одной машиной — все). */
  CL.carVisits = function (S, c, car) {
    const cars = CL.cars(c);
    return SM.clientVisits(S, c.id).filter((r) => r.carId ? r.carId === car.id : cars.length === 1 || (r.plate && (SM.normPlate(r.plate) === car.plate || (car.prevPlates || []).indexOf(SM.normPlate(r.plate)) >= 0)));
  };
  function log(c, who, text) { c.history.push({ ts: SM.now(), who: who || "Касса", text }); }
  const show = (k, v) => (v === "" || v == null ? "—" : k === "typeKey" ? SM.prices ? SM.prices.typeLabel(v) : v : k === "phone" ? SM.phoneShow(v) : String(v));
  /**
   * Изменить карточку (без PIN). patch: { name?, phone?, cars?: [{ id?, plate, car, wheel_size, typeKey, pFront, pRear }] }.
   * Каждая правка пишется в историю: что было → что стало, кто, когда. Визиты сохраняются (чеки ссылаются на клиента и машину).
   */
  CL.update = function (S, c, patch, who) {
    CL.cars(c);
    const name = patch.name != null ? String(patch.name).trim() : c.name;
    const phone = patch.phone != null ? SM.normPhone(patch.phone) : SM.normPhone(c.phone);
    if (phone && phone.length !== 11) return { ok: false, msg: "Телефон: 11 цифр (+7 и 10 цифр)" };
    if (phone) { const dup = S.clients.find((x) => x.id !== c.id && SM.normPhone(x.phone) === phone); if (dup) return { ok: false, msg: "Этот телефон уже у другого клиента: " + (dup.name || SM.phoneShow(dup.phone)), dup }; }
    let cars = c.cars;
    if (patch.cars) {
      cars = patch.cars.map((x) => { const old = x.id && c.cars.find((y) => y.id === x.id); return CL.newCar(Object.assign({}, x, { id: old ? old.id : undefined, prevPlates: old ? old.prevPlates : [] })); });
      const seen = {};
      for (const car of cars) {
        if (car.pFront && !SM.pressureValid(car.pFront)) return { ok: false, msg: "Давление перед: от 1.0 до 6.0 (например, 2.2)" };
        if (car.pRear && !SM.pressureValid(car.pRear)) return { ok: false, msg: "Давление зад: от 1.0 до 6.0 (например, 2.4)" };
        if (!car.plate) continue;
        if (seen[car.plate]) return { ok: false, msg: "Госномер " + car.plate + " указан дважды" };
        seen[car.plate] = 1;
        const f = CL.findByPlate(S, car.plate); if (f && f.client.id !== c.id) return { ok: false, msg: "Госномер " + car.plate + " уже у другого клиента: " + (f.client.name || SM.phoneShow(f.client.phone)), dup: f.client };
      }
    }
    if (!phone && !cars.some((x) => x.plate)) return { ok: false, msg: "Нужен телефон или хотя бы один госномер" };
    const changes = [];
    if (name !== (c.name || "")) changes.push("Имя: " + show("name", c.name) + " → " + show("name", name));
    if (phone !== SM.normPhone(c.phone)) changes.push("Телефон: " + show("phone", c.phone) + " → " + show("phone", phone));
    if (patch.cars) {
      cars.forEach((car) => {
        const old = c.cars.find((y) => y.id === car.id);
        if (!old) { changes.push("Добавлена машина: " + (CL.label(car) || "без номера")); return; }
        const tag = old.plate || car.plate || old.car || "машина";
        CAR_FIELDS.forEach((k) => {
          if ((old[k] || "") === (car[k] || "")) return;
          if (k === "plate") { changes.push("Госномер: " + show(k, old.plate) + " → " + show(k, car.plate)); if (old.plate && car.prevPlates.indexOf(old.plate) < 0) car.prevPlates.push(old.plate); }
          else changes.push(CL.CAR_LABEL[k] + " (" + tag + "): " + show(k, old[k]) + " → " + show(k, car[k]));
        });
      });
      c.cars.forEach((old) => { if (!cars.some((x) => x.id === old.id)) changes.push("Удалена машина: " + (CL.label(old) || "без номера") + " (визиты сохранены)"); });
    }
    c.name = name; c.phone = phone; c.cars = cars; CL.syncPrimary(c);
    changes.forEach((t) => log(c, who, t));
    return { ok: true, changes };
  };
  CL.addCar = function (S, c, car, who) { return CL.update(S, c, { cars: CL.cars(c).concat([car]) }, who); };
  /** Все изменения карточек (для владельца), новые сверху. */
  CL.changeLog = function (S, limit) {
    const out = [];
    S.clients.forEach((c) => (c.history || []).forEach((h) => out.push(Object.assign({ clientId: c.id, client: c.name || SM.phoneShow(c.phone) }, h))));
    out.sort((a, b) => b.ts - a.ts);
    return limit ? out.slice(0, limit) : out;
  };
  /** Фото подписанных актов клиента: из заказов, нарядов покраски и хранения. */
  CL.actPhotos = function (S, c) {
    const out = [];
    S.orders.forEach((o) => { if (o.clientId === c.id) (o.actPhotos || []).forEach((p) => out.push(Object.assign({ where: "Заказ №" + o.no + (o.plate ? " · " + o.plate : "") }, p))); });
    (S.paint || []).forEach((p) => { if (p.clientId === c.id) (p.actPhotos || []).forEach((x) => out.push(Object.assign({ where: SM.paint.title(p) }, x))); });
    (S.storage || []).forEach((r) => { if (r.clientId === c.id) (r.actPhotos || []).forEach((x) => out.push(Object.assign({ where: "Хранение " + r.no }, x))); });
    return out.sort((a, b) => b.ts - a.ts);
  };
  /** Миграция v3 → v4: машины у клиентов, история карточек, Газель = 6 колёс. */
  CL.migrateV3 = function (S) {
    S.clients.forEach((c) => { CL.cars(c); CL.syncPrimary(c); });
    const gz = S.prices && S.prices.commercial && S.prices.commercial.services["Переобувка 4 колеса"];
    if (gz && SM.prices && SM.prices.gazelKitFix) SM.prices.gazelKitFix(S.prices);
    S.version = 4;
    return S;
  };
  /* ---------- Фото (в демо — localStorage, отдельно от состояния; в Node — в памяти) ---------- */
  const PKEY = "shinamashina_web_demo_photo_";
  const mem = {};
  const ls = () => (typeof localStorage !== "undefined" ? localStorage : null);
  SM.photos = {
    put(dataUrl) { const id = SM.uid("ph"); try { if (ls()) ls().setItem(PKEY + id, dataUrl); else mem[id] = dataUrl; } catch (e) { return null; } return id; },
    get(id) { return ls() ? ls().getItem(PKEY + id) : mem[id] || null; },
    del(id) { if (ls()) ls().removeItem(PKEY + id); else delete mem[id]; },
    clear() { const s = ls(); if (!s) { Object.keys(mem).forEach((k) => delete mem[k]); return; } Object.keys(s).filter((k) => k.indexOf(PKEY) === 0).forEach((k) => s.removeItem(k)); }
  };
  /** Прикрепить фото подписанного акта к заказу / наряду / хранению. */
  SM.attachActPhoto = function (target, photoId, who, note) {
    if (!target || !photoId) return { ok: false, msg: "Нет фото" };
    target.actPhotos = target.actPhotos || [];
    const p = { id: photoId, ts: SM.now(), who: who || "Касса", note: note || "Подписанный акт" };
    target.actPhotos.push(p);
    if (target.history) target.history.push({ ts: p.ts, who: p.who, text: "Фото подписанного акта прикреплено" });
    return { ok: true, photo: p };
  };
  /**
   * Анкета на клиентском планшете. Новый клиент — создаётся; телефон уже есть — обновляем карточку
   * (новая машина добавляется, у известной — дополняются поля), всё пишется в историю изменений.
   * Номер, записанный на другой телефон, не перезаписываем — просим подойти к администратору.
   */
  SM.kioskSave = function (S, d) {
    const who = "анкета на планшете", consent = { at: SM.now(), source: "анкета клиента" };
    const plate = SM.normPlate(d.plate || "");
    const byPhone = SM.clientByPhone(S, d.phone), byPlate = plate ? CL.findByPlate(S, plate) : null;
    if (byPlate && (!byPhone || byPlate.client.id !== byPhone.id)) return { ok: false, msg: "Этот госномер уже есть в базе с другим телефоном — подойдите, пожалуйста, к администратору" };
    const fields = { car: d.car || "", wheel_size: d.wheel_size || "", pFront: d.pFront || "", pRear: d.pRear || "" };
    if (!byPhone) {
      const r = SM.addClient(S, Object.assign({ name: d.name, phone: d.phone, plate, consent, source: "анкета" }, fields));
      return r.ok ? { ok: true, client: r.client, updated: false } : r;
    }
    const c = byPhone, cars = CL.cars(c).map((x) => Object.assign({}, x));
    let car = plate ? cars.find((x) => x.plate === plate) : cars.length === 1 ? cars[0] : null;
    if (!car && (plate || fields.car || fields.wheel_size)) { car = { plate }; cars.push(car); }
    if (car) Object.keys(fields).forEach((k) => { if (fields[k]) car[k] = fields[k]; });
    const r = CL.update(S, c, { name: d.name || c.name, cars }, who);
    if (!r.ok) return r;
    c.consent = consent;
    return { ok: true, client: c, updated: true, changes: r.changes };
  };
})(typeof window !== "undefined" ? window : globalThis);
