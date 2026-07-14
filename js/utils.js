/**
 * Utilidades compartilhadas: datas, moeda, validação, tradução e download.
 * Este módulo não acessa diretamente a interface nem o LocalStorage.
 */

export const INCOME_CATEGORIES = ["Salário", "Social Media", "Motoboy", "Freelancer", "Venda", "Outros"];
export const EXPENSE_CATEGORIES = ["Moradia", "Alimentação", "Gasolina", "Moto", "Internet", "Celular", "Ferramentas", "Cursos", "Lazer", "Cartão", "Impostos", "Outros"];
export const PAYMENT_METHODS = ["Pix", "Dinheiro", "Débito", "Crédito", "Boleto", "Transferência", "Outros"];
export const GOAL_TYPES = ["Quitar dívida", "Reserva de emergência", "Comprar equipamento", "Meta de faturamento", "Outro"];
export const MONTHLY_GOAL_TYPES = ["Receita", "Economia", "Investimentos", "Clientes"];

export const ICONS = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24"><path d="m18 15-6-6-6 6"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  income: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  expense: '<svg viewBox="0 0 24 24"><path d="M12 5v14M18 13l-6 6-6-6"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M8.5 14.5A7 7 0 1 1 15.5 14.5C14.6 15.3 14 16.4 14 18h-4c0-1.6-.6-2.7-1.5-3.5Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.7 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.7a2 2 0 0 0-3.4 0Z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  streak: '<svg viewBox="0 0 24 24"><path d="M12 22c4.4 0 8-3.3 8-7.5 0-2.8-1.4-5.3-4.2-7.5.2 2.8-1.4 4.4-3 5.2.1-3.9-2-7.4-5.4-10.2.2 4.6-3.4 7.2-3.4 12.5C4 18.7 7.6 22 12 22Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/></svg>'
};

const translations = {
  "pt-BR": {
    "nav.overview": "Visão geral", "nav.dashboard": "Dashboard", "nav.cashflow": "Fluxo de caixa", "nav.calendar": "Calendário",
    "nav.planning": "Planejamento", "nav.goals": "Objetivos", "nav.debts": "Dívidas", "nav.monthlyGoals": "Metas mensais",
    "nav.analysis": "Análise", "nav.stats": "Estatísticas", "nav.evolution": "Minha evolução", "nav.productivity": "Produtividade",
    "nav.settings": "Configurações", "profile.local": "Dados neste dispositivo", "actions.newEntry": "Nova movimentação"
  },
  "en-US": {
    "nav.overview": "Overview", "nav.dashboard": "Dashboard", "nav.cashflow": "Cash flow", "nav.calendar": "Calendar",
    "nav.planning": "Planning", "nav.goals": "Goals", "nav.debts": "Debts", "nav.monthlyGoals": "Monthly goals",
    "nav.analysis": "Analysis", "nav.stats": "Statistics", "nav.evolution": "My progress", "nav.productivity": "Productivity",
    "nav.settings": "Settings", "profile.local": "Data on this device", "actions.newEntry": "New transaction"
  },
  "es-ES": {
    "nav.overview": "Resumen", "nav.dashboard": "Panel", "nav.cashflow": "Flujo de caja", "nav.calendar": "Calendario",
    "nav.planning": "Planificación", "nav.goals": "Objetivos", "nav.debts": "Deudas", "nav.monthlyGoals": "Metas mensuales",
    "nav.analysis": "Análisis", "nav.stats": "Estadísticas", "nav.evolution": "Mi evolución", "nav.productivity": "Productividad",
    "nav.settings": "Configuración", "profile.local": "Datos en este dispositivo", "actions.newEntry": "Nuevo movimiento"
  }
};

export function t(key, locale = "pt-BR") {
  return translations[locale]?.[key] ?? translations["pt-BR"]?.[key] ?? key;
}

export function applyTranslations(locale = "pt-BR") {
  document.documentElement.lang = locale;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n, locale);
  });
}

export function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toNumber(value, fallback = 0) {
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value, settings = {}) {
  const locale = settings.locale || "pt-BR";
  const currency = settings.currency || "BRL";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(toNumber(value));
}

export function formatNumber(value, locale = "pt-BR", options = {}) {
  return new Intl.NumberFormat(locale, options).format(toNumber(value));
}

export function formatPercent(value, locale = "pt-BR", digits = 0) {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(toNumber(value) / 100);
}

