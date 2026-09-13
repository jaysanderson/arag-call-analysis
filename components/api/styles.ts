/**
 * Layout for the API explorer, in the kit's idiom and built only from kit tokens.
 *
 * It lives in this module rather than in `public/ui-ext.css` because nothing here is a candidate
 * for the shared kit yet: it is the arrangement of one screen (an operation index, a field tree, a
 * response strip), not a component other products would reuse. Everything the kit already
 * provides — cards, chips, fields, the snippet, the data table — is used as-is.
 */
export const EXPLORER_CSS = `
.ca-api-cover {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.ca-api-covertext {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1 1 340px;
  color: var(--arag-text-muted);
}
.ca-api-covertext p { margin: 0; font-size: 0.84rem; }
.ca-api-covertext strong { color: var(--arag-text); }
.ca-api-coverlinks { display: flex; flex-wrap: wrap; gap: 6px; }

.ca-api-rail { padding: 0; overflow: hidden; }
.ca-api-filter { padding: 10px; border-bottom: 1px solid var(--arag-border); }
.ca-api-filter .arag-help { margin: 6px 2px 0; }
.ca-api-index { padding: 6px 0 10px; }

@media (min-width: 1024px) {
  .ca-api-rail { position: sticky; top: 16px; display: flex; flex-direction: column; max-height: calc(100vh - 120px); }
  .ca-api-index { overflow-y: auto; }
}
/* Stacked, the index sits above the detail. Sixty rows of it would put the operation the reader
   asked for two screens down, so the list scrolls inside itself instead. */
@media (max-width: 1023px) {
  .ca-api-index { max-height: 52vh; overflow-y: auto; }
}

.ca-api-group + .ca-api-group { border-top: 1px solid var(--arag-border); }
.ca-api-group h3 { margin: 0; }
.ca-api-group > h3 > button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: 0;
  cursor: pointer;
  font: 700 0.7rem var(--arag-font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--arag-text-muted);
}
.ca-api-group > h3 > button:hover { color: var(--arag-text); background: var(--arag-brand-50); }
.ca-api-group > h3 > button > span:first-of-type { flex: 1 1 auto; text-align: left; }
.ca-api-group > h3 > button .count { font-weight: 600; font-variant-numeric: tabular-nums; }
.ca-api-group ul { list-style: none; margin: 0; padding: 0 0 4px; }
.ca-api-group li a {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 2px 8px;
  padding: 6px 10px 6px 12px;
  border-left: 2px solid transparent;
  text-decoration: none;
  color: inherit;
}
.ca-api-group li a:hover { background: var(--arag-brand-50); text-decoration: none; }
.ca-api-group li a[aria-current="true"] {
  background: var(--arag-brand-50);
  border-left-color: var(--arag-brand-600);
}
.ca-api-group li a > .arag-chip { justify-content: center; font-size: 0.6rem; padding: 1px 4px; }
.ca-api-oppath {
  font-family: var(--arag-font-mono);
  font-size: 0.72rem;
  color: var(--arag-text);
  overflow-wrap: anywhere;
}
.ca-api-opsummary {
  grid-column: 2;
  font-size: 0.74rem;
  color: var(--arag-text-subtle);
}

.ca-api-detail { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ca-api-detail .arag-card > .body { display: flex; flex-direction: column; gap: 14px; }

.ca-api-signature { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ca-api-signature code { font-size: 0.86rem; overflow-wrap: anywhere; }
.ca-api-prose, .ca-api-prose p { margin: 0; font-size: 0.86rem; line-height: 1.6; color: var(--arag-text-muted); max-width: 78ch; }
.ca-api-auth {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--arag-border);
  border-radius: var(--arag-radius);
  background: var(--arag-surface);
}
.ca-api-auth .arag-help { margin: 0; max-width: 72ch; }

.ca-api-fieldlist { list-style: none; margin: 0; padding: 0; }
.ca-api-fieldlist.root > li { border-top: 1px solid var(--arag-border); }
.ca-api-fieldlist.root > li:first-child { border-top: 0; }
.ca-api-fieldlist:not(.root) { margin-left: 10px; padding-left: 10px; border-left: 1px solid var(--arag-border); }
.ca-api-field { padding: 5px 0; }
.ca-api-field > details > summary { cursor: pointer; list-style: revert; }
.ca-api-field > details > summary::marker { color: var(--arag-text-subtle); }
.ca-api-fieldhead { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ca-api-fieldname { font-size: 0.78rem; font-weight: 600; color: var(--arag-text); }
.ca-api-fielddesc { margin-top: 3px; }
.ca-api-fielddesc, .ca-api-fielddesc p { margin: 0; font-size: 0.78rem; color: var(--arag-text-muted); max-width: 78ch; }
.ca-api-enum {
  font-size: 0.7rem;
  padding: 1px 5px;
  border: 1px solid var(--arag-border);
  border-radius: 5px;
  color: var(--arag-text-muted);
}
.ca-api-response { border-top: 1px solid var(--arag-border); padding: 8px 0; }
.ca-api-response:first-of-type { border-top: 0; }
.ca-api-response > summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; cursor: pointer; font-size: 0.84rem; }
.ca-api-media { font-size: 0.72rem; color: var(--arag-text-subtle); }

.ca-api-fieldset { border: 0; margin: 0; padding: 0; }
.ca-api-fieldset > legend {
  padding: 0;
  font: 700 0.7rem var(--arag-font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--arag-text-muted);
}
.ca-api-fieldset > .arag-help { margin: 4px 0 0; }
.ca-api-fieldset > .arag-field { margin-top: 8px; }
/* The kit's .arag-help is sized for a bare element; the markdown renderer wraps its text in a
   paragraph, so the rule has to reach one level in. */
.ca-api-detail .arag-help > p { margin: 0; font-size: inherit; color: inherit; }
.ca-api-detail .arag-datatable td > div > p { margin: 0; }
.ca-api-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 10px;
  margin-top: 8px;
}
.ca-api-req { color: var(--arag-danger-fg); font-weight: 600; }
.ca-api-ptype { color: var(--arag-text-subtle); font-weight: 400; font-family: var(--arag-font-mono); }
.ca-api-check { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 400; }
.ca-api-snippethead { margin-bottom: 4px; }

.ca-api-respbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; }
.ca-api-headers { margin: 0 0 8px; font-size: 0.78rem; }
`;
