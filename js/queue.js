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
  /** «Следующий» — первый ожидающий за сегодня, идёт на пост живой очереди. */
  SM.queueNext = function (S) {
    const w = Q.waiting(S)[0]; if (!w) return null;
    const P = Q.posts(S), busy = Q.today(S).filter((q) => q.status === "called").map((q) => q.post);
    w.status = "called"; w.calledAt = SM.now(); w.post = P.livePosts.find((p) => busy.indexOf(p) < 0) || P.livePosts[0];
    return w;
  };
  Q.waiting = (S, now) => Q.today(S, now).filter((q) => q.status === "wait").sort((a, b) => a.no - b.no);
  Q.find = (S, no, dayKey) => S.queue.items.find((q) => q.no === no && Q.day(q) === (dayKey || SM.dayKey(SM.now()))) || null;
  /**
   * Примерное ожидание, мин: (машин впереди + машины на постах очереди × ½) × среднее время / число постов очереди.
   * Округление вверх до 5 мин. Это ориентир, не обещание.
   */
  Q.waitMin = function (S, no, now) {
    const P = Q.posts(S), avg = Math.max(5, Number(S.settings.avgServiceMin) || 40);
    const t = Q.today(S, now);
    const ahead = t.filter((q) => q.status === "wait" && q.no < no).length;
    const busy = Math.min(P.live, t.filter((q) => q.status === "called").length);
    const m = ((ahead + busy * 0.5) * avg) / Math.max(1, P.live);
    return Math.ceil(m / 5) * 5;
  };
  Q.waitLabel = (min) => (min <= 0 ? "сразу, подъезжайте" : min < 60 ? "≈ " + min + " мин" : "≈ " + Math.floor(min / 60) + " ч " + SM.pad(min % 60) + " мин");
  /** Талон с планшета: только в сезон; повторный ввод того же номера за сегодня — тот же талон. */
  Q.take = function (S, plate) {
    if (!S.settings.seasonMode) return { ok: false, msg: "Живая очередь работает только в сезон. Подойдите к администратору." };
    const p = SM.normPlate(plate || "");
    if (p.length < 4) return { ok: false, msg: "Введите госномер" };
    const ex = Q.today(S).find((q) => q.plate === p && q.status !== "done");
    if (ex) return { ok: true, ticket: ex, existed: true, ahead: Q.waiting(S).filter((q) => q.no < ex.no).length, wait: Q.waitMin(S, ex.no), post: Q.posts(S).livePosts };
    const t = SM.queueAdd(S, "планшет", p);
    return { ok: true, ticket: t, existed: false, ahead: Q.waiting(S).filter((q) => q.no < t.no).length, wait: Q.waitMin(S, t.no), post: Q.posts(S).livePosts };
  };
  Q.done = function (S, no, dayKey) { const q = S.queue.items.find((x) => x.no === no && x.status !== "done" && (!dayKey || Q.day(x) === dayKey)); if (q) { q.status = "done"; q.doneAt = SM.now(); } return q; };
})(typeof window !== "undefined" ? window : globalThis);
