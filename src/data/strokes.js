// Stroke shapes are the biggest data file, so they load when first needed instead of with the app.
export const STROKE_DATA = {};
let loading = null;
export const loadStrokes = () => (loading ||= import("./strokes.gen.json")
  .then((m) => { Object.assign(STROKE_DATA, m.default); })
  .catch((e) => { loading = null; throw e; }));