export function parseDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return new Date(dateInput.getTime());
  const raw = String(dateInput);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toISODate(date = new Date()) {
  const valid = parseDate(date) || new Date();
  const year = valid.getFullYear();
  const month = String(valid.getMonth() + 1).padStart(2, "0");
  const day = String(valid.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(date, locale = "pt-BR", options = {}) {
  const parsed = parseDate(date);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", ...options }).format(parsed);
}

export function formatShortDate(date, locale = "pt-BR") {
  const parsed = parseDate(date);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

export function formatMonth(date, locale = "pt-BR") {
  const parsed = parseDate(date);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(parsed);
}

export function startOfMonth(date = new Date()) {
  const parsed = parseDate(date) || new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1, 12);
}

export function endOfMonth(date = new Date()) {
  const parsed = parseDate(date) || new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0, 12);
}

export function addMonths(date, count) {
  const parsed = parseDate(date) || new Date();
  const day = parsed.getDate();
  const result = new Date(parsed.getFullYear(), parsed.getMonth() + count, 1, 12);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

export function addDays(date, count) {
  const parsed = parseDate(date) || new Date();
  const result = new Date(parsed);
  result.setDate(result.getDate() + count);
  return result;
}

export function daysBetween(a, b) {
  const first = parseDate(a);
  const second = parseDate(b);
  if (!first || !second) return 0;
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const end = new Date(second.getFullYear(), second.getMonth(), second.getDate());
  return Math.ceil((end - start) / 86400000);
}

export function daysRemainingInMonth(date = new Date()) {
  const parsed = parseDate(date) || new Date();
  return Math.max(0, endOfMonth(parsed).getDate() - parsed.getDate());
}

export function isSameMonth(date, reference = new Date()) {
  const parsed = parseDate(date);
  const ref = parseDate(reference);
  return Boolean(parsed && ref && parsed.getFullYear() === ref.getFullYear() && parsed.getMonth() === ref.getMonth());
}

export function isDateInRange(date, start, end) {
  const parsed = parseDate(date);
  const min = parseDate(start);
  const max = parseDate(end);
  return Boolean(parsed && min && max && parsed >= min && parsed <= max);
}

export function monthKey(date) {
  const parsed = parseDate(date) || new Date();
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function getLastMonths(count = 6, reference = new Date()) {
  return Array.from({ length: count }, (_, index) => addMonths(startOfMonth(reference), index - count + 1));
}

export function getMonthLabel(date, locale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(parseDate(date) || new Date()).replace(".", "");
}

export function getMonthYearLabel(date, locale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(parseDate(date) || new Date()).replace(" de ", "/").replace(".", "");
}

export function debounce(callback, wait = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), wait);
  };
}

export function throttle(callback, wait = 250) {
  let blocked = false;
  let trailingArgs = null;
  const run = (...args) => {
    if (blocked) {
      trailingArgs = args;
      return;
    }
    callback(...args);
    blocked = true;
    setTimeout(() => {
      blocked = false;
      if (trailingArgs) {
        const next = trailingArgs;
        trailingArgs = null;
        run(...next);
      }
    }, wait);
  };
  return run;
}

export function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

export function slugify(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function sum(values) {
  return values.reduce((total, value) => total + toNumber(value), 0);
}

export function groupBy(items, keySelector) {
  return items.reduce((groups, item) => {
    const key = typeof keySelector === "function" ? keySelector(item) : item[keySelector];
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

export function downloadFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function csvEscape(value) {
  const string = String(value ?? "");
  return /[";,\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

export function safeJSONParse(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function getContrastText(hexColor = "#635bff") {
  const hex = hexColor.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const number = Number.parseInt(normalized, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111318" : "#ffffff";
}

export function getProgressColor(percent) {
  if (percent >= 100) return "var(--success)";
  if (percent >= 70) return "var(--primary)";
  if (percent >= 40) return "var(--warning)";
  return "var(--danger)";
}

export function relativeTimeFromDays(days, locale = "pt-BR") {
  if (days < 0) return locale === "en-US" ? "Expired" : locale === "es-ES" ? "Vencido" : "Vencido";
  if (days === 0) return locale === "en-US" ? "Today" : locale === "es-ES" ? "Hoy" : "Hoje";
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(days, "day");
}

export async function hashPassword(password, salt = "") {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sanitizeImageDataUrl(value) {
  return /^data:image\/(png|jpeg|webp);base64,/i.test(value || "") ? value : "";
}

export function storageSizeInBytes(value) {
  return new Blob([typeof value === "string" ? value : JSON.stringify(value)]).size;
}
