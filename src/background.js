"use strict";

// Content scripts cannot call the downloads API, so they hand finished files to us.
browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "dcx-download") return;
  const blob = new Blob([msg.content], { type: msg.mime });
  const url = URL.createObjectURL(blob);
  return browser.downloads
    .download({ url, filename: msg.filename, saveAs: false, conflictAction: "uniquify" })
    .then((id) => {
      // Revoke once the download no longer needs the blob.
      const onChanged = (delta) => {
        if (delta.id !== id || !delta.state || delta.state.current === "in_progress") return;
        browser.downloads.onChanged.removeListener(onChanged);
        URL.revokeObjectURL(url);
      };
      browser.downloads.onChanged.addListener(onChanged);
      return { ok: true };
    })
    .catch((err) => {
      URL.revokeObjectURL(url);
      return { ok: false, error: String(err?.message || err) };
    });
});
