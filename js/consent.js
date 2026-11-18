/* Согласие на обработку ПД: полный текст из kassa-pravki/soglasie.md (через js/docs.js). ШАБЛОН, юристом не проверен. */
(function () {
  const SM = window.SM;
  SM.CONSENT_HTML = '<div class="doc">' + SM.docFill(SM.DOCS.consent, {}) + "</div>";
  /** Раскрывающийся полный текст согласия — под галочкой в анкете, онлайн-записи и форме клиента. */
  SM.consentDetails = (id) => '<details class="consent-details"' + (id ? ' id="' + id + '"' : "") + '><summary>Полный текст согласия на обработку персональных данных</summary><div class="doc-scroll">' + SM.CONSENT_HTML + "</div></details>";
})();
