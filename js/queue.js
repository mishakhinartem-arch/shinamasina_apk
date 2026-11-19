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
   * Примерное ожидание, мин: (Σ времени машин впереди по их услуге + машины на постах очереди × ½ × «Полный шиномонтаж») / число постов очереди.
   * Округление вверх до 5 мин. Это ориентир, не обещание.
   */
  Q.waitMin = function (S, no, now) {
    const P = Q.posts(S), avg = Q.dur(S, null);
    const t = Q.today(S, now);
    const aheadMin = t.filter((q) => q.status === "wait" && q.no < no).reduce((s, q) => s + Q.dur(S, q), 0);
    const busy = Math.min(P.live, t.filter((q) => q.status === "called").length);
    const m = (aheadMin + busy * 0.5 * avg) / Math.max(1, P.live);
    return Math.ceil(m / 5) * 5;
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
