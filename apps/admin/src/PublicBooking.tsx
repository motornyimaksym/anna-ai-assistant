import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PublicBookingService, PublicBookingStatusResponse } from "@booking/contracts";
import { useI18n } from "./i18n.js";
import { PublicBookingApiError, publicBookingApi } from "./public-booking-api.js";
import "./PublicBooking.css";

const ownerUrl = "https://t.me/Anna_lush_Massage";
const botUrl = "https://t.me/AnnaLushMassageBot";
const ownerLabel = "+380966172019 (@Anna_lush_Massage)";

const copy = {
  en: {
    brand: "ANNA · MASSAGE STUDIO", location: "Lviv · private studio", eyebrow: "A little time, just for you",
    titleA: "Make room for", titleB: "yourself.", lead: "Choose a massage and a time that feels right. Your appointment is confirmed after the deposit is paid.",
    noteTitle: "A calm, simple booking", note: "Choose any contact that works for you. After payment, you’ll see the studio address and appointment details here.",
    booking: "Book a visit", stepOne: "01 · YOUR SERVICE", service: "Choose a service", duration: "Duration", date: "Date", time: "Available times",
    loadingServices: "Loading available services…", noServices: "There are no services open for online booking right now. Message Anna and she’ll help you find a time.",
    loadingSlots: "Checking the calendar…", chooseService: "Choose a service to see available times.", noSlots: "No free times for this date. Choose another day or contact Anna.",
    client: "02 · YOUR DETAILS", name: "Your name", contact: "Your preferred contact", namePlaceholder: "How should Anna address you?", contactPlaceholder: "Telegram, WhatsApp, Viber, phone…",
    summary: "03 · PAYMENT", total: "Service total", due: "Deposit today", balance: "Remaining at the visit", pay: "Pay 500 UAH and book", submitting: "Preparing secure payment…", hold: "The selected time is held for 15 minutes after you continue to payment.",
    refund: "Refund: message Anna at least 24 hours before your visit. Rescheduling: contact Anna at least 3 hours before. Both are handled personally in Telegram.",
    policy: "The 500 UAH deposit is part of the service price. The remaining amount is paid at the studio.",
    errorServices: "Could not load services. Please try again in a moment.", errorSlots: "Could not check the calendar. Please try again.", errorStart: "Could not start booking. Please check your details and try again.", stale: "That time was just taken. Choose another available time.",
    footer: "Questions or help with a booking?", bot: "Open the booking bot", person: "Message Anna",
    checkingTitle: "Checking your payment", checkingText: "This can take a few moments. Keep this page open while Monobank confirms the payment.",
    pendingTitle: "Payment is being confirmed", pendingText: "We’re still waiting for Monobank’s confirmation. Refresh the status in a moment or message Anna if you need help.",
    processingTitle: "Payment received", processingText: "We’re checking the calendar and preparing your appointment confirmation.",
    confirmedTitle: "Your time is reserved", confirmedText: "Thank you. Your appointment is confirmed. We look forward to welcoming you.",
    address: "Studio address", appointment: "Appointment", totalLabel: "Service price", paid: "Deposit received", depositLabel: "Deposit", balanceLabel: "Pay at the studio",
    failedTitle: "Payment wasn’t completed", failedText: "No confirmed appointment was created. You can choose another time and try again.",
    expiredTitle: "The time hold expired", expiredText: "The appointment time is no longer held. Check the current availability before paying again.",
    reviewTitle: "Anna will help finish your booking", reviewText: "This booking needs a manual check. Message Anna in Telegram so she can review the payment and available time.",
    statusError: "Could not refresh payment status. Try again.", refresh: "Check payment status", newBooking: "Book another time", back: "Back to booking", waiting: "Checking…",
  },
  uk: {
    brand: "ANNA · МАСАЖНИЙ КАБІНЕТ", location: "Львів · прийом у кабінеті", eyebrow: "Трохи часу — тільки для себе",
    titleA: "Знайдіть час", titleB: "для себе.", lead: "Оберіть масаж і зручний час. Запис підтвердиться після оплати передоплати.",
    noteTitle: "Спокійний запис у кілька кроків", note: "Залиште будь-який зручний контакт. Після оплати тут з’являться адреса кабінету й деталі візиту.",
    booking: "Записатися на візит", stepOne: "01 · ВАША ПОСЛУГА", service: "Оберіть послугу", duration: "Тривалість", date: "Дата", time: "Вільний час",
    loadingServices: "Завантажуємо доступні послуги…", noServices: "Зараз немає послуг для онлайн-запису. Напишіть Анні — вона допоможе знайти зручний час.",
    loadingSlots: "Перевіряємо календар…", chooseService: "Оберіть послугу, щоб побачити вільний час.", noSlots: "На цю дату вільного часу немає. Оберіть інший день або напишіть Анні.",
    client: "02 · ВАШІ ДАНІ", name: "Ваше ім’я", contact: "Зручний спосіб зв’язку", namePlaceholder: "Як до вас звертатися?", contactPlaceholder: "Telegram, WhatsApp, Viber, телефон…",
    summary: "03 · ОПЛАТА", total: "Повна вартість", due: "Передоплата зараз", balance: "Залишок до оплати в кабінеті", pay: "Оплатити 500 грн і записатися", submitting: "Готуємо захищену оплату…", hold: "Після переходу до оплати обраний час утримується 15 хвилин.",
    refund: "Повернення передоплати можливе, якщо попередити щонайменше за 24 години до візиту. Для перенесення напишіть Анні щонайменше за 3 години. Обидва питання вирішуються особисто в Telegram.",
    policy: "Передоплата 500 грн входить у вартість послуги. Залишок оплачується в кабінеті.",
    errorServices: "Не вдалося завантажити послуги. Спробуйте ще раз трохи пізніше.", errorSlots: "Не вдалося перевірити календар. Спробуйте ще раз.", errorStart: "Не вдалося почати запис. Перевірте дані й спробуйте ще раз.", stale: "Цей час щойно зайняли. Оберіть інший вільний час.",
    footer: "Є запитання або потрібна допомога із записом?", bot: "Відкрити бота для запису", person: "Написати Анні",
    checkingTitle: "Перевіряємо оплату", checkingText: "Це може тривати кілька секунд. Залишайтеся на сторінці, поки Monobank підтверджує оплату.",
    pendingTitle: "Підтверджуємо оплату", pendingText: "Чекаємо на підтвердження від Monobank. Оновіть статус за мить або напишіть Анні, якщо потрібна допомога.",
    processingTitle: "Оплату отримано", processingText: "Перевіряємо календар і готуємо підтвердження вашого запису.",
    confirmedTitle: "Час за вами", confirmedText: "Дякуємо. Запис підтверджено. Чекатимемо на вас.",
    address: "Адреса кабінету", appointment: "Ваш візит", totalLabel: "Вартість послуги", paid: "Передоплату отримано", depositLabel: "Передоплата", balanceLabel: "До оплати в кабінеті",
    failedTitle: "Оплату не завершено", failedText: "Запис не створено. Можете обрати інший час і спробувати ще раз.",
    expiredTitle: "Час утримання минув", expiredText: "Обраний час більше не заброньований. Перевірте актуальну доступність перед повторною оплатою.",
    reviewTitle: "Анна допоможе завершити запис", reviewText: "Запис потрібно перевірити вручну. Напишіть Анні в Telegram, щоб вона звірила оплату й вільний час.",
    statusError: "Не вдалося оновити статус оплати. Спробуйте ще раз.", refresh: "Перевірити оплату", newBooking: "Обрати інший час", back: "Повернутися до запису", waiting: "Перевіряємо…",
  },
} as const;

function kyivDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function returnToken(reservationId: string) {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  if (fromHash) return fromHash;
  try { return reservationId ? sessionStorage.getItem(`public-booking:${reservationId}`) ?? "" : ""; }
  catch { return ""; }
}

function AppointmentsFooter({ language }: { language: "en" | "uk" }) {
  const text = copy[language];
  return <footer className="booking-footer"><span>{text.footer}</span><nav className="booking-footer-links" aria-label={language === "uk" ? "Контакти" : "Contacts"}><a href={botUrl} target="_blank" rel="noreferrer">{text.bot}</a><a href={ownerUrl} target="_blank" rel="noreferrer">{text.person} · {ownerLabel}</a></nav></footer>;
}

function PublicHeader({ language, onLanguage }: { language: "en" | "uk"; onLanguage: (language: "en" | "uk") => void }) {
  const text = copy[language];
  return <header className="booking-topbar"><Link className="booking-brand" to="/book"><span className="booking-brand-mark" aria-hidden="true">A</span><span className="booking-brand-copy"><strong>{text.brand}</strong><small>{text.location}</small></span></Link><div className="booking-language" role="group" aria-label={language === "uk" ? "Мова сторінки" : "Page language"}><button type="button" aria-pressed={language === "en"} onClick={() => onLanguage("en")}>EN</button><button type="button" aria-pressed={language === "uk"} onClick={() => onLanguage("uk")}>UA</button></div></header>;
}

