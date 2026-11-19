/* Сетевой принтер талонов/чеков: ESC/POS по TCP (обычно порт 9100), принтер в локальной сети через роутер.
   Из браузера TCP-соединение открыть нельзя — печатает только APK. Контракт для APK:
   window.AndroidPrinter.print(ip, port, base64Bytes) → "ok" или текст ошибки. */
(function (root) {
  const SM = root.SM;
  const PR = (SM.printer = {});
  PR.validIp = (ip) => { const m = String(ip || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); return !!m && m.slice(1).every((x) => Number(x) <= 255) && Number(m[1]) > 0; };
  PR.validPort = (p) => Number.isInteger(Number(p)) && Number(p) > 0 && Number(p) <= 65535;
  /** Кириллица → CP866 (кодовая страница 17 у большинства 58/80-мм ESC/POS принтеров). */
  PR.encode866 = function (str) {
    const out = [];
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c < 128) out.push(c);
      else if (c >= 0x410 && c <= 0x42f) out.push(0x80 + c - 0x410);      // А–Я
      else if (c >= 0x430 && c <= 0x43f) out.push(0xa0 + c - 0x430);      // а–п
      else if (c >= 0x440 && c <= 0x44f) out.push(0xe0 + c - 0x440);      // р–я
      else if (c === 0x401) out.push(0xf0); else if (c === 0x451) out.push(0xf1); // Ё ё
      else if (c === 0x2116) out.push(0xfc);                              // №
      else if (c === 0xa0) out.push(0x20);
      else out.push(0x3f);                                                // ?
    }
    return out;
  };
  /** Строки → байты ESC/POS. line: { text, align: "left|center|right", big, bold }. */
  PR.escpos = function (lines) {
    const b = [0x1b, 0x40, 0x1b, 0x74, 17]; // ESC @ — сброс, ESC t 17 — CP866
    (lines || []).forEach((l) => {
      if (typeof l === "string") l = { text: l };
      b.push(0x1b, 0x61, { left: 0, center: 1, right: 2 }[l.align || "left"]);
      b.push(0x1d, 0x21, l.big ? 0x11 : 0x00);
      b.push(0x1b, 0x45, l.bold ? 1 : 0);
      b.push(...PR.encode866(l.text || ""), 0x0a);
    });
    b.push(0x1d, 0x21, 0, 0x1b, 0x45, 0, 0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0); // промотка и отрез
    return b;
  };
  PR.toBase64 = function (bytes) {
    let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
    return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
  };
  PR.ticketLines = function (S, t, wait) {
    const P = SM.live.posts(S);
    return [
      { text: "ШИНАМАШИНА", align: "center", bold: true },
      { text: "Живая очередь", align: "center" },
      { text: "Талон №" + t.no, align: "center", big: true, bold: true },
      t.plate ? { text: "Госномер: " + t.plate, align: "center" } : "",
      { text: "Пост: " + P.livePosts.join(", "), align: "center" },
      { text: "Ожидание: " + SM.live.waitLabel(wait).replace("≈", "около"), align: "center" },
      { text: SM.fmtDT(t.ts), align: "center" },
      "",
      { text: "Номер вызовут на экране кассы.", align: "center" },
      { text: "+7 (995) 506-95-62", align: "center" }
    ];
  };
  PR.testLines = (S) => [{ text: "ШИНАМАШИНА", align: "center", bold: true }, { text: "Тестовая печать", align: "center", big: true }, { text: "Принтер: " + S.settings.printerIp + ":" + (S.settings.printerPort || 9100), align: "center" }, { text: SM.fmtDT(SM.now()), align: "center" }, { text: "Кириллица: АБВГДЕЁЖЗ абвгдеёжз №1", align: "center" }];
  PR.available = () => !!(root.AndroidPrinter && typeof root.AndroidPrinter.print === "function");
  /** Отправить на принтер. В браузере честно возвращаем reason: "browser". */
  PR.print = function (S, lines) {
    const ip = String(S.settings.printerIp || "").trim(), port = Number(S.settings.printerPort) || 9100;
    if (!ip) return { ok: false, reason: "noip", msg: "IP принтера не указан (Админка → Настройки → Принтер)" };
    if (!PR.validIp(ip)) return { ok: false, reason: "badip", msg: "Неверный IP: " + ip + " (пример: 192.168.1.50)" };
    const bytes = PR.escpos(lines);
    if (!PR.available()) return { ok: false, reason: "browser", bytes, msg: "Печать на сетевой принтер работает только из приложения (APK). Браузер не может открыть TCP-соединение с принтером " + ip + ":" + port + " — это ограничение браузеров, а не ошибка принтера." };
    try { const r = root.AndroidPrinter.print(ip, port, PR.toBase64(bytes)); return r === "ok" || r === true ? { ok: true, bytes } : { ok: false, reason: "printer", msg: String(r || "Принтер не ответил") }; }
    catch (e) { return { ok: false, reason: "printer", msg: e.message }; }
  };
})(typeof window !== "undefined" ? window : globalThis);
