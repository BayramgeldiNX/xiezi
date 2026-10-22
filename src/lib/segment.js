// Split Chinese text into words by longest match against a dictionary, so each word can be
// tapped for its meaning. dict: { 汉字: { py, en } }. Non-Chinese runs (punctuation) stay as is.
export function makeSegmenter(dict) {
  const max = Math.max(1, ...Object.keys(dict).map((k) => [...k].length));
  return function segment(text) {
    const chars = [...text], out = [];
    let i = 0;
    while (i < chars.length) {
      if (!/\p{Script=Han}/u.test(chars[i])) {
        let j = i;
        while (j < chars.length && !/\p{Script=Han}/u.test(chars[j])) j++;
        out.push({ t: chars.slice(i, j).join(""), word: false });
        i = j;
        continue;
      }
      let len = Math.min(max, chars.length - i);
      while (len > 1 && !dict[chars.slice(i, i + len).join("")]) len--;
      const t = chars.slice(i, i + len).join("");
      out.push({ t, word: true, info: dict[t] || null });
      i += len;
    }
    return out;
  };
}