function StatusPage({ id, token, language, onLanguage }: { id: string; token: string; language: "en" | "uk"; onLanguage: (language: "en" | "uk") => void }) {
  const text = copy[language];
  const [status, setStatus] = useState<PublicBookingStatusResponse>();
  const [error, setError] = useState(false);
  const [polling, setPolling] = useState(true);
  const [pollAgain, setPollAgain] = useState(0);
  const terminal = status && ["confirmed", "payment_failed", "expired", "manual_review"].includes(status.status);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const next = await publicBookingApi.status(id, token);
        if (!active) return;
        setStatus(next); setError(false);
        if (["confirmed", "payment_failed", "expired", "manual_review"].includes(next.status)) { setPolling(false); return; }
      } catch {
        if (!active) return;
        setError(true);
      }
      attempts += 1;
      if (attempts >= 60) { setPolling(false); return; }
      timer = setTimeout(() => { void poll(); }, 2500);
    };
    setPolling(true);
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [id, token, pollAgain]);
  const money = (amount: number) => new Intl.NumberFormat(language === "uk" ? "uk-UA" : "en-US", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(amount);
  const dateTime = status ? new Intl.DateTimeFormat(language === "uk" ? "uk-UA" : "en-US", { timeZone: "Europe/Kyiv", dateStyle: "long", timeStyle: "short" }).format(new Date(status.startAt)) : "";
  let title: string = text.checkingTitle; let message: string = text.checkingText; let mark = <span className="booking-spinner" aria-hidden="true" />;
  if (status?.status === "confirmed") { title = text.confirmedTitle; message = text.confirmedText; mark = <span aria-hidden="true">✓</span>; }
  else if (status?.status === "processing") { title = text.processingTitle; message = text.processingText; }
  else if (status?.status === "pending_payment") { title = text.pendingTitle; message = text.pendingText; }
  else if (status?.status === "payment_failed") { title = text.failedTitle; message = text.failedText; mark = <span aria-hidden="true">×</span>; }
  else if (status?.status === "expired") { title = text.expiredTitle; message = text.expiredText; mark = <span aria-hidden="true">⌛</span>; }
  else if (status?.status === "manual_review") { title = text.reviewTitle; message = text.reviewText; mark = <span aria-hidden="true">i</span>; }
  const actionLabel = language === "uk" ? "Написати Анні в Telegram" : "Message Anna on Telegram";
  return <div className="public-booking"><div className="booking-shell"><PublicHeader language={language} onLanguage={onLanguage} /><main className="booking-result"><section className="booking-result-card" aria-live="polite"><div className="booking-result-mark">{mark}</div><p className="booking-eyebrow">{text.brand}</p><h1>{title}</h1><p>{message}</p>
    {status && <div className="booking-result-details"><div><span>{text.appointment}</span><strong>{dateTime}</strong></div><div><span>{text.service}</span><strong>{status.serviceName} · {status.durationMinutes} {language === "uk" ? "хв" : "min"}</strong></div><div><span>{text.totalLabel}</span><strong>{money(status.price)}</strong></div><div><span>{status.status === "confirmed" ? text.paid : text.depositLabel}</span><strong>{money(status.depositAmount)}</strong></div><div><span>{text.balanceLabel}</span><strong>{money(status.remainingAmount)}</strong></div>{status.status === "confirmed" && status.address && <div><span>{text.address}</span><strong>{status.address}</strong></div>}</div>}
    {error && <div className="booking-error" role="alert">{text.statusError}</div>}
    {status?.status === "confirmed" ? <p>{text.policy}</p> : null}
    <div className="booking-result-actions">{status?.status === "manual_review" ? <a className="booking-submit" href={ownerUrl} target="_blank" rel="noreferrer">{actionLabel}</a> : null}{(!terminal || error || !polling) && status?.status !== "confirmed" && <button className="booking-submit" type="button" onClick={() => setPollAgain((value) => value + 1)}>{polling ? <><span className="booking-spinner" aria-hidden="true" />{text.waiting}</> : text.refresh}</button>}<Link className="booking-inline-link" to="/book">{status?.status === "confirmed" ? text.newBooking : text.back}</Link></div>
  </section></main><AppointmentsFooter language={language} /></div></div>;
}

