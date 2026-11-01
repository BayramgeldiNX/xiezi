// Stroke shapes are the biggest data file, so they load when first needed instead of with the app.
export const STROKE_DATA = {};
let loading = null;
export const loadStrokes = () => (loading ||= import("./strokes.gen.json")
  .then((m) => { Object.assign(STROKE_DATA, m.default); })
  .catch((e) => { loading = null; throw e; }));

// Characters outside the books load one by one from public/strokes/<hex code point>.json.
const hex = (c) => c.codePointAt(0).toString(16);
export async function ensureChars(chars) {
  await loadStrokes().catch(() => {});
  await Promise.all([...chars].filter((c) => !STROKE_DATA[c]).map((c) =>
    fetch(`${import.meta.env.BASE_URL}strokes/${hex(c)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) STROKE_DATA[c] = d; })
      .catch(() => {})));
}
