/** Makes text safe inside a GitHub-flavoured markdown table cell. */
export function cell(text: string | undefined): string {
  if (!text) return "";
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

/** Escapes a value for a GitHub Actions workflow command message. */
export function annotation(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escapes a value for a GitHub Actions workflow command property (title=...). */
export function annotationProperty(text: string): string {
  return annotation(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
