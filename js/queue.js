/* Живая очередь (сезон): клиент сам вводит госномер на планшете (queue.html) и получает талон.
   Нумерация каждый день начинается с 1. Посты: в сезон 2 под онлайн-запись, остальные (3-й) — под живую очередь. */
(function (root) {
  const SM = root.SM;
  const Q = (SM.live = {});
  Q.day = (q) => q.day || SM.dayKey(q.ts);
  Q.today = (S, now) => { const dk = SM.dayKey(now || SM.now()); return S.queue.items.filter((q) => Q.day(q) === dk); };
  /** Следующий номер талона на сегодня (сброс каждый день — считаем по талонам за сегодня). */
  Q.nextNo = (S, now) => Q.today(S, now).reduce((m, q) => Math.max(m, q.no), 0) + 1;
  /** Посты: всего, под запись, под живую очередь (номера постов). */
  Q.posts = function (S) {
    const st = S.settings, total = Math.max(1, Number(st.posts) || 3);
    if (!st.seasonMode) return { total, booking: 0, live: total, livePosts: Array.from({ length: total }, (_, i) => i + 1), bookingPosts: [] };
    const bk = Math.min(total - 1, Math.max(0, Number(st.bookingPosts) || 0));
    const arr = Array.from({ length: total }, (_, i) => i + 1);
    return { total, booking: bk, live: total - bk, bookingPosts: arr.slice(0, bk), livePosts: arr.slice(bk) };
  };
  SM.queueAdd = function (S, source, plate) {
    const now = SM.now(), no = Q.nextNo(S, now);
    const it = { no, day: SM.dayKey(now), ts: now, status: "wait", source: source || "улица", plate: plate ? SM.normPlate(plate) : "", post: null };
    S.queue.items.push(it); S.queue.seq = no; S.queue.day = it.day;
    return it;
  };
  /** Среднее время для талона: по выбранной услуге (полный / на дисках / снять-поставить), иначе «Полный шиномонтаж». */
  Q.dur = (S, q) => (SM.booking && q && q.service ? SM.booking.durMin(S, q.service) : Math.max(5, Number(S.settings.durFull) || Number(S.settings.avgServiceMin) || 40));
  Q.visitTs = (b) => { const [y, mo, d] = b.date.split("-").map(Number); const [h, m] = b.time.split(":").map(Number); return new Date(y, mo - 1, d, h, m || 0).getTime(); };
  /**
   * Кто стоит на постах. Один пост — одна машина. Пост занимают: вызванный талон (пока его заказ не «Готов» / не оплачен)
   * и заказ по онлайн-записи со статусом «Новый» / «В работе». «Готова, ждёт оплаты» пост освобождает.
   */
  Q.postsState = function (S, now) {
    const P = Q.posts(S), dk = SM.dayKey(now || SM.now());
    const open = SM.orders ? SM.orders.open(S) : [];
    const occ = {};
    Q.today(S, now).filter((q) => q.status === "called" && q.post).forEach((q) => {
      const o = open.find((x) => x.queueNo === q.no && SM.dayKey(x.createdAt) === dk);
      if (o && o.status === "ready") return;
      if (!occ[q.post]) occ[q.post] = { type: "queue", q, order: o || null };
    });
    open.forEach((o) => { if (o.post && (o.status === "new" || o.status === "work") && !occ[o.post]) occ[o.post] = { type: "order", order: o, booking: o.bookingId ? S.bookings.find((b) => b.id === o.bookingId) : null }; });
    return Array.from({ length: P.total }, (_, i) => i + 1).map((n) => ({ n, kind: P.bookingPosts.indexOf(n) >= 0 ? "booking" : "live", occ: occ[n] || null }));
  };
  Q.freePosts = (S, kind, now) => Q.postsState(S, now).filter((p) => !p.occ && (!kind || p.kind === kind)).map((p) => p.n);
  /** Записи, которые подъедут, пока машина из очереди будет на посту: [now − 30 мин; now + время услуги). */
  Q.dueBookings = function (S, durMin, now) {
    now = now || SM.now(); const dk = SM.dayKey(now);
    return S.bookings.filter((b) => b.date === dk && b.status === "new").filter((b) => { const t = Q.visitTs(b); return t >= now - 30 * 60e3 && t < now + durMin * 60e3; }).sort((a, b) => a.time.localeCompare(b.time));
  };
  /** Можно ли машине из живой очереди встать на свободный пост записи: свободных постов записи больше, чем записей, которые подъедут до окончания работы. */
  Q.canBorrow = function (S, durMin, now) {
    const free = Q.freePosts(S, "booking", now), due = Q.dueBookings(S, durMin, now);
    return { ok: free.length > due.length, free, due, post: free.length > due.length ? free[0] : null };
  };
  /** Свободный пост: для записи — посты записи, потом любой; для живой очереди — посты очереди, потом пост записи, если успеваем до записи. */
  Q.freePostFor = function (S, kind, durMin, now) {
    if (kind === "booking") return Q.freePosts(S, "booking", now)[0] || Q.freePosts(S, null, now)[0] || null;
    const live = Q.freePosts(S, "live", now)[0]; if (live) return live;
    const b = Q.canBorrow(S, durMin || Q.dur(S, null), now); return b.ok ? b.post : null;
  };
  /** «Следующий» — первый ожидающий за сегодня на свободный пост (на одном посту — одна машина). */
  Q.next = function (S, now) {
    const w = Q.waiting(S, now)[0]; if (!w) return { ok: false, msg: "В очереди никого нет" };
    return Q.call(S, w, now);
  };
  /** Вызвать конкретный талон на свободный пост. */
  Q.call = function (S, w, now) {
    if (w.status === "called" && w.post) return { ok: true, ticket: w, post: w.post, borrowed: !!w.borrowed, already: true };
    const dur = Q.dur(S, w);
    let post = Q.freePosts(S, "live", now)[0] || null, borrowed = false;
    if (!post) {
      const b = Q.canBorrow(S, dur, now);
      if (b.ok) { post = b.post; borrowed = true; }
      else return { ok: false, msg: "Все посты живой очереди заняты" + (b.free.length ? ". Пост записи " + b.free.join(", ") + " свободен, но не успеем до записи в " + b.due.map((x) => x.time).join(", ") + " (≈" + dur + " мин на машину)" : "") + " — на одном посту только одна машина." };
    }
    w.status = "called"; w.calledAt = SM.now(); w.post = post; w.borrowed = borrowed;
    return { ok: true, ticket: w, post, borrowed };
  };
  /**
   * Приёмка в одно нажатие (правка 19.11): «Следующий» ставит первый талон на свободный пост и сразу открывает заказ по нему.
   * Отдельный шаг «Вызваны — принять машину» больше не нужен. Возвращает { ok, ticket, post, borrowed, order }.
   */
  Q.acceptNext = function (S, who, now) {
    const w = Q.waiting(S, now)[0]; if (!w) return { ok: false, msg: "В очереди никого нет" };
    return Q.accept(S, w, who, now);
  };
  /** Принять конкретный талон: вызвать на пост (если ещё ждёт) и открыть заказ (если его ещё нет). */
  Q.accept = function (S, q, who, now) {
    const c = Q.call(S, q, now); if (!c.ok) return c;
    const dk = Q.day(q);
    let order = SM.orders.open(S).find((o) => o.queueNo === q.no && SM.dayKey(o.createdAt) === dk) || null, existed = !!order;
    if (!order) {
      const r = SM.orders.create(S, q.plate ? { plate: q.plate, queueNo: q.no } : { queueNo: q.no }, who);
      if (!r.ok) return r;
      order = r.order; existed = !!r.existed;
      if (!order.queueNo) order.queueNo = q.no;
      if (!order.acceptedAt) order.acceptedAt = q.calledAt || SM.now();
      SM.orders.log(order, who, "Пост " + c.post + " (живая очередь, талон №" + q.no + (c.borrowed ? ", пост записи — успеваем до записи" : "") + ")");
    }
    return { ok: true, ticket: q, post: c.post, borrowed: c.borrowed, order, existed };
  };
  SM.queueNext = function (S) { const r = Q.next(S); return r.ok ? r.ticket : null; };
  /** Освободить пост вручную (машина уехала с поста). Талон закрывается; заказ по записи остаётся открытым до оплаты. */
  Q.release = function (S, n, now) {
    const p = Q.postsState(S, now).find((x) => x.n === n); if (!p || !p.occ) return { ok: false, msg: "Пост " + n + " уже свободен" };
    if (p.occ.type === "queue") { p.occ.q.status = p.occ.order ? "called" : "done"; if (!p.occ.order) p.occ.q.doneAt = SM.now(); else p.occ.q.post = null; }
    else p.occ.order.post = null;
    return { ok: true };
  };
  Q.waiting = (S, now) => Q.today(S, now).filter((q) => q.status === "wait").sort((a, b) => a.no - b.no);
  Q.find = (S, no, dayKey) => S.queue.items.find((q) => q.no === no && Q.day(q) === (dayKey || SM.dayKey(SM.now()))) || null;
  /**
   * Примерное ожидание, мин — моделируем ВСЕ посты (правка 19.11: раньше вся очередь делилась только на пост 3,
   * и при двух свободных постах записи клиент видел «≈ 80 мин»).
   * 1) Каждый пост свободен сейчас, либо в момент «начало + время услуги» занятой машины (не раньше чем через 5 мин).
   * 2) Сегодняшние записи «Новая» (не раньше чем сейчас − 30 мин) раскладываются по постам записи (кто раньше освободится) как занятые интервалы.
   * 3) Талоны впереди по порядку встают на пост, где могут начать раньше всех (окно до записи учитывается).
   * 4) Ожидание = начало интервала этого талона − сейчас, вверх до 5 мин. Это ориентир, не обещание.
   */
  Q.model = function (S, now) {
    now = now || SM.now();
    const st = Q.postsState(S, now), P = Q.posts(S), MIN = 60e3;
    const posts = st.map((p) => {
      let freeAt = now;
      if (p.occ) {
        let start = now, dur = Q.dur(S, null);
        if (p.occ.type === "queue") { start = p.occ.q.calledAt || p.occ.q.ts || now; dur = Q.dur(S, p.occ.q); }
        else { const o = p.occ.order, b = p.occ.booking; start = o.acceptedAt || o.createdAt || now; dur = b && SM.booking ? SM.booking.durMin(S, b.direction) : dur; }
        freeAt = Math.max(start + dur * MIN, now + 5 * MIN);
      }
      return { n: p.n, kind: p.kind, freeAt, blocks: [] };
    });
    // Записи раскладываем по постам записи (вне сезона — по всем постам)
    const bkPosts = posts.filter((p) => P.bookingPosts.indexOf(p.n) >= 0);
    const target = bkPosts.length ? bkPosts : posts;
    const dk = SM.dayKey(now);
    S.bookings.filter((b) => b.date === dk && b.status === "new" && Q.visitTs(b) >= now - 30 * MIN).sort((a, b) => Q.visitTs(a) - Q.visitTs(b)).forEach((b) => {
      const dur = (SM.booking ? SM.booking.durMin(S, b.direction) : Q.dur(S, null)) * MIN;
      let best = null;
      target.forEach((p) => { const s = Q.startOn(p, Math.max(Q.visitTs(b), now), dur); if (!best || s < best.s) best = { p, s }; });
      best.p.blocks.push([best.s, best.s + dur]);
    });
    return posts;
  };
  /** Самое раннее начало на посту не раньше t: после освобождения и в окне между занятыми интервалами. */
  Q.startOn = function (p, t, dur) {
    let s = Math.max(t, p.freeAt);
    p.blocks.slice().sort((a, b) => a[0] - b[0]).forEach((bl) => { if (s < bl[1] && s + dur > bl[0]) s = Math.max(s, bl[1]); });
    return s;
  };
  Q.waitMin = function (S, no, now) {
    now = now || SM.now();
    const posts = Q.model(S, now), t = Q.today(S, now), MIN = 60e3;
    const place = (dur) => { let best = null; posts.forEach((p) => { const s = Q.startOn(p, now, dur); if (!best || s < best.s) best = { p, s }; }); best.p.blocks.push([best.s, best.s + dur]); return best.s; };
    t.filter((q) => q.status === "wait" && q.no < no).sort((a, b) => a.no - b.no).forEach((q) => place(Q.dur(S, q) * MIN));
    const me = t.find((q) => q.no === no);
    const start = place(Q.dur(S, me || null) * MIN);
    return Math.max(0, Math.ceil((start - now) / MIN / 5) * 5);
  };
  Q.waitLabel = (min) => (min <= 0 ? "сразу, подъезжайте" : min < 60 ? "≈ " + min + " мин" : "≈ " + Math.floor(min / 60) + " ч " + SM.pad(min % 60) + " мин");
  /** Талон с планшета: только в сезон; повторный ввод того же номера за сегодня — тот же талон. */
  Q.take = function (S, plate, service) {
    if (!S.settings.seasonMode) return { ok: false, msg: "Живая очередь работает только в сезон. Подойдите к администратору." };
    const p = SM.normPlate(plate || "");
    if (p.length < 4) return { ok: false, msg: "Введите госномер" };
    const ex = Q.today(S).find((q) => q.plate === p && q.status !== "done");
    if (ex) return { ok: true, ticket: ex, existed: true, ahead: Q.waiting(S).filter((q) => q.no < ex.no).length, wait: Q.waitMin(S, ex.no), post: Q.posts(S).livePosts };
    const t = SM.queueAdd(S, "планшет", p);
    if (service && SM.booking && SM.booking.TIRE_DIRECTIONS.some((d) => d.key === service)) t.service = service;
    return { ok: true, ticket: t, existed: false, ahead: Q.waiting(S).filter((q) => q.no < t.no).length, wait: Q.waitMin(S, t.no), post: Q.posts(S).livePosts };
  };
  Q.done = function (S, no, dayKey) { const q = S.queue.items.find((x) => x.no === no && x.status !== "done" && (!dayKey || Q.day(x) === dayKey)); if (q) { q.status = "done"; q.doneAt = SM.now(); } return q; };
})(typeof window !== "undefined" ? window : globalThis);
