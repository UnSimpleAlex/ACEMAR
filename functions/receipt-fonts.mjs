export const receiptFonts = () => ({
  regular: Uint8Array.from(atob("__ACEMAR_REGULAR_BASE64__"), (c) =>
    c.charCodeAt(0),
  ),
  bold: Uint8Array.from(atob("__ACEMAR_BOLD_BASE64__"), (c) => c.charCodeAt(0)),
});