export function PublicBooking() {
  const { language, setLanguage } = useI18n();
  const locale = language === "uk" ? "uk" : "en";
  const text = copy[locale];
  const [search] = useSearchParams();
  const reservationId = search.get("reservation") ?? "";
  const token = returnToken(reservationId);
  const [services, setServices] = useState<PublicBookingService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const selectedService = services.find((service) => service.id === serviceId);
  const options = selectedService?.options ?? [];
  const [duration, setDuration] = useState<number>(0);
  const selectedOption = options.find((option) => option.durationMinutes === duration) ?? options[0];
  const [date, setDate] = useState(kyivDate);
  const today = useMemo(() => kyivDate(), []);
  const latestDate = useMemo(() => {
    const [year, month, day] = today.split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, day! + 30)).toISOString().slice(0, 10);
  }, [today]);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [slot, setSlot] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setServicesLoading(true);
    void publicBookingApi.services(controller.signal).then((result) => {
      setServices(result); setServiceId(result[0]?.id ?? ""); setServicesError(false);
    }).catch(() => {
      if (!controller.signal.aborted) setServicesError(true);
    }).finally(() => { if (!controller.signal.aborted) setServicesLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => { setDuration(options[0]?.durationMinutes ?? 0); setSlot(""); }, [serviceId, services]);
  useEffect(() => {
    if (!serviceId || !duration || !date || reservationId) { setSlots([]); return; }
    let active = true;
    const controller = new AbortController();
    setSlotsLoading(true); setSlotsError(false); setSlots([]); setSlot("");
    void publicBookingApi.slots({ serviceId, durationMinutes: duration, date }, controller.signal).then((result) => {
      if (active) setSlots(result.slots);
    }).catch(() => { if (active && !controller.signal.aborted) setSlotsError(true); }).finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [serviceId, duration, date, slotsVersion, reservationId]);

  const money = (amount: number) => new Intl.NumberFormat(locale === "uk" ? "uk-UA" : "en-US", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(amount);
  const timeLabel = (value: string) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const chooseLanguage = (next: "en" | "uk") => setLanguage(next);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || !selectedOption || !slot) return;
    setSubmitting(true); setSubmitError("");
    try {
      const reservation = await publicBookingApi.start({ serviceId: selectedService.id, durationMinutes: selectedOption.durationMinutes, startAt: slot, clientName, clientContact });
      try { sessionStorage.setItem(`public-booking:${reservation.reservationId}`, reservation.token); } catch { /* The return URL hash carries the token if storage is unavailable. */ }
      window.location.assign(reservation.paymentUrl);
    } catch (error) {
      if (error instanceof PublicBookingApiError && error.status === 409) {
        setSubmitError(text.stale); setSlot(""); setSlotsVersion((value) => value + 1);
      } else setSubmitError(text.errorStart);
    } finally { setSubmitting(false); }
  }

  if (reservationId && token) return <StatusPage id={reservationId} token={token} language={locale} onLanguage={chooseLanguage} />;
  return <div className="public-booking"><div className="booking-shell"><PublicHeader language={locale} onLanguage={chooseLanguage} />
    <main className="booking-main"><section className="booking-intro"><p className="booking-eyebrow">{text.eyebrow}</p><h1>{text.titleA}<br /><em>{text.titleB}</em></h1><p className="booking-lead">{text.lead}</p><div className="booking-note"><span aria-hidden="true">✳</span><span><b>{text.noteTitle}</b><br />{text.note}</span></div></section>
      <section className="booking-card" aria-labelledby="booking-title"><header className="booking-card-head"><small>{text.stepOne}</small><h2 id="booking-title">{text.booking}</h2></header><form className="booking-card-content" onSubmit={(event) => { void submit(event); }}>
        <div className="booking-field"><span className="booking-label">{text.service}</span>
          {servicesLoading ? <div className="booking-empty">{text.loadingServices}</div> : servicesError ? <div className="booking-error" role="alert">{text.errorServices}</div> : services.length === 0 ? <div className="booking-empty">{text.noServices} <a className="booking-inline-link" href={ownerUrl} target="_blank" rel="noreferrer">{text.person}</a></div> : <div className="booking-service-list">{services.map((service) => {
            const option = service.options.find((item) => item.durationMinutes === (service.id === serviceId ? duration : service.options[0]?.durationMinutes)) ?? service.options[0]!;
            return <label className={`booking-service-option${service.id === serviceId ? " selected" : ""}`} key={service.id}><input type="radio" name="service" value={service.id} checked={service.id === serviceId} required onChange={() => setServiceId(service.id)} /><span><strong>{service.name}</strong><small>{option.durationMinutes} {locale === "uk" ? "хв" : "min"}</small></span><span className="booking-service-price">{money(option.price)}</span></label>;
          })}</div>}
        </div>
        {selectedService && <>
          {selectedService.options.length > 1 && <div className="booking-field"><label htmlFor="booking-duration">{text.duration}</label><select id="booking-duration" value={selectedOption?.durationMinutes ?? ""} onChange={(event) => { setDuration(Number(event.target.value)); setSlot(""); }}>{selectedService.options.map((option) => <option value={option.durationMinutes} key={option.durationMinutes}>{option.durationMinutes} {locale === "uk" ? "хв" : "min"} · {money(option.price)}</option>)}</select></div>}
          <div className="booking-field"><label htmlFor="booking-date">{text.date}</label><input id="booking-date" type="date" min={today} max={latestDate} value={date} required onChange={(event) => setDate(event.target.value)} /></div>
          <div className="booking-field"><span className="booking-label">{text.time}</span>{slotsLoading ? <div className="booking-empty">{text.loadingSlots}</div> : slotsError ? <div className="booking-error" role="alert">{text.errorSlots}</div> : slots.length ? <div className="booking-slots" role="group" aria-label={text.time}>{slots.map((value) => <button key={value} className={`booking-slot${slot === value ? " selected" : ""}`} type="button" aria-pressed={slot === value} onClick={() => setSlot(value)}>{timeLabel(value)}</button>)}</div> : <div className="booking-empty">{serviceId ? text.noSlots : text.chooseService}</div>}</div>
          <div className="booking-field"><span className="booking-label">{text.client}</span><div className="booking-two-col"><div className="booking-field"><label htmlFor="booking-name">{text.name}</label><input id="booking-name" autoComplete="name" maxLength={120} required value={clientName} placeholder={text.namePlaceholder} onChange={(event) => setClientName(event.target.value)} /></div><div className="booking-field"><label htmlFor="booking-contact">{text.contact}</label><input id="booking-contact" autoComplete="off" maxLength={256} required value={clientContact} placeholder={text.contactPlaceholder} onChange={(event) => setClientContact(event.target.value)} /></div></div></div>
          {selectedOption && <div className="booking-field"><span className="booking-label">{text.summary}</span><div className="booking-summary"><div className="booking-summary-line total"><span>{text.total}</span><strong>{money(selectedOption.price)}</strong></div><div className="booking-summary-line deposit"><span>{text.due}</span><strong>{money(500)}</strong></div><div className="booking-summary-line"><span>{text.balance}</span><strong>{money(selectedOption.price - 500)}</strong></div></div></div>}
          {submitError && <div className="booking-error" role="alert">{submitError}</div>}
          <button className="booking-submit" type="submit" disabled={!selectedOption || !slot || submitting || servicesLoading}>{submitting ? <><span className="booking-spinner" aria-hidden="true" />{text.submitting}</> : text.pay}</button>
          <div className="booking-policy"><p>{text.hold}</p><p>{text.policy}</p><p>{text.refund}</p></div>
        </>}
      </form></section>
    </main><AppointmentsFooter language={locale} />
  </div></div>;
}
