import { useEffect } from "preact/hooks";

/**
 * Rendered only while the admin opens Newsletters inside the lead window.
 * Fires one idempotent ensure POST (GETs stay read-only) and reloads when new
 * drafts appeared; on the reload the server creates nothing, so it settles.
 */
export function NewsletterAutogen() {
  useEffect(() => {
    const body = new URLSearchParams({ action: "ensure" });
    fetch("/admin/newsletters/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.created > 0) location.reload();
      })
      .catch(() => {});
  }, []);

  return null;
}
