function normalizeSource(value) {
  if (!value) return "";
  return String(value).trim();
}

export function resolveWhatsAppBase(value) {
  const raw = normalizeSource(value);

  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (/^(wa\.me|api\.whatsapp\.com)\//i.test(raw)) {
    return `https://${raw}`;
  }

  const digits = raw.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

export function buildWhatsAppLink(value, text) {
  const base = resolveWhatsAppBase(value);
  if (!base) return "";

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
