/**
 * Make a user-controlled string safe to drop into a single markdown TABLE CELL
 * destined for a GitHub PR comment. Treats the string as untrusted repo content:
 * collapses newlines (row-break), strips control chars, escapes the cell
 * delimiter `|`, and HTML-neutralizes `<`/`>`.
 *
 * Residual (accepted): `@mentions` are not neutralized — low harm in a
 * review-bot comment, and clean neutralization is finicky. Revisit if noisy.
 */
export function escapeMdCell(s: string): string {
  return (
    s
      .replace(/[\t\r\n]+/g, ' ')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control chars from untrusted input
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
      .replace(/\|/g, '\\|')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  )
}

/**
 * Shared comment footer. `marker` is an HTML comment used by the GitHub Action
 * to find-and-update its own comment instead of posting duplicates.
 */
export function mdFooter(marker: string): string {
  return `<sub>Evidence-based · local-first · source never leaves your runner.</sub>\n${marker}`
}
