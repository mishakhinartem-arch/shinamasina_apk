# Архитектура веб-демо кассы «Шинамашина»

Дополнение к [README.md](../README.md): состояние, миграции и бизнес-правила с указанием функций и решений Артёма. Только то, что есть в коде или явно записано в `pravki.md`.

## Оглавление

1. [Состояние](#состояние)
2. [Миграции](#миграции)
3. [Ключевые функции](#ключевые-функции)
4. [Бизнес-правила](#бизнес-правила)
5. [Настройки по умолчанию](#настройки-по-умолчанию)

## Состояние

Ключ `localStorage`: `shinamashina_web_demo_v1` (`SM.STORE_KEY` в `js/store.js`). Имя ключа историческое, **версию данных смотреть в `S.version`**, не в имени ключа.

Фото: отдельные ключи `shinamashina_web_demo_photo_<id>` (`SM.photos` в `js/clients.js`). В UI снимок с камеры уменьшается до 1280 px по длинной стороне, JPEG качество ≈ 0,7 (`ui/base.js`). `SM.resetDemo` чистит и состояние, и фото.

Загрузка: `SM.load` / `SM.save` / `SM.onSave` / `SM.reload`. Другие вкладки (запись, киоск) подхватываются через `window` event `storage`. В тестах (нет `localStorage`) `SM.setState` + прямой вызов логики.

`SM.emptyState()` (поле → смысл):

- `version` — версия схемы (сейчас 5)
- `createdAt` — когда создано состояние
- `settings` — копия `SM.DEFAULT_SETTINGS`, у живых данных сливается с дефолтом при загрузке
- `prices` — рабочий прайс (копия `PRICES` + массивы `custom`, `hidden`)
- `employees[]` — `{id, name, percent, active}`; `active: false` — архив, на смену не предлагается
- `clients[]` — карточки; у каждого `cars[]`, `history[]`, зеркальные поля первой машины `plate/car/wheel_size/typeKey`, `consent`, `notify`
- `orders[]`, `orderSeq` — заказ-наряды кассы
- `receipts[]`, `receiptSeq` — чеки (`kind`: `service` | `storage`)
- `shifts[]` — смены; открытая — та, у которой `endedAt == null`
- `drawer` — `{balance, moves[]}` денежный ящик
- `collections[]` — инкассации
- `queue` — `{seq, items[]}` талоны живой очереди; нумерация на день считается по полю `day`, не по глобальному счётчику
- `products[]`, `productMoves[]` — товары для продажи
- `paint[]`, `paintSeq` — наряды покраски
- `reminders.log[]` — журнал напоминаний (обрезка до последних 500)
- `storage[]`, `storageSeq` — комплекты хранения (номер вида `Х-0001`)
- `bookings[]` — онлайн-записи
- `payroll` — `{adjustments[], payments[]}`
- `expenses` — `{recurring[], oneoff[], categories[]}`
- `warehouse` — `{items[], norms[], moves[], docs[], suppliers[]}`; поставщик `{id, name, inn, phone, pay: "cash"|"cashless"|"", createdAt}`; накладная `doc` хранит `supplier` (название), `supplierId`, `pay` (только отметка)
- `ui` — локальный контекст кассы: оператор, радиус, тип авто, активный заказ

## Миграции

`SM.STATE_VERSION = 5`. Комментарий в `store.js`: 2 — тариф хранения и грузики коробками; 3 — товары, покраска, напоминания, живая очередь; 4 — несколько машин и история карточки, Газель 6 колёс; 5 — позиции ремонта на складе и нормы.

Порядок в `SM.load()` после `JSON.parse`:

1. Если `st.version === 3` — `SM.clients.migrateV3(st)` → `version = 4`. Клиентам собирается `cars[]` из старых полей, вызывается `SM.prices.gazelKitFix` (меняет 5 500 на 6 × «Итого за 1 колесо», **только если** в колонке «Газель» ещё ровно 5 500 и цена за колесо > 0).
2. Если `st.version === 4` — `SM.warehouse.migrateRepairStock(st)` → `ensureRepairStock` + справочник поставщиков из прошлых накладных + `version = 5`; мигрированное состояние сразу сохраняется (`SM.save`).
3. Если `(st.version || 1) >= STATE_VERSION` — это состояние оставляем, `settings` = `DEFAULT_SETTINGS` + сохранённые.
4. Иначе (v1, v2, мусор, нет данных) — `SM.seed()` пересоздаёт демо.

`ensureRepairStock` идемпотентна: ищет позицию по нормализованному имени (регистр, дефисы/тире, `R20` = `R-20`). Существующие id, названия, `cost`, `qty`, `min` не затирает. Норму добавляет, только если ключа ещё нет. Список имён берёт из `prices.repair.items`; пропуски явно заданы в `W.REPAIR_SKIP` («Ремонт камеры», «Вулканизация бескамерной», «Правка дисков»). Дополнительные нормы: `f:Ремонт жгутом` → «Жгут ремонтный», `f:Ремонт грибком` → «Грибок №7». Ключи вида `c:…` не создаёт и не меняет.

Свежий `SM.seed()` сразу вызывает `ensureRepairStock`. Для уже мигрированных v5 повторно при загрузке **не вызывается** — это ограничение текущей схемы.

## Ключевые функции

| Задача | Где |
|---|---|
| Загрузка/сброс состояния | `SM.load`, `SM.save`, `SM.resetDemo` |
| Каталог и свои услуги | `SM.prices.catalog`, `addCustom`, `updateCustom`, `setHidden`, `setRadialPrice`, `setFlatPrice`, `gazelKitFix` |
| Итог чека, лимит скидки, база % | `SM.cart.totals`, `checkDiscount`, `serviceAmount`, `paintAmount`, `goodsAmount`, `storageAmount` |
| Заказ | `SM.orders.create`, `addItem`, `addStorage`, `setDiscount`, `setStatus`, `pay`, `repeatLast` |
| Смена и ящик | `SM.shift.open`, `clockIn`, `clockOut`, `close`, `collect`, `revenue`, `drawerMove` |
| ЗП | `SM.payroll.calcShift`, `forShift`, `ledgerFor`, `payslip`, `addAdjustment`, `payDay` |
| Склад | `SM.warehouse.setNorm`, `autoWriteOff`, `receive`, `writeOff`, `inventory`, `ensureRepairStock`, `migrateRepairStock`, `costUnset`, `serviceUses`, `setServiceUses`, `servicesWithoutNorm` |
| Поставщики | `SM.warehouse.suppliers`, `supplier`, `findSuppliers`, `saveSupplier`, `PAY_RU` |
| Товары | `SM.products.add`, `update`, `addToOrder`, `checkStock`, `writeOff` |
| Хранение | `SM.storage.calcPrice`, `create`, `pay`, `issue` |
| Запись | `SM.booking.slots`, `create`, `accept(S, b, who, {post})`, `durMin`, `upcoming`, `nextForPosts`, `SERVICE_FOR` |
| Очередь | `SM.live.take`, `call`, `next`, `acceptNext`, `accept`, `waitMin`, `model`, `startOn`, `postsState`, `canBorrow`, `release` |
| Покраска | `SM.paint.create`, `addService`, `setReady`, `pay` |
| Клиенты | `SM.clients.search`, `update`, `findByPlate`, `carVisits`, `kioskSave` (`SM.kioskSave`) |
| Напоминания | `SM.reminders.setClient`, `run`, `plan` |
| Отчёты | `SM.reports.range`, `month`, `compare`, `SM.expenses.addRecurring` |
| Принтер | `SM.printer.print`, `ticketLines`, `escpos` |

## Бизнес-правила

### Зарплата

Как в рабочей кассе (`calc_period_payroll`): события = начало смены, приходы/уходы, конец. В каждом полуинтервале выручка чеков услуг (`SM.cart.serviceAmount`: итог минус хранение, товары и позиция покраски) × (`percent` мастера / N присутствующих) / 100. Округление `SM.round50`. Минимум `settings.minPay` (4000) применяется только если часов по отметкам ≥ `minPayHours` (8): иначе платится округлённая сумма, даже если она меньше минимума. Пришедший позже не делится выручкой, которая была до его `in`.

При закрытии смены (`SM.shift.close`) всем проставляется `out`, ЗП пытаются выдать из ящика; нехватка → `debt`. Если день уже оплачен (`payDay` / `isDayPaid`) — сумма в долг, повторно из ящика не платим. В расчётном листе: начислено = смены + премии − штрафы; выплачено = выплаты смен + авансы; долг = начислено − выплачено.

Почему покраска не в %: ответ Артёма 19.11, зафиксирован в `pravki.md` и в комментарии `SM.cart.paintAmount`. Почему хранение и товары не в %: решение Артёма, отдельные строки дохода, не работа мастеров на посту в смысле процента с услуг.

### Касса, смена, инкассация

Оплата заказа возможна только при открытой смене. Наличные увеличивают ящик, карта и QR — нет. Инкассация проверяет PIN `S.settings.pin`, сумму > 0 и остаток ящика. Пересчёт «Факт» при открытии/приходе пишет движение `recount` (излишек или недостача).

### Скидки и RunFlat

`SM.cart.totals`: `base` — услуги без флагов `goods` / `noDiscount` / `key === "paint"`; `surcharge` = 20% от суммы строк с `surchargeEligible`, если в заказе `runflat`. Скидка постоянному и ручная считаются от `base + surcharge`. Хранение, товары, покраска идут в итог без скидки.

Постоянный клиент: при создании или привязке заказа, если `SM.clientVisits` (чеки `kind === "service"`) уже есть хотя бы один — включается `loyalty`. Скидка общая на все машины клиента.

Лимит (`discountMaxPct`, `discountMaxRub`) сравнивается только с **ручной** скидкой. Так решил Артём: 10% постоянному — правило владельца, в лимит кассира не входит.

Список RunFlat-услуг — `PRICES.surchargeEligibleNames` в `prices-data.js`.

### Посты и ожидание

`SM.live.posts`: в `seasonMode` первые `bookingPosts` постов — запись, остальные — живая очередь; вне сезона все посты — живая очередь. Занятость (`postsState`): вызванный талон (пока связанный заказ не `ready`) или заказ по записи со статусом `new`/`work`. Статус `ready` («Готова, ждёт оплаты») пост не занимает — так решил Артём 19.11 13:12: машина не должна пропадать из списка до оплаты, но пост должен освободиться.

«Занять пост записи» очередью (`canBorrow`): свободных постов записи больше, чем записей со статусом `new` в окне `[сейчас − 30 мин; сейчас + длительность услуги)`.

`waitMin(S, no, now)`:

1. Для каждого поста `freeAt` = сейчас, либо `calledAt`/`createdAt` + длительность услуги, но не раньше чем сейчас + 5 мин.
2. Сегодняшние записи `status === "new"` с временем не раньше чем сейчас − 30 мин раскладываются на посты записи (кто раньше освободится), как занятые интервалы-блоки.
3. Талоны впереди (`status === "wait"`, меньший номер) ставятся на пост, где получится начать раньше всех, учитывая блоки записей (`startOn`).
4. Ожидание данного талона = начало его интервала − сейчас, округление **вверх** до 5 мин, не меньше 0.

Длительность талона: если выбран вид работ (`q.service`) — `SM.booking.durMin`, иначе `durFull` (запасное поле `avgServiceMin`). Вне сезона постов записи нет — записи раскладываются по всем постам. Начало работы машины на посту: `calledAt` талона или `acceptedAt` / `createdAt` заказа.

### Приёмка в одно нажатие (v5)

`SM.booking.nextForPosts`: ближайшие записи на сегодня (`status === "new"`, опоздавшие до 60 мин тоже) по времени раздаются постам записи — сначала свободным по номеру, потом занятым. `SM.booking.accept(S, b, who, {post})` ставит на указанный свободный пост (или первый свободный пост записи), пишет `order.acceptedAt`, подставляет клиента и, если у машины известен радиус, услугу из записи по `B.SERVICE_FOR` с ценой из прайса. `SM.live.acceptNext` / `accept` — вызов талона на пост + заказ сразу (повторно — тот же заказ). Если поста нет — талон остаётся ждать, заказ не создаётся.

### Поставщики и «Расходует со склада» (v5)

`W.receive(S, {supplierId | supplierData, pay, …})`: поставщик из справочника или новый (`saveSupplier`: повтор по ИНН или нормализованному названию — тот же). `pay` — только отметка, ящик (`S.drawer`) не меняется. `W.setServiceUses(S, key, uses)` заменяет нормы услуги (ключ `r:`/`f:`/`c:`), может завести новую позицию склада (закупка 0); коробочные позиции отвергаются.

### Склад и товары

Норма: `{key, itemId, perUnit}`. Автосписание при `orders.pay` и при выдаче покраски: `perUnit * qty` позиции чека, кроме коробочных позиций. Себестоимость движения берётся из `item.cost` на момент списания.

Грузики: `W.isBox` — приход, «Взять коробку» (`type: "box"`) и инвентаризация только целыми коробками, `setNorm` для них отвергается.

Товары — другой массив (`S.products`), не расходники. Флаг позиции чека `goods: true`, `noDiscount: true`.

### Хранение

Цена: `(тариф радиуса + доплата за диски, если rims) * months/seasonMonths * qty/4`, затем `round50`. Оплата может быть отдельным чеком `kind: "storage"` или строкой в заказе (`SM.orders.addStorage`) — тогда скидки на эту строку не действуют. Ручная цена только с `priceOverride` (в UI — после PIN).

Реквизиты в `SM.storage.REQUISITES` совпадают с открытыми данными ИП (телефон выбран Артёмом 10.11: +7 (995) 506-95-62). Тексты договора и согласия — шаблоны, юристом не проверены.

### Покраска

Наряд: `status` `paint` → `ready` → `done` (или `cancel`). Позиция покраски всегда `key: "paint"`. Правка добавляется как `f:Правка дисков` с ручной суммой. Услуги прайса — обычные ключи `r:`/`f:`. При `SM.paint.pay` чек создаётся с `loyalty: false`, `runflat: false`; склад списывается по нормам услуг в наряде. В счётчик машин на кассе наряды покраски не входят (проверка в UI/тестах 19.11).

### Напоминания

`SM.reminders.run` раз в минуту с кассы/страницы владельца (кто вызывает — UI). Не напоминаем, если запись уже не `new` или визит наступил. Пропуски с причиной: запись сделана позже окна; касса была выключена и до визита уже меньше 2 ч — 24-часовое пропускается в пользу 2-часового; нет согласия или канала. В демо `transport == null` → `status: "sent"`, `demo: true`. Подключать реальный транспорт (`SM.reminders.transport`) только после отдельного «да»; платный SMS — только после «да».

### Принтер

Контракт APK: `window.AndroidPrinter.print(ip, port, base64Bytes)` возвращает `"ok"` или текст ошибки. В браузере и в Node `PR.available()` ложно, `print` возвращает `reason: "browser"` и байты для образца ленты. Кодировка CP866, кодовая страница ESC t 17. На живом принтере не проверялось.

## Настройки по умолчанию

`SM.DEFAULT_SETTINGS` в `js/store.js` (демо-значения, владелец меняет в админке):

- `pin`: `"1234"`
- `discountMaxPct`: 15, `discountMaxRub`: 1000 (0 = без ограничений)
- `loyaltyPct`: 10, `surchargePct`: 20
- `minPay`: 4000, `minPayHours`: 8
- `workStart` / `workEnd`: 09:00–21:00, `slotMin`: 60, `slotCapacity`: 2, `bookingDays`: 14
- `storageWarnDays`: 14, `storageSeasonMonths`: 6, `storageRimsExtra`: 500, `storageTariff` — **примерные** ставки по радиусам R13–R22
- `seasonMode`: true, `posts`: 3, `bookingPosts`: 2
- `durFull`: 40, `durWheels`: 25, `durMount`: 15, `avgServiceMin`: 40 (старое поле, = полный шиномонтаж)
- `bookRepair`: false
- `printerIp`: `""`, `printerPort`: 9100
- `remindersOn`, `remind24`, `remind2`: true
- `pinIdleMin`: 3

Прайс по радиусам и ремонту — в `js/prices-data.js`. Менять цены «от себя» нельзя: либо из прайса / решения владельца, либо оставить 0 («не задана»).
