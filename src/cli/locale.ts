/** Presentation language belongs to each CLI instance, never to analysis data. */
export type CliLocale = "en" | "zh-CN";

/** Explicit REA_LOCALE selection; other languages retain the English fallback. */
export const cliLocale = (
  environment: Readonly<Record<string, string | undefined>>,
): CliLocale => {
  const selected = environment.REA_LOCALE?.trim()
    .replaceAll("_", "-")
    .toLowerCase();
  return selected === "zh" || selected === "zh-cn" || selected === "zh-hans"
    ? "zh-CN"
    : "en";
};

/** Select owned UI text without translating paths, target output or Evidence. */
export const cliText = (
  locale: CliLocale,
  english: string,
  chinese: string,
): string => (locale === "zh-CN" ? chinese : english);
