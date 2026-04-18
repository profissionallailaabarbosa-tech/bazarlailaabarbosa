export function isTemporaryMediaUrl(value) {
  return String(value || "").trim().toLowerCase().startsWith("blob:");
}

export function sanitizeMediaUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || isTemporaryMediaUrl(normalized)) return "";
  return normalized;
}

export function sanitizeMediaList(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => sanitizeMediaUrl(value))
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}
