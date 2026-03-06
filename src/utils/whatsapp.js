const DEFAULT_WHATSAPP_NUMBER = "5511990174644";

function normalizeSource(value) {
  if (!value) return "";
  return String(value).trim();
}

export function resolveWhatsAppBase(value) {
  const raw = normalizeSource(value);

  if (!raw) {
    return `https://wa.me/${DEFAULT_WHATSAPP_NUMBER}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (/^(wa\.me|api\.whatsapp\.com)\//i.test(raw)) {
    return `https://${raw}`;
  }

  const digits = raw.replace(/\D/g, "");
  return `https://wa.me/${digits || DEFAULT_WHATSAPP_NUMBER}`;
}

export function buildWhatsAppLink(value, text) {
  const base = resolveWhatsAppBase(value);

  if (!text) return base;

  try {
    const url = new URL(base);
    url.searchParams.set("text", text);
    return url.toString();
  } catch {
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}text=${encodeURIComponent(text)}`;
  }
}
