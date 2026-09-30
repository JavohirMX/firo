/**
 * Analytics — a no-op.
 *
 * Upstream this module forwarded events to SimpleAnalytics, gated on
 * `VITE_APP_ENABLE_TRACKING`. The loader script was removed from
 * `apps/web/index.html` in Phase 0, because a self-hosted product must not
 * report board activity to a third party (NFR-3 in
 * `docs/prd/05-non-functional-requirements.md`; see also the note in `NOTICE`).
 *
 * The export is kept as a no-op rather than deleted, for two reasons:
 *
 *  1. `trackEvent` is called from ~40 sites across the editor and app. Keeping
 *     the shim means this decision stays in one file instead of being
 *     rediscovered at every call site.
 *  2. It is the obvious place to put whatever we *do* eventually want, and the
 *     call sites already carry the vocabulary.
 *
 * Do not make this send anything without an ADR. A local-first product that
 * claims to send nothing must not quietly start sending.
 */
export const trackEvent = (
  _category: string,
  _action: string,
  _label?: string,
  _value?: number,
) => {
  // deliberately empty
};
