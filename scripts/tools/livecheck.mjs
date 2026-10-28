// Check that the deployed site already serves a change: node --use-env-proxy scripts/tools/livecheck.mjs "<text or regex>"
const base = "https://bayramgeldinx.github.io/xiezi/";
const want = new RegExp(process.argv[2]);
const html = await (await fetch(base, { cache: "no-store" })).text();
const files = [...new Set([...html.matchAll(/assets\/[^"']+\.(?:js|css)/g)].map((m) => m[0]))];
let found = want.test(html) ? ["index.html"] : [];
for (const f of files) if (want.test(await (await fetch(base + f)).text())) found.push(f);
console.log(found.length ? `found in ${found.join(", ")}` : `not live yet (checked ${files.length} files)`);
