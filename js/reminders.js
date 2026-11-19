/* Напоминания о записи: канал клиента (MAX / Telegram / SMS) + согласие, автоматически за 24 ч и за 2 ч до визита,
   журнал отправок у владельца. В ДЕМО отправка только имитируется — никуда ничего не уходит.
   В APK: SM.reminders.transport = function (entry) {...} — бот MAX/Telegram или SMS-шлюз (подключаем позже). */
(function (root) {
  const SM = root.SM;
  const RM = (SM.reminders = {});
  RM.CHANNELS = [{ key: "max", label: "MAX" }, { key: "telegram", label: "Telegram" }, { key: "sms", label: "SMS" }];
  RM.KINDS = [{ key: "24h", label: "за 24 ч", ms: 24 * 36e5, setting: "remind24" }, { key: "2h", label: "за 2 ч", ms: 2 * 36e5, setting: "remind2" }];
  RM.channelLabel = (k) => (RM.CHANNELS.find((c) => c.key === k) || { label: "—" }).label;
  RM.kindLabel = (k) => (RM.KINDS.find((c) => c.key === k) || { label: k }).label;
  RM.transport = null; // демо: нет транспорта — имитация
  RM.setClient = function (S, client, channel, consent, source) {
    if (!client) return { ok: false };
    if (channel && !RM.CHANNELS.some((c) => c.key === channel)) return { ok: false, msg: "Неизвестный канал" };
    const was = client.notify || {};
    client.notify = { channel: channel || "", consent: !!consent, at: consent && !was.consent ? SM.now() : was.at || (consent ? SM.now() : null), source: source || was.source || "касса" };
    return { ok: true };
  };
  RM.visitTs = (b) => { const [y, m, d] = b.date.split("-").map(Number); const [h, mi] = b.time.split(":").map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
  RM.text = (S, b) => "Шинамашина: напоминаем о записи " + SM.fmtDay(b.date) + " в " + b.time + " (" + SM.booking.dirLabel(b.direction) + "). Андреевка, Алабушевская ул., 2 стр. 2. Перенести или отменить: +7 (995) 506-95-62.";
  const logged = (S, bid, kind) => S.reminders.log.find((e) => e.bookingId === bid && e.kind === kind) || null;
  /** План напоминаний по записи: для каждого вида — время и состояние (отправлено / пропущено / запланировано). */
  RM.plan = function (S, b) {
    const ts = RM.visitTs(b);
    return RM.KINDS.filter((k) => S.settings[k.setting] !== false).map((k) => { const e = logged(S, b.id, k.key); return { kind: k.key, label: k.label, at: ts - k.ms, entry: e, state: e ? e.status : "planned" }; });
  };
  /** Проверить и «отправить» то, что пора. Вызывается автоматически раз в минуту на кассе. Возвращает новые записи журнала. */
  RM.run = function (S, now) {
    now = now || SM.now();
    if (!S.settings.remindersOn) return [];
    const out = [];
    S.bookings.forEach((b) => {
      if (b.status !== "new") return; // отменена, принята или выполнена — не напоминаем
      const ts = RM.visitTs(b); if (now >= ts) return;
      RM.KINDS.forEach((k) => {
        if (S.settings[k.setting] === false) return;
        const at = ts - k.ms; if (now < at || logged(S, b.id, k.key)) return;
        const c = b.clientId ? SM.client(S, b.clientId) : null;
        const e = { id: SM.uid("rm"), ts: now, bookingId: b.id, clientId: c ? c.id : null, name: b.name, phone: b.phone, kind: k.key, visitAt: ts, channel: (c && c.notify && c.notify.channel) || "", status: "skip", reason: "", text: RM.text(S, b), demo: true };
        if (b.ts > at) e.reason = "запись сделана позже, чем " + k.label + " до визита";
        else if (k.key === "24h" && now >= ts - 2 * 36e5 && S.settings.remind2 !== false) e.reason = "касса была выключена — уходит только напоминание за 2 ч";
        else if (!c || !c.notify || !c.notify.consent) e.reason = "нет согласия клиента на напоминания";
        else if (!c.notify.channel) e.reason = "канал не выбран";
        else if (RM.transport) { try { const r = RM.transport(e); e.status = r && r.ok ? "sent" : "error"; e.reason = r && r.ok ? "" : (r && r.msg) || "ошибка отправки"; e.demo = false; } catch (err) { e.status = "error"; e.reason = err.message; } }
        else e.status = "sent"; // имитация
        S.reminders.log.push(e); out.push(e);
      });
    });
    if (S.reminders.log.length > 500) S.reminders.log = S.reminders.log.slice(-500);
    return out;
  };
  RM.STATUS_RU = { sent: "отправлено (имитация)", skip: "не отправлено", error: "ошибка" };
})(typeof window !== "undefined" ? window : globalThis);
