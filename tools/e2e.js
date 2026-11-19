// Сквозные сценарии в headless Chrome + скриншоты. Запуск: node tools/e2e.js (нужен сервер на :8765)
const { chromium } = require("playwright-core");
const XLSX = require("xlsx");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:8765/";
const OUT = __dirname + "/../screens/";
const log = (...a) => console.log("•", ...a);
function ok(c, m) { if (!c) throw new Error("ПРОВАЛ: " + m); log("OK", m); }
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const shot = (n, pg) => (pg || p).screenshot({ path: OUT + n + ".png" });
  const click = async (sel, pg) => { await (pg || p).locator(sel).first().click(); await (pg || p).waitForTimeout(150); };
  const closeModal = async () => { await click(".modal-bg >> nth=-1 >> .modal-x"); };
  const S = () => p.evaluate(() => JSON.parse(localStorage.getItem(SM.STORE_KEY)));
  const typePlate = async (s) => { for (const ch of s) await click('.modal [data-k="' + ch + '"]'); await click('.modal [data-k="Готово"]'); };
  const numpad = async (s) => { for (const ch of s) await click('.modal-bg >> nth=-1 >> [data-n="' + ch + '"]'); };

  await p.goto(BASE + "index.html#kassa"); await p.waitForTimeout(500);
  await shot("tablet-01-kassa");
  // --- Закрыть текущую (демо) смену и открыть новую ---
  await click('[data-v="shift"]'); await shot("tablet-02-shift");
  await click('[data-act="shiftClose"]'); await click(".modal [data-ok]"); await shot("tablet-03-shift-closed");
  await closeModal();
  ok(!(await S()).shifts.some((s) => !s.endedAt), "смена закрыта");
  ok(await p.locator('select[name=m-sel]').count() === 2 && await p.locator('input[name=m]').count() === 0, "19.11 «Кто на смене»: строки с выпадающим списком сотрудников (2 строки), без длинного списка галочек");
  await click('[data-act="shiftRowAdd"]'); ok(await p.locator('select[name=m-sel]').count() === 3, "19.11 «+ Ещё сотрудник» добавляет строку");
  await p.locator('select[name=m-sel]').nth(0).selectOption("e1"); await p.locator('select[name=m-sel]').nth(1).selectOption("e2");
  await click('[data-act="factOpen"]'); const drawer = (await S()).drawer.balance; await numpad(String(Math.round(drawer))); await click(".modal [data-ok]");
  await click('[data-act="shiftOpen"]');
  ok((await S()).shifts.some((s) => !s.endedAt && s.att.length === 2), "смена открыта с 2 мастерами, факт ящика подтверждён");
  // --- Заказ по госномеру, клиент подтягивается, услуги ---
  await click('[data-v="kassa"]');
  await click('.tile:has-text("Балансировка") [data-q="4"]');
  ok(await p.locator('.modal:has-text("госномер")').count() > 0, "без заказа тап по услуге открывает ввод госномера");
  ok(await p.locator('.modal [data-k="1"]').isDisabled(), "клавиатура: первая позиция — только буквы (цифры неактивны)");
  await typePlate("А123ВС50");
  let st = await S(); let o = st.orders.find((x) => x.plate === "А123ВС50" && x.status !== "done" && x.status !== "cancel");
  ok(o && o.clientId, "заказ открыт по номеру, клиент найден");
  ok(o.items.some((i) => i.name === "Балансировка" && i.qty === 4), "Балансировка ×4 в заказе");
  await click('.tile.kit:has-text("Переобувка 4 колеса") .addkit');
  await click('[data-act="runflat"]');
  await shot("tablet-04-kassa-order");
  // --- Корзина: статусы, лимит скидки, оплата ---
  await click('[data-act="toCart"]');
  await click('[data-s="work"]'); await click('[data-s="ready"]');
  await click('[data-act="discount"]'); await click('.modal [data-mode="pct"]'); await numpad("50");
  ok(await p.locator(".modal [data-ok]").isDisabled(), "скидка 50% сверх лимита — кнопка неактивна");
  const hint = await p.locator(".modal [data-hint]").innerText(); ok(/лимит/i.test(hint), "понятное сообщение о лимите: " + hint.slice(0, 80));
  await click('.modal [data-n="C"]'); await click('.modal [data-mode="rub"]'); await numpad("300"); await click(".modal [data-ok]");
  await shot("tablet-05-order");
  st = await S(); o = st.orders.find((x) => x.id === o.id);
  ok(o.status === "ready" && o.discount && o.discount.value === 300, "статус «Готов», скидка 300 ₽ принята");
  ok(o.history.length >= 6, "история заказа ведётся (" + o.history.length + " записей)");
  const w1before = st.warehouse.items.find((i) => i.id === "w1").qty, w7before = st.warehouse.items.find((i) => i.id === "w7").qty;
  await click('[data-p="cash"]'); await shot("tablet-06-pay-confirm"); await click(".modal [data-ok]");
  await shot("tablet-07-receipt");
  st = await S(); o = st.orders.find((x) => x.id === o.id);
  ok(o.status === "done", "оплачено, статус «Выдан»");
  const w1after = st.warehouse.items.find((i) => i.id === "w1").qty, w7after = st.warehouse.items.find((i) => i.id === "w7").qty;
  const kits = o.items.filter((i) => i.name === "Переобувка 4 колеса").reduce((s, i) => s + i.qty, 0);
  ok(w1after === w1before, "грузики с машины НЕ списались (остались " + w1after + " кор)");
  ok(Math.abs(w7before - w7after - 20 * kits) < 0.01, "остальные нормы работают: паста −" + (w7before - w7after) + " г (переобувка " + kits + "×20)");
  await closeModal();
  // --- Мастер 2 ушёл, расчёт ---
  await click('[data-v="shift"]'); await click('[data-act="mySalary"][data-id="e1"]'); await shot("tablet-08-my-salary"); await closeModal();
  await click('[data-act="clockOut"][data-id="e2"]');
  ok(await p.locator('.modal:has-text("Мастер 2 ушёл со смены?")').count() > 0, "вопрос «Мастер 2 ушёл со смены?»");
  await click(".modal [data-ok]"); ok(await p.locator('.modal:has-text("Расчёт: Мастер 2")').count() > 0, "после «Ушёл» показан расчёт"); await shot("tablet-09-clockout"); await closeModal();
  // --- Хранение ---
  await click('[data-v="storage"]'); await shot("tablet-10-storage");
  await click('[data-act="storageNew"]');
  await click(".modal [data-pl]"); await typePlate("Е555КХ77");
  await p.locator('.modal [data-f="phone"]').focus(); ok((await p.locator('.modal [data-f="phone"]').inputValue()).startsWith("+7"), "19.11 поле телефона уже начинается с «+7»");
  ok(await p.locator('.modal [data-f="comment"]').count() === 1 && await p.locator('.modal [data-photo]').count() === 1, "19.11 приём на хранение: поле «Комментарий» и необязательное фото шин");
  await p.fill('.modal [data-f="comment"]', "2 шипа выпали, царапина на боковине");
  await p.fill('.modal [data-f="phone"]', "+7 900 000-00-77"); await p.fill('.modal [data-f="name"]', "Тест (демо)"); await p.fill('.modal [data-f="size"]', "205/55 R16");
  await p.fill('.modal [data-f="place"]', "В-3-2"); await p.selectOption('.modal [data-f="radius"]', "R16"); await p.selectOption('.modal [data-f="pay"]', "card");
  ok(await p.locator('.modal [data-f="price"]').isHidden(), "поле цены хранения скрыто от кассира (только через PIN)");
  let ptxt = await p.locator(".modal [data-price]").innerText(); ok(/3\s?500/.test(ptxt), "цена хранения подставилась по тарифу R16: " + ptxt);
  await click('.modal [data-f="rims"]'); ptxt = await p.locator(".modal [data-price]").innerText(); ok(/4\s?000/.test(ptxt), "с дисками +500: " + ptxt);
  await shot("tablet-20-storage-price");
  await click(".modal [data-save]");
  st = await S(); const rec = st.storage.find((r) => r.plate === "Е555КХ77"); ok(rec && rec.paid && rec.no && rec.price === 4000 && !rec.priceManual, "комплект принят по тарифу 4 000 ₽ и оплачен: " + rec.no);
  ok(rec.comment === "2 шипа выпали, царапина на боковине" && !rec.photoId, "19.11 комментарий сохранён, без фото тоже принимается");
  await click('.modal [data-act="sLabel"]'); await shot("tablet-11-label"); await closeModal();
  await click('.modal [data-act="sAct"]'); await click(".modal-bg >> nth=-1 >> details summary");
  ok(await p.locator('.modal-bg >> nth=-1 >> text=ДОГОВОР ХРАНЕНИЯ ШИН').count() > 0, "в акте есть договор хранения (раскрывается)");
  ok(await p.locator(".modal-bg >> nth=-1 >> b.filled", { hasText: rec.no }).count() > 0, "в договор подставлен номер комплекта");
  await shot("tablet-24-act-contract"); await closeModal(); await closeModal();
  // --- Хранение в чеке заказа со скидкой: скидка только на услуги ---
  await click('[data-v="kassa"]'); await click('[data-act="newOrder"]'); await typePlate("Х700ХХ77");
  await click('[data-act="rb"][data-r="R16"], [data-act="radius"][data-r="R16"]');
  await click('.tile.kit:has-text("Переобувка 4 колеса") .addkit');
  await click('[data-act="tab"][data-t="storage"]'); await click('.tile [data-act="storageNew"]');
  ok((await p.locator('.modal [data-f="pay"]').inputValue()) === "order", "при открытом заказе оплата хранения по умолчанию — в чек заказа");
  await p.fill('.modal [data-f="phone"]', "+7 900 000-00-70"); await p.fill('.modal [data-f="name"]', "Скидка Тест (демо)"); await p.fill('.modal [data-f="place"]', "В-4-1"); await p.selectOption('.modal [data-f="radius"]', "R16");
  await click(".modal [data-save]"); await closeModal();
  await click('[data-act="discount"]'); await click('.modal [data-mode="pct"]'); await numpad("10"); await click(".modal [data-ok]");
  st = await S(); let o3 = st.orders.find((x) => x.plate === "Х700ХХ77" && x.status !== "done");
  const svc = o3.items.filter((i) => !i.noDiscount).reduce((s, i) => s + i.price * i.qty, 0), sti = o3.items.find((i) => i.noDiscount);
  ok(sti && sti.price === 3500, "хранение в чеке по тарифу 3 500 ₽");
  const bigTotal = await p.locator(".big-total").first().innerText();
  const expTotal = svc - Math.round(svc * 0.1) + 3500;
  ok(bigTotal.replace(/\D/g, "") === String(expTotal), "К оплате " + bigTotal + " = услуги " + svc + " − 10% + хранение 3500 без скидки");
  await shot("tablet-21-order-storage-discount");
  await click('[data-p="card"]'); await click(".modal [data-ok]"); await shot("tablet-22-receipt-storage");
  st = await S(); const rc = st.receipts[st.receipts.length - 1];
  ok(rc.totals.discount === Math.round(svc * 0.1) && rc.totals.storage === 3500 && rc.total === expTotal, "чек: скидка " + rc.totals.discount + " только от услуг, хранение 3500 полностью");
  ok(st.storage.find((r) => r.id === sti.storageId).paid, "комплект отмечен оплаченным по чеку заказа");
  await closeModal();
  // --- Запись через book.html ---
  const bp = await ctx.newPage(); await bp.setViewportSize({ width: 390, height: 844 });
  await bp.goto(BASE + "book.html"); await bp.waitForTimeout(300);
  ok(await bp.locator('[data-dir]').count() === 3 && await bp.locator('[data-dir="repair"]').count() === 0, "19.11 онлайн-запись: только 3 вида переобувки, ремонта нет (выключен владельцем)");
  ok(await bp.locator('[data-dir="full"] >> text=снять, перебортировать, отбалансировать, поставить').count() === 1, "19.11 «Полный шиномонтаж (снять, перебортировать, отбалансировать, поставить)»");
  await click('[data-dir="full"]', bp); await click('[data-day] >> nth=1', bp); await click('[data-time]:not([disabled]) >> nth=1', bp);
  await bp.fill("#b-name", "Онлайн Клиент"); await bp.fill("#b-phone", "+7 900 000-00-55");
  await click("#b-plate", bp); for (const ch of "Т456ТТ50") await click('.modal [data-k="' + ch + '"]', bp); await click('.modal [data-k="Готово"]', bp);
  await click("#b-send", bp); ok(await bp.locator("text=Без согласия").count() > 0, "без галочки согласия запись не отправляется");
  await click("#b-details summary", bp); ok(await bp.locator("#b-details >> text=Перечень персональных данных").isVisible(), "онлайн-запись: полный текст согласия раскрывается");
  await click("#b-ok", bp); await bp.screenshot({ path: OUT + "iphone-05-book.png", fullPage: true }); await click("#b-send", bp);
  ok(await bp.locator("text=Вы записаны").count() > 0, "клиент записался");
  await p.reload(); await click('[data-v="bookings"]');
  ok(await p.locator('text=Онлайн Клиент').count() > 0, "запись видна в кассе");
  await shot("tablet-12-bookings");
  await click('.list-item:has-text("Онлайн Клиент") [data-act="bAccept"]');
  st = await S(); ok(st.orders.some((x) => x.plate === "Т456ТТ50" && x.status === "new"), "«Принять машину» по записи создал заказ");
  // --- Админка: PIN, ЗП сейчас, отчёт, прайс Excel ---
  await click('[data-v="admin"]'); ok(await p.locator('.modal:has-text("Демо-PIN")').count() > 0, "админка просит PIN");
  await numpad("1234"); await shot("tablet-13-admin-pay");
  await click('[data-t="slip"]'); await shot("tablet-14-payslip");
  await click('[data-t="rep"]'); await shot("tablet-15-report");
  await click('[data-t="price"]');
  const [dl] = await Promise.all([p.waitForEvent("download"), click('[data-act="pxOut"]')]);
  const f = "/tmp/prais.xlsx"; await dl.saveAs(f);
  const wb = XLSX.readFile(f); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  ok(rows.length > 200, "прайс выгружен в .xlsx: " + rows.length + " строк");
  rows.find((r) => r["Раздел"] === "Легковые" && r["Услуга"] === "Балансировка" && r["Радиус"] === "R16")["Цена, ₽"] = 350;
  rows.find((r) => r["Услуга"] === "Ремонт жгутом")["Цена, ₽"] = 550;
  const wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(rows), "Прайс"); XLSX.writeFile(wb2, "/tmp/prais2.xlsx");
  await p.setInputFiles("#px-file", "/tmp/prais2.xlsx"); await p.waitForTimeout(400);
  ok(await p.locator("text=Изменится цен: 2").count() > 0, "загрузка показала 2 изменения было → стало");
  await shot("tablet-16-price-diff");
  await click("#px-apply"); st = await S();
  ok(st.prices.passenger.services["Балансировка"][3] === 350, "цены применены");
  await click('[data-t="set"]'); await p.fill('[data-tar="R16"]', "3700"); await p.locator('[data-tar="R16"]').dispatchEvent("change"); await p.waitForTimeout(150);
  st = await S(); ok(st.settings.storageTariff.R16 === 3700, "владелец поменял тариф хранения R16 → 3 700 ₽ в админке");
  await p.locator("#tariff").scrollIntoViewIfNeeded(); await shot("tablet-25-admin-tariff");
  await click('[data-v="kassa"]'); ok(await p.locator('.modal:has-text("PIN")').count() === 0, "выход из админки");
  await click('[data-v="admin"]'); ok(await p.locator('.modal:has-text("Демо-PIN")').count() > 0, "PIN запрашивается снова после ухода из админки"); await closeModal();
  // --- Склад ---
  await click('[data-v="warehouse"]'); await shot("tablet-17-warehouse");
  ok(await p.locator('tr:has-text("Грузики набивные (коробка)") [data-act="wBox"]').count() === 1 && await p.locator('tr:has-text("Грузики набивные") [data-act="wOff"]').count() === 0, "грузики: кнопка «Взять коробку», граммов нет");
  ok(await p.locator('text=Взять коробку').count() >= 1 && await p.locator('text=Выдать коробку').count() === 0, "п.6 кнопка переименована: «Взять коробку»");
  ok(await p.locator("text=заканчивается").count() === 0 && await p.locator("text=Заканчивается").count() === 0, "п.5 на складе кассы нет предупреждений «заканчивается»");
  st = await S(); const boxBefore = st.warehouse.items.find((i) => i.id === "w1").qty;
  await click('tr:has-text("Грузики набивные (коробка)") [data-act="wBox"]'); await shot("tablet-23-warehouse-box"); await click(".modal [data-ok]");
  st = await S(); ok(st.warehouse.items.find((i) => i.id === "w1").qty === boxBefore - 1 && st.warehouse.moves[st.warehouse.moves.length - 1].type === "box", "взята 1 коробка: " + boxBefore + " → " + (boxBefore - 1));
  await shot("tablet-17-warehouse");
  const [dl2] = await Promise.all([p.waitForEvent("download"), click('[data-act="wXls"]')]); ok(/\.xlsx$/.test(dl2.suggestedFilename()), "остатки склада выгружены: " + dl2.suggestedFilename());
  // --- Клиенты ---
  await click('[data-v="clients"]'); await p.fill("#c-q", "123"); await p.waitForTimeout(200);
  ok(await p.locator('.list-item:has-text("Иван")').count() > 0, "поиск по средним 3 цифрам номера"); await click('.list-item:has-text("Иван")'); await shot("tablet-18-clients");
  // 19.11 несколько машин у клиента; карточка правится без PIN, история изменений
  await p.fill("#c-q", "Т321ОР50"); await p.waitForTimeout(200);
  ok(await p.locator('.list-item[data-car]').count() === 1, "19.11 поиск по госномеру второй машины находит клиента сразу с этой машиной");
  await click('.list-item[data-car]'); ok(await p.locator('#c-detail .car-row').count() === 2 && await p.locator('#c-detail .car-row.sel:has-text("Газель")').count() === 1, "19.11 в карточке 2 машины, выбрана найденная (Газель)");
  await shot("tablet-50-client-two-cars");
  await click('[data-act="cEdit"]'); ok(await p.locator('.modal:has-text("Демо-PIN")').count() === 0 && await p.locator('.modal [data-save]').count() === 1, "19.11 карточку клиента можно править без PIN");
  await p.locator('.modal [data-row="0"] [data-cf="pFront"]').fill(""); await p.locator('.modal [data-row="0"] [data-cf="pFront"]').pressSequentially("23");
  ok((await p.locator('.modal [data-row="0"] [data-cf="pFront"]').inputValue()) === "2.3", "19.11 давление цифрами: 23 → 2.3 (точка сама)");
  const oldName = (await S()).clients.find((c) => (c.cars || []).some((x) => x.plate === "Т321ОР50")).name;
  await p.fill('.modal [data-f="name"]', "Иван Петров (демо)"); await shot("tablet-51-client-edit"); await click(".modal [data-save]");
  st = await S(); const ivan = st.clients.find((c) => (c.cars || []).some((x) => x.plate === "Т321ОР50"));
  ok(ivan.name === "Иван Петров (демо)" && ivan.history.some((h) => h.text === "Имя: " + oldName + " → Иван Петров (демо)" && h.who), "19.11 изменение записано: «Имя: " + oldName + " → Иван Петров (демо)», кто и когда");
  ok(await p.locator('#c-detail .chist:has-text("Иван Петров (демо)")').count() === 1, "19.11 история изменений видна в карточке"); await shot("tablet-52-client-history");
  // ===================== Пачка 18–19.11 =====================
  const kassa = async () => { await p.evaluate(() => { SM.ui.tab = "freq"; SM.ui.q = ""; SM.ui.go("kassa"); }); await p.waitForTimeout(200); };
  const barBox = async () => p.locator("#k-bar").boundingBox();
  // п.5, п.7: касса без заказа — нет баннера склада, полоса «Итого + Корзина» внизу, «Принять машину» одна
  await p.evaluate(() => { const S = SM.load(); S.ui.activeOrderId = null; S.ui.radius = "R16"; S.ui.type = "passenger"; SM.save(); }); await kassa();
  ok((await p.locator("#banner").innerText()).trim() === "", "п.5 на кассе нет баннера «Заканчивается на складе»");
  ok(await p.locator('.nb[data-v="warehouse"] .badge').count() === 0, "п.5 на кнопке «Склад» нет счётчика «заканчивается»");
  let bb = await barBox(); ok(bb && bb.y + bb.height <= 800 && bb.y > 600, "п.7 полоса «Итого + Корзина» закреплена внизу экрана 1280×800 (y=" + Math.round(bb.y) + "…" + Math.round(bb.y + bb.height) + ")");
  ok(await p.locator('#view button:has-text("Принять машину")').count() === 1, "п.7 «Принять машину» на экране одна (дубль убран)");
  await shot("tablet-30-kassa-empty");
  // п.1: Коммерческий на R14–R16, Газель только на R16
  await click('[data-act="radius"][data-r="R14"]'); ok(await p.locator('[data-act="type"][data-t="commercial"]').count() === 1 && await p.locator('[data-act="type"][data-t="gazel"]').count() === 0, "п.1 R14: есть «Коммерческий», нет «Газели»");
  await click('[data-act="radius"][data-r="R17"]'); ok(await p.locator('[data-act="type"][data-t="commercial"]').count() === 0, "п.1 R17: «Коммерческого» нет");
  await click('[data-act="radius"][data-r="R16"]'); ok(await p.locator('[data-act="type"][data-t="gazel"]').count() === 1, "п.1 R16: есть «Газель»");
  await click('[data-act="type"][data-t="gazel"]');
  ok(/6\s?150/.test(await p.locator('.tile.kit:has-text("Переобувка 6 колёс") .pr').innerText()), "19.11 Газель R16: «Переобувка 6 колёс» 6 150 ₽ (6 × 1 025 за колесо)");
  ok(await p.locator('.tile.kit:has-text("Переобувка 4 колеса")').count() === 0 && await p.locator('.tile:has-text("Снятие и установка 6 колёс")').count() === 1, "19.11 у Газели названия «6 колёс», не «4 колеса»");
  await click('.tile.kit:has-text("Переобувка 6 колёс") .addkit'); await typePlate("К321МН50");
  await click('[data-act="runflat"]');
  st = await S(); let og = st.orders.find((x) => x.plate === "К321МН50" && x.status !== "done");
  ok(og && og.items[0].typeKey === "gazel" && og.items[0].price === 6150 && og.runflat, "19.11 в заказ попала «Переобувка 6 колёс · Газель» 6 150 ₽, RunFlat включён");
  const barTotal = (await p.locator("#k-bar [data-total]").innerText()).replace(/\D/g, "");
  ok(barTotal === String(6150 + 1230), "RunFlat +20% на пакет: в нижней полосе итого " + barTotal + " = 6150 + 1230");
  bb = await barBox(); ok(bb.y + bb.height <= 800, "п.7 с заказом полоса итога тоже в пределах экрана");
  await shot("tablet-31-kassa-gazel-order");
  // п.11 товары на кассе
  await click('[data-act="tab"][data-t="goods"]'); await shot("tablet-32-kassa-goods");
  const gName = (await S()).products.find((x) => !x.hidden && x.qty > 2).name;
  const gBefore = (await S()).products.find((x) => x.name === gName).qty;
  await click('.tile.goods:has-text("' + gName + '") [data-q="2"]');
  st = await S(); og = st.orders.find((x) => x.id === og.id); ok(og.items.some((i) => i.goods && i.qty === 2 && i.name === gName), "п.11 товар «" + gName + "» ×2 добавлен в чек");
  await click('[data-act="toCart"]'); await click('[data-p="card"]'); await click(".modal [data-ok]");
  st = await S(); ok(st.products.find((x) => x.name === gName).qty === gBefore - 2, "п.11 товар списан со склада при оплате: " + gBefore + " → " + (gBefore - 2));
  const rcg = st.receipts[st.receipts.length - 1]; ok(rcg.totals.goods > 0 && rcg.goodsCost > 0, "п.11 в чеке отдельно товары " + rcg.totals.goods + " ₽ (закупка " + rcg.goodsCost + ")");
  await closeModal();
  // п.9 покраска
  await kassa(); await click('[data-act="tab"][data-t="paint"]'); await shot("tablet-33-kassa-paint-tab");
  const paintBefore = (await S()).receipts.length;
  await click('[data-act="paintNew"]');
  await click(".modal [data-pl]"); await typePlate("О888ОО77");
  await p.fill('.modal [data-f="phone"]', "+7 900 000-00-88"); await p.fill('.modal [data-f="name"]', "Покраска Тест (демо)");
  await p.fill('.modal [data-f="color"]', "графит"); await p.fill('.modal [data-f="paintPrice"]', "12000");
  ok(await p.locator('.modal [data-f="tireBrand"]').isHidden(), "п.9 поле «марка резины» скрыто, пока не отмечено «с резиной»");
  await click('.modal [data-f="caps"]'); await click('.modal [data-f="tires"]');
  ok(await p.locator('.modal [data-f="tireBrand"]').isVisible(), "п.9 «с резиной» → появилось поле «марка резины»");
  await p.fill('.modal [data-f="tireBrand"]', "Michelin X-Ice");
  await click('.modal [data-f="straighten"]'); await p.selectOption('.modal [data-f="strQty"]', "2"); await p.fill('.modal [data-f="strSum"]', "2500");
  await click('.modal [data-cond][value="сколы краски"]'); await click('.modal [data-cond][value="бордюрка (потёртости кромки)"]');
  await p.selectOption(".modal [data-svc]", "r:Снятие и установка 4-х колёс"); await p.waitForTimeout(150);
  ok(/Снятие и установка (4-х|6) колёс \(/.test(await p.locator(".modal").innerText()) && !(await p.locator(".modal [data-svadd]").first().isVisible()), "19.11 покраска: услуга из списка сразу добавляется (не надо жать «+ Добавить»)");
  await p.selectOption(".modal [data-svc]", "r:Балансировка"); await p.waitForTimeout(150);
  const pTot = (await p.locator(".modal [data-total]").innerText()).split("\n")[0].replace(/\D/g, "");
  await shot("tablet-34-paint-form");
  await click(".modal [data-save]");
  st = await S(); const pn = st.paint.find((x) => x.plate === "О888ОО77");
  ok(pn && pn.status === "paint" && pn.caps && pn.tires && pn.tireBrand === "Michelin X-Ice" && pn.straighten.qty === 2 && pn.items.length === 4, "п.9 наряд создан: колпачки, резина Michelin, правка 2 шт, 2 услуги из прайса");
  const pExp = await p.evaluate((id) => { const S = SM.load(); return SM.paint.totals(S, SM.paint.get(S, id)).total; }, pn.id);
  ok(pTot === String(pExp) && Number(pTot) > 14500, "19.11 покраска: итого в форме " + pTot + " = сумма наряда (покраска + правка + услуги)");
  ok(JSON.stringify(pn.diskCondition) === JSON.stringify(["сколы краски", "бордюрка (потёртости кромки)"]), "19.11 состояние дисков сохранено в наряде: " + pn.diskCondition.join(", "));
  ok(st.receipts.length === paintBefore, "п.9 при приёме оплаты нет (чеков не прибавилось)");
  await shot("tablet-35-paint-order");
  await closeModal(); await p.evaluate(() => SM.ui.go("cars")); await p.waitForTimeout(200);
  ok(await p.locator('.paint-card:has-text("О 888 ОО")').count() === 1 || await p.locator(".paint-card", { hasText: "Покраска Тест" }).count() === 1, "п.9 наряд в списке «В покраске» (Машины)");
  await shot("tablet-36-cars-paint");
  await click('.paint-card:has-text("Покраска Тест") [data-act="paintOpen"]');
  await p.selectOption(".modal [data-svc]", "f:Утилизация б/у автошины"); await p.waitForTimeout(200);
  st = await S(); ok(st.paint.find((x) => x.id === pn.id).items.length === 5, "п.9 в открытый наряд добавлена услуга из прайса");
  const due = await p.evaluate((id) => { const S = SM.load(); return SM.paint.totals(S, SM.paint.get(S, id)).total; }, pn.id);
  await click('.modal [data-pay="cash"]'); await click(".modal [data-ok]");
  st = await S(); const prc = st.receipts[st.receipts.length - 1];
  ok(st.receipts.length === paintBefore + 1 && prc.paintId === pn.id && prc.total === due && prc.items.length === 5, "п.9 выдача: один чек на всё — " + prc.total + " ₽, позиций " + prc.items.length);
  ok(st.paint.find((x) => x.id === pn.id).status === "done", "п.9 наряд «Выдано (оплачено)»");
  await shot("tablet-37-paint-receipt"); await closeModal();
  // п.2–3 живая очередь: планшет клиента queue.html
  const qp = await ctx.newPage(); const qerrs = []; qp.on("pageerror", (e) => qerrs.push(e.message));
  await p.evaluate(() => { const S = SM.load(); S.settings.printerIp = "192.168.1.77"; SM.save(); });
  await qp.goto(BASE + "queue.html"); await qp.waitForTimeout(300); await qp.screenshot({ path: OUT + "tablet-38-queue-kiosk.png" });
  const expNo = await qp.evaluate(() => SM.live.nextNo(SM.load()));
  await click("#take", qp); for (const ch of "Р505РР50") await click('.modal [data-k="' + ch + '"]', qp); await click('.modal [data-k="Готово"]', qp);
  ok(await qp.locator(".ticket .no").innerText() === "№" + expNo, "п.2 планшет выдал талон №" + expNo + " (нумерация за сегодня)");
  ok(await qp.locator("text=только в приложении").count() > 0, "п.4 на планшете честно: бумажный талон печатается только из APK");
  ok(await qp.locator(".qinfo >> text=Пост").count() === 1 && /3/.test(await qp.locator(".qinfo div >> nth=2").innerText()), "п.3 талон на пост 3 (живая очередь)");
  await qp.screenshot({ path: OUT + "tablet-39-queue-ticket.png" });
  await click("#ok", qp); await click("#take", qp); for (const ch of "Р505РР50") await click('.modal [data-k="' + ch + '"]', qp); await click('.modal [data-k="Готово"]', qp);
  ok(await qp.locator("text=Вы уже в очереди").count() > 0 && await qp.locator(".ticket .no").innerText() === "№" + expNo, "п.2 повторный ввод того же номера — тот же талон");
  ok(qerrs.length === 0, "queue.html без ошибок JS"); await qp.close();
  await p.reload(); await p.waitForTimeout(300); await p.evaluate(() => SM.ui.go("queue")); await p.waitForTimeout(200);
  ok(await p.locator(".list-item", { hasText: "№" + expNo }).count() === 1, "п.2 талон виден в кассе (Очередь)");
  ok(await p.locator(".post").count() === 3 && await p.locator(".post.bk").count() === 2 && await p.locator(".post.live").count() === 1, "п.3 три поста: 2 под запись, 1 под живую очередь");
  ok(await p.locator(".list-item .chip").count() > 0, "п.3 у каждого талона примерное ожидание");
  await shot("tablet-40-queue-posts");
  // 19.11 v5: «Следующий» — машина на пост и сразу открытый заказ (приёмка в одно нажатие, без шага «Вызваны — принять машину»)
  await click('[data-act="qNext"]'); await p.waitForTimeout(200);
  st = await S(); { const o = st.orders.find((x) => x.id === st.ui.activeOrderId); const q = o && st.queue.items.find((x) => x.no === o.queueNo && x.status === "called"); ok(o && o.status === "new" && q && q.post === 3, "п.3 / v5 «Следующий» ставит на пост 3 и сразу открывает заказ"); }
  await shot("tablet-74-next-opens-order");
  // 19.11 v5: следующая машина по записи подсвечена на карточке поста записи, «Принять №…» — сразу заказ
  await p.evaluate(() => { const S = SM.load(); if (!SM.live.freePosts(S, "booking").length) SM.live.release(S, 2); const t = new Date(SM.now() + 20 * 60e3); S.bookings.push({ id: "bk_e2e", ts: SM.now(), date: SM.dayKey(SM.now()), time: SM.pad(t.getHours()) + ":" + SM.pad(t.getMinutes()), direction: "full", name: "Запись E2E", phone: "79009998877", plate: "О777ОО77", comment: "", status: "new", orderId: null, clientId: null }); SM.save(); SM.ui.go("queue"); });
  await p.waitForTimeout(200);
  ok(await p.locator('.post.bk.has-next .post-next:has-text("Запись E2E")').count() >= 1, "v5 следующая машина по записи подсвечена на карточке поста записи (госномер, время, имя)");
  ok(await p.locator('.post-next [data-act="bAcceptPost"]:has-text("Принять № О777ОО77")').count() === 1, "v5 на свободном посту кнопка «Принять № О777ОО77»");
  await shot("tablet-75-posts-next-booking");
  await click('.post-next [data-act="bAcceptPost"]'); await p.waitForTimeout(200);
  st = await S(); { const o = st.orders.find((x) => x.plate === "О777ОО77"); ok(o && o.post && st.ui.activeOrderId === o.id && st.bookings.find((x) => x.id === "bk_e2e").status === "accepted", "v5 «Принять №…» в одно нажатие: заказ открыт, машина на посту " + (o && o.post)); }
  await shot("tablet-76-accept-one-tap");
  // п.4 принтер: IP + тестовая печать → честное сообщение
  await click('[data-v="admin"]'); await numpad("1234"); await click('[data-t="set"]');
  await p.fill('[data-s="printerIp"]', "192.168.1.50"); await p.locator('[data-s="printerIp"]').dispatchEvent("change"); await p.waitForTimeout(150);
  st = await S(); ok(st.settings.printerIp === "192.168.1.50", "п.4 IP принтера сохранён в админке");
  await click('[data-act="printerTest"]');
  ok(await p.locator(".modal >> text=только из приложения (APK)").count() > 0, "п.4 «Тестовая печать» в браузере: печать только из APK");
  ok(await p.locator(".modal .ticket-prev").count() === 1, "п.4 показан образец ленты");
  await shot("tablet-41-printer-test"); await closeModal();
  await p.fill('[data-s="printerIp"]', "999.1.1.1"); await p.locator('[data-s="printerIp"]').dispatchEvent("change"); await p.waitForTimeout(150);
  ok((await S()).settings.printerIp === "192.168.1.50", "п.4 неверный IP не сохраняется");
  // п.11 владелец: своя услуга, скрытие, товар
  await click('[data-t="cat"]'); await shot("tablet-42-admin-catalog");
  await click('[data-act="catGroup"][data-g="small"]'); await click('[data-act="svcNew"]');
  await p.fill('.modal [data-f="name"]', "Мойка колёс (тест)"); await p.fill('.modal [data-f="price"]', "400"); await click(".modal [data-save]");
  await click('[data-act="svcNew"]'); await p.fill('.modal [data-f="name"]', "Шиповка (тест)"); await p.selectOption('.modal [data-f="group"]', "tire"); await p.selectOption('.modal [data-f="mode"]', "radial");
  await p.fill('.modal [data-g="passenger|R16"]', "1100"); await p.fill('.modal [data-g="gazel|R16"]', "1600"); await shot("tablet-43-admin-service-radial"); await click(".modal [data-save]");
  st = await S(); ok(st.prices.custom.length === 2 && st.prices.custom[1].grid.gazel.R16 === 1600, "п.11 владелец добавил услуги: фикс 400 ₽ и «по радиусу и типу» (Газель R16 1 600 ₽)");
  await click('[data-act="catGroup"][data-g="small"]');
  await click('tr:has-text("Подкачка") [data-act="svcHide"]'); st = await S(); ok(st.prices.hidden.indexOf("f:Подкачка") >= 0, "п.11 «Подкачка» скрыта");
  await click('tr:has-text("Обработка герметиком") [data-act="svcEdit"]'); await p.fill('.modal [data-f="price"]', "170"); await click(".modal [data-save]");
  st = await S(); ok(st.prices.extras.items.find((i) => i.name === "Обработка герметиком").price === 170, "п.11 цена встроенной услуги изменена: герметик 170 ₽");
  await click('[data-act="prodNew"]'); await p.fill('.modal [data-f="name"]', "Тестовый товар (демо)"); await p.fill('.modal [data-f="price"]', "500"); await p.fill('.modal [data-f="cost"]', "200"); await p.fill('.modal [data-f="qty"]', "2"); await p.fill('.modal [data-f="min"]', "1"); await click(".modal [data-save]");
  st = await S(); ok(st.products.some((x) => x.name === "Тестовый товар (демо)" && x.qty === 2 && x.cost === 200), "п.11 товар добавлен: продажа 500, закупка 200, остаток 2");
  await shot("tablet-44-admin-catalog-after");
  // --- 19.11 v5: «Расходует со склада» в окне услуги ---
  await click('[data-act="catGroup"][data-g="repair"]'); await click('[data-act="svcNew"]');
  await p.fill('.modal [data-f="name"]', "ремонт заплатку r20 (тест)"); await p.fill('.modal [data-f="price"]', "1000");
  ok(await p.locator('.modal [data-uses] >> text=Нет нормы списания').count() === 1, "v5 в окне новой услуги подсказка «Нет нормы списания»");
  await p.locator(".modal [data-usearch]").pressSequentially("Заплатка R-2"); await p.waitForTimeout(150);
  await click('.modal [data-usugg] button:has-text("Заплатка R-20")');
  await p.locator(".modal [data-usearch]").pressSequentially("Клей для заплаток (тест)"); await p.waitForTimeout(150); await click(".modal [data-unew]");
  ok(await p.locator('.modal [data-urows]:has-text("Заплатка R-20")').count() === 1 && await p.locator('.modal [data-urows]:has-text("новая позиция")').count() === 1, "v5 «Расходует со склада»: выбрана заплатка R-20 и заведена новая позиция");
  await shot("tablet-70-service-uses");
  await click(".modal [data-save]");
  st = await S(); { const cs = st.prices.custom.find((c) => c.name === "ремонт заплатку r20 (тест)"); const ns = cs ? st.warehouse.norms.filter((n) => n.key === "c:" + cs.id) : []; const names = ns.map((n) => (st.warehouse.items.find((i) => i.id === n.itemId) || {}).name); ok(ns.length === 2 && names.indexOf("Заплатка R-20") >= 0 && names.indexOf("Клей для заплаток (тест)") >= 0 && ns.every((n) => n.perUnit === 1), "v5 своя услуга списывает со склада: Заплатка R-20 ×1 и новая позиция ×1"); }
  ok(await p.locator('tr:has-text("ремонт заплатку r20 (тест)") .nonorm').count() === 0, "v5 после привязки подсказки «нет нормы списания» у услуги нет");
  // --- 19.11 v5: склад ремонта в админке, «не задана» цена закупки ---
  await click('[data-t="wh"]');
  ok(await p.locator("text=укажите цену закупки").count() > 0 && await p.locator('tr:has-text("Ножка грибка №9")').count() > 0 && await p.locator('tr:has-text("Заплатка R-25")').count() > 0, "v5 склад ремонта: заплатки/грибки/ножка в админке, подсказка «укажите цену закупки»");
  ok(await p.locator('tr:has-text("Вулканизация")').count() === 0 && await p.locator('tr:has-text("Правка дисков") input[data-wc]').count() === 0, "v5 вулканизации и правки дисков на складе нет");
  await shot("tablet-71-admin-wh-repair");
  // --- 19.11 v5: справочник поставщиков в приходе ---
  const bal0 = (await S()).drawer.balance;
  await click('[data-v="warehouse"]'); await click('[data-act="wIn"]'); await p.waitForTimeout(150); if (!(await p.locator(".modal [data-sup]").count())) { await numpad("1234"); await p.waitForTimeout(150); }
  await p.locator(".modal [data-sup]").pressSequentially("шин"); await p.waitForTimeout(150);
  ok(await p.locator('.modal [data-sugg] button:has-text("Шинснаб")').count() === 1, "v5 поставщик ищется по первым буквам («шин» → ООО «Шинснаб»)");
  await shot("tablet-72-supplier-suggest");
  await click('.modal [data-sugg] button:has-text("Шинснаб")');
  ok(await p.locator('.modal [data-pay][value="cashless"]').isChecked(), "v5 выбор поставщика подставил способ оплаты (безнал)");
  await p.fill(".modal [data-inn]", "7701234567"); await p.fill(".modal [data-num]", "E2E-1");
  await p.selectOption(".modal [data-line] >> nth=0 >> [data-i]", { label: "Заплатка R-20 (шт)" }); await p.fill(".modal [data-line] >> nth=0 >> [data-q]", "20"); await p.fill(".modal [data-line] >> nth=0 >> [data-p]", "0");
  await click(".modal [data-ok]");
  st = await S(); { const d = st.warehouse.docs[st.warehouse.docs.length - 1]; const sp = st.warehouse.suppliers.find((x) => x.id === d.supplierId); ok(d.number === "E2E-1" && sp && sp.inn === "7701234567" && d.pay === "cashless" && st.drawer.balance === bal0, "v5 приход: поставщик из справочника, ИНН сохранён, безнал отмечен, касса не изменилась"); }
  await click('[data-act="wIn"]'); await p.waitForTimeout(150); if (!(await p.locator(".modal [data-sup]").count())) { await numpad("1234"); await p.waitForTimeout(150); }
  await p.locator(".modal [data-sup]").pressSequentially("Колёсный двор (тест)"); await p.fill(".modal [data-inn]", "500100732259"); await p.fill(".modal [data-sphone]", "+7 900 123-45-67"); await click('.modal [data-pay][value="cash"]');
  await p.selectOption(".modal [data-line] >> nth=0 >> [data-i]", { label: "Заплатка R-15 (шт)" }); await p.fill(".modal [data-line] >> nth=0 >> [data-q]", "10");
  await shot("tablet-73-supplier-new");
  await click(".modal [data-ok]");
  st = await S(); { const sp = st.warehouse.suppliers.find((x) => x.name === "Колёсный двор (тест)"); const d = st.warehouse.docs[st.warehouse.docs.length - 1]; ok(sp && sp.inn === "500100732259" && sp.phone === "79001234567" && sp.pay === "cash" && d.pay === "cash" && st.drawer.balance === bal0, "v5 новый поставщик заведён из прихода (ИНН, телефон, наличные — только отметка, из кассы не вычтено)"); }
  await click('[data-act="wIn"]'); await p.waitForTimeout(150); if (!(await p.locator(".modal [data-sup]").count())) { await numpad("1234"); await p.waitForTimeout(150); } await p.locator(".modal [data-sup]").pressSequentially("кол"); await p.waitForTimeout(150);
  ok(await p.locator('.modal [data-sugg] button:has-text("Колёсный двор (тест)")').count() === 1, "v5 в следующий раз новый поставщик ищется по первым буквам"); await closeModal();
  await click('[data-v="kassa"]'); await click('[data-act="tab"][data-t="small"]');
  ok(await p.locator('.tile:has-text("Мойка колёс (тест)")').count() === 1 && await p.locator('.tile:has-text("Подкачка")').count() === 0, "п.11 на кассе: новая услуга видна, скрытая — нет");
  await click('[data-act="tab"][data-t="tire"]'); await click('[data-act="type"][data-t="gazel"]');
  ok(/1\s?600/.test(await p.locator('.tile:has-text("Шиповка (тест)") .pr').innerText()), "п.11 своя услуга по радиусу: Газель R16 = 1 600 ₽");
  await click('[data-act="tab"][data-t="goods"]'); ok(await p.locator('.tile.goods:has-text("Тестовый товар (демо)") [data-q="4"]').isDisabled(), "п.11 нельзя продать больше остатка (×4 при остатке 2 неактивна)");
  // п.8 полный экран и установка
  const man = await p.evaluate(() => fetch("manifest.webmanifest").then((r) => r.json()));
  ok(man.display === "fullscreen" && man.display_override[0] === "fullscreen" && man.icons.some((i) => i.sizes === "512x512"), "п.8 manifest: display fullscreen, иконки 192/512");
  ok((await p.evaluate(() => Promise.all(["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"].map((u) => fetch(u).then((r) => r.status))))).every((x) => x === 200), "п.8 иконки PWA доступны");
  ok(await p.locator('.hdr [data-act="fullscreen"]').count() === 1, "п.8 кнопка ⛶ полного экрана в шапке");
  await click('.hdr [data-act="fullscreen"]'); await p.waitForTimeout(300);
  log("полный экран в headless: document.fullscreenElement = " + (await p.evaluate(() => !!document.fullscreenElement)));
  await p.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await p.waitForTimeout(200);
  // п.10 напоминания: запись с каналом MAX + согласие → автоматически за 2 ч → журнал у владельца
  const bp2 = await ctx.newPage(); await bp2.setViewportSize({ width: 390, height: 844 });
  await bp2.goto(BASE + "book.html"); await bp2.waitForTimeout(300);
  await click('[data-dir="wheels"]', bp2); await click('[data-day] >> nth=2', bp2); await click('[data-time]:not([disabled]) >> nth=3', bp2);
  await bp2.fill("#b-name", "Напомни Мне (демо)"); await bp2.fill("#b-phone", "+7 900 000-00-44");
  await click('[data-ch="max"]', bp2); await click("#b-rem", bp2); await click("#b-ok", bp2);
  await bp2.screenshot({ path: OUT + "iphone-09-book-reminder.png", fullPage: true });
  await click("#b-send", bp2); ok(await bp2.locator("text=Напомним через MAX").count() > 0, "п.10 онлайн-запись: выбран MAX и дано согласие на напоминания"); await bp2.close();
  await p.reload(); await p.waitForTimeout(300);
  st = await S(); const bkR = st.bookings.find((x) => x.name === "Напомни Мне (демо)"); const cR = st.clients.find((c) => c.id === bkR.clientId);
  ok(cR.notify && cR.notify.channel === "max" && cR.notify.consent, "п.10 у клиента канал MAX и флаг согласия");
  // перематываем часы кассы на 1 ч 59 мин до визита и ждём автозапуска (runReminders вызывается таймером, здесь — тот же вызов)
  await p.evaluate((id) => { const S = SM.load(); const b = S.bookings.find((x) => x.id === id); SM.clock.offset = SM.reminders.visitTs(b) - 2 * 36e5 + 60e3 - Date.now(); SM.ui.runReminders(); }, bkR.id);
  st = await S(); const sent = st.reminders.log.filter((e) => e.bookingId === bkR.id);
  ok(sent.some((e) => e.kind === "2h" && e.status === "sent" && e.channel === "max" && e.demo), "п.10 напоминание за 2 ч «отправлено» (имитация) через MAX");
  ok(sent.some((e) => e.kind === "24h" && e.status === "skip"), "п.10 за 24 ч не дублируется задним числом (пропуск с причиной)");
  await p.evaluate(() => SM.ui.go("bookings")); await p.waitForTimeout(200); await shot("tablet-45-bookings-reminders");
  await p.evaluate(() => { SM.clock.offset = 0; });
  const op = await ctx.newPage(); await op.setViewportSize({ width: 390, height: 844 }); await op.goto(BASE + "owner.html"); await op.waitForTimeout(300);
  for (const ch of "1234") await click('[data-n="' + ch + '"]', op); await op.waitForTimeout(300);
  ok(await op.locator("text=Напоминания о записи — журнал").count() === 1 && await op.locator("details", { hasText: "Напомни Мне" }).count() >= 1, "п.10 журнал отправок у владельца");
  ok(await op.locator("text=Заканчивается — пора заказать").count() === 1, "п.5 предупреждения об остатках — на owner.html");
  ok(await op.locator("text=В покраске").count() >= 1, "п.9 список «В покраске» у владельца");
  ok(await op.locator('#own-chlog:has-text("Иван Петров (демо)")').count() === 1, "19.11 владелец видит изменения карточек клиентов (кто, когда, было → стало)");
  await op.screenshot({ path: OUT + "iphone-10-owner-new.png", fullPage: true }); await op.close();
  await click('[data-v="kassa"]');
  // ===================== Правки 19.11 (после публикации v2) =====================
  await p.reload(); await p.waitForTimeout(300); await kassa();
  // «Готова, ждёт оплаты» — выделено на кассе и в «Машинах»
  await p.evaluate(() => { const S = SM.load(); const r = SM.orders.create(S, { plate: "У909УУ77" }, "т"); SM.orders.setStatus(S, r.order, "ready", "т"); S.ui.activeOrderId = null; SM.save(); }); await kassa();
  ok(await p.locator('.order-switch .ready:has-text("Готова, ждёт оплаты")').count() >= 1, "19.11 на кассе готовая машина: «Готова, ждёт оплаты», выделена");
  await p.evaluate(() => SM.ui.go("cars")); await p.waitForTimeout(200);
  ok(await p.locator('.chip.ready:has-text("Готова, ждёт оплаты")').count() >= 1, "19.11 в «Машинах» статус «Готова, ждёт оплаты»"); await shot("tablet-53-cars-ready");
  // счётчик «Машины» — без покраски
  const cnt = await p.evaluate(() => ({ badge: (document.querySelector('.nb[data-v="cars"] .badge') || {}).textContent || "0", open: SM.orders.open(SM.load()).length, paint: SM.paint.active(SM.load()).length }));
  ok(String(cnt.open) === cnt.badge, "19.11 счётчик «Машины» = машины на постах/в работе (" + cnt.badge + "), покраска (" + cnt.paint + ") не считается");
  // часы в шапке в полноэкранном режиме
  await p.evaluate(() => { SM.ui._fs = SM.ui.isFullscreen; SM.ui.isFullscreen = () => true; SM.ui.render(); }); await p.waitForTimeout(150);
  ok(await p.locator("#hdr-clock").isVisible() && /^\d{2}:\d{2}$/.test((await p.locator("#hdr-clock").innerText()).trim()), "19.11 в полноэкранном режиме в шапке видны часы");
  await shot("tablet-54-header-clock");
  await p.evaluate(() => { SM.ui.isFullscreen = SM.ui._fs; SM.ui.render(); }); await p.waitForTimeout(150);
  ok(await p.locator("#hdr-clock").count() === 0, "19.11 в обычном окне часов в шапке нет (часы есть у системы)");
  // фото подписанного акта (камера планшета) в заказе
  await p.evaluate(() => { const S = SM.load(); const o = SM.orders.open(S).find((x) => x.plate === "У909УУ77"); S.ui.activeOrderId = o.id; SM.save(); SM.ui.go("order"); }); await p.waitForTimeout(200);
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), click('[data-act="orderActPhoto"]')]);
  ok(fc.page() === p, "19.11 «Сфотографировать акт» открывает камеру (input capture)");
  await fc.setFiles(OUT + "tablet-01-kassa.png"); await p.waitForTimeout(800);
  st = await S(); const oa = st.orders.find((x) => x.plate === "У909УУ77" && x.status !== "done");
  const hasPhoto = await p.evaluate((id) => !!localStorage.getItem("shinamashina_web_demo_photo_" + id), oa.actPhotos && oa.actPhotos[0] && oa.actPhotos[0].id);
  ok(oa.actPhotos && oa.actPhotos.length === 1 && hasPhoto, "19.11 фото акта прикреплено к заказу (и попадёт в карточку клиента)"); await shot("tablet-55-order-act-photo");
  // подсказка клиента при вводе имени (хранение)
  await p.evaluate(() => { const S = SM.load(); S.ui.activeOrderId = null; SM.save(); SM.ui.go("storage"); }); await p.waitForTimeout(200); await click('[data-act="storageNew"]');
  await p.locator('.modal [data-f="name"]').pressSequentially("Иван Пет"); await p.waitForTimeout(300);
  ok(await p.locator(".modal .sugg-i").count() >= 1, "19.11 при вводе имени — подсказка клиента из базы");
  await click(".modal .sugg-i"); ok(await p.locator('.modal:has-text("Какая машина приехала?")').count() === 1, "19.11 у клиента 2 машины — спрашиваем, какая приехала"); await shot("tablet-56b-pick-car"); await click(".modal .car-pick >> nth=1"); await p.waitForTimeout(200); log("plate box: " + (await p.locator(".modal [data-pl]").first().innerText()).replace(/\s/g, ""));
  ok((await p.locator(".modal [data-pl]").first().innerText()).replace(/\s/g, "").indexOf("Т321ОР") >= 0, "19.11 выбранная машина подставила госномер"); ok((await p.locator('.modal [data-f="phone"]').inputValue()).replace(/\D/g, "").length === 11, "19.11 выбор подсказки заполнил телефон"); await shot("tablet-56-typeahead"); await closeModal();
  // склад: история расходов — под PIN
  await p.evaluate(() => SM.ui.go("warehouse")); await p.waitForTimeout(200); await click('[data-act="wHist"]');
  ok(await p.locator('.modal:has-text("PIN")').count() > 0, "19.11 «История расходов» склада — только через PIN владельца"); await closeModal();
  // админка: время на услуги для очереди
  await click('[data-v="admin"]'); await numpad("1234"); await click('[data-t="set"]');
  ok(await p.locator('[data-s="durFull"]').count() === 1 && await p.locator('[data-s="durWheels"]').count() === 1 && await p.locator('[data-s="durMount"]').count() === 1, "19.11 владелец задаёт время: полный шиномонтаж / на дисках / снять-поставить");
  await p.fill('[data-s="durWheels"]', "30"); await p.locator('[data-s="durWheels"]').dispatchEvent("change"); await p.waitForTimeout(150);
  ok((await S()).settings.durWheels === 30, "19.11 время «Переобувка колёс на дисках» сохранено: 30 мин"); await p.locator('[data-s="durFull"]').scrollIntoViewIfNeeded(); await shot("tablet-57-admin-durations");
  await click('[data-v="kassa"]');
  // клиентский планшет client.html
  const kp = await ctx.newPage(); const kerrs = []; kp.on("pageerror", (e) => kerrs.push(e.message)); await kp.setViewportSize({ width: 1280, height: 800 });
  await kp.goto(BASE + "client.html"); await kp.waitForTimeout(400);
  ok(await kp.locator("text=Перед вами").count() === 1 && await kp.locator("#k-ticket").isVisible() && await kp.locator("#k-form").isVisible() && await kp.locator(".kfoot svg").count() === 1, "19.11 планшет клиента: очередь «Перед вами N машин», 2 большие кнопки, QR на запись");
  await kp.screenshot({ path: OUT + "tablet-60-client-home.png" });
  await click("#k-ticket", kp); for (const ch of "Т321ОР50") await click('.modal [data-k="' + ch + '"]', kp); await click('.modal [data-k="Готово"]', kp);
  ok(await kp.locator("text=Здравствуйте, Иван Петров!").count() === 1, "19.11 известная машина — «Здравствуйте, Иван Петров!», без анкеты"); await kp.screenshot({ path: OUT + "tablet-61-client-hello.png" });
  await click('[data-svc="wheels"]', kp); ok(await kp.locator(".ticket .no").count() === 1, "19.11 талон выдан");
  st = await S(); ok(st.queue.items.some((q) => q.plate === "Т321ОР50" && q.service === "wheels"), "19.11 в талоне записан вид работ (для расчёта ожидания)"); await kp.screenshot({ path: OUT + "tablet-62-client-ticket.png" });
  await click("#t-ok", kp); await click("#k-form", kp);
  await kp.fill("#f-name", "Новый Клиент (демо)"); await kp.locator("#f-phone").focus(); ok((await kp.locator("#f-phone").inputValue()).startsWith("+7"), "19.11 анкета: телефон начинается с +7");
  await kp.locator("#f-phone").pressSequentially("9001234500");
  await click("#f-plate", kp); for (const ch of "Н505НН50") await click('.modal [data-k="' + ch + '"]', kp); await click('.modal [data-k="Готово"]', kp);
  await kp.locator("#f-pf").pressSequentially("22"); await kp.locator("#f-pr").pressSequentially("30");
  ok((await kp.locator("#f-pf").inputValue()) === "2.2" && (await kp.locator("#f-pr").inputValue()) === "3.0", "19.11 давление «Перед/Зад»: 22 → 2.2, 30 → 3.0");
  ok(await kp.locator("#f-send").isDisabled(), "19.11 без согласия анкету не отправить"); await click("#f-ok", kp); await kp.screenshot({ path: OUT + "tablet-63-client-form.png", fullPage: true }); await click("#f-send", kp);
  ok(await kp.locator("text=Взять талон в очередь?").count() === 1, "19.11 после анкеты предлагаем взять талон");
  st = await S(); const nc = st.clients.find((c) => c.name === "Новый Клиент (демо)"); ok(nc && nc.cars[0].plate === "Н505НН50" && nc.cars[0].pFront === "2.2" && nc.cars[0].pRear === "3.0" && nc.consent, "19.11 анкета сохранена: машина, давление, согласие");
  await kp.evaluate(() => SM.kioskIdleSec(2)); await kp.waitForTimeout(3500);
  ok(await kp.locator("#k-ticket").isVisible() && await kp.locator("text=Взять талон в очередь?").count() === 0, "19.11 без действий — возврат на главную, введённое стёрто");
  ok(kerrs.length === 0, "client.html без ошибок JS" + (kerrs.length ? ": " + kerrs.join("; ") : "")); await kp.close();
  // --- Закрытие смены ---
  await click('[data-v="shift"]'); await click('[data-act="shiftClose"]'); await click(".modal [data-ok]"); await shot("tablet-19-close-summary");
  ok(await p.locator('.modal:has-text("Остаток в ящике после ЗП")').count() > 0, "итоги закрытия смены");
  await closeModal();
  // --- iPhone ---
  const ph = await ctx.newPage(); await ph.setViewportSize({ width: 390, height: 844 });
  await ph.goto(BASE + "index.html#kassa"); await ph.waitForTimeout(300); await ph.screenshot({ path: OUT + "iphone-01-kassa.png" });
  await ph.goto(BASE + "owner.html"); await ph.waitForTimeout(300); await ph.screenshot({ path: OUT + "iphone-02-owner-pin.png" });
  for (const ch of "1234") await click('[data-n="' + ch + '"]', ph);
  await ph.waitForTimeout(300); await ph.screenshot({ path: OUT + "iphone-03-owner.png", fullPage: true });
  await ph.goto(BASE + "client.html"); await ph.waitForTimeout(300); await click("#k-form", ph); await ph.screenshot({ path: OUT + "iphone-04-client-form.png" });
  await click("#f-details summary", ph); ok(await ph.locator("#f-details >> text=Цели обработки").isVisible(), "анкета: полный текст согласия раскрывается");
  await ph.screenshot({ path: OUT + "iphone-08-consent.png" });
  await ph.goto(BASE + "index.html#clients"); await ph.waitForTimeout(300); await ph.screenshot({ path: OUT + "iphone-06-clients.png" });
  await ph.goto(BASE + "index.html#cars"); await ph.waitForTimeout(300); await ph.screenshot({ path: OUT + "iphone-07-cars.png" });
  ok(errs.length === 0, "ошибок JS нет" + (errs.length ? ": " + errs.join("; ") : ""));
  await b.close();
  console.log("\nE2E: ВСЕ СЦЕНАРИИ ПРОЙДЕНЫ");
})().catch((e) => { console.error(e.message); process.exit(1); });
