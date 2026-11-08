// Fetch ancient forms (oracle, bronze, seal) of the core radicals from Wikimedia Commons.
// Run: HTTPS_PROXY=http://127.0.0.1:7897 node --use-env-proxy scripts/fetch-ancient.mjs
// Re-runnable: API answers are cached in .cache/ancient-api.json, downloaded SVGs are skipped.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const core = JSON.parse(fs.readFileSync(path.join(root, 'src/data/radicals-core.json'), 'utf8'))
const outDir = path.join(root, 'public/radicals/ancient')
const cacheFile = path.join(root, '.cache/ancient-api.json')
const UA = 'xiezi-radicals/1.0 (https://github.com/BayramgeldiNX/xiezi)'
const API = 'https://commons.wikimedia.org/w/api.php'
const SCRIPTS = ['oracle', 'bronze', 'seal']
const SUFFIXES = ['', '-2', '-3']
const TRAD = { 门: '門', 贝: '貝', 车: '車', 马: '馬', 鸟: '鳥', 鱼: '魚', 页: '頁', 见: '見', 讠: '言', 钅: '金', 饣: '食', 纟: '糸', 辶: '辵', 犭: '犬', 阝: '阜', 刂: '刀', 攵: '攴', 衤: '衣', 礻: '示', 王: '玉', 艹: '艸', 忄: '心', 扌: '手', 亻: '人', 氵: '水', 灬: '火', 冫: '仌', 广: '廣', 户: '戶', 儿: '兒', 尸: '尸', 隹: '隹' }
// Files checked by eye and left out (e.g. a picture in a box, not a clean glyph).
const SKIP = new Set(['File:囗-oracle.svg'])
const ALLOWED = /^(public domain|cc0|cc[ -]by([ -]sa)?\b|pd\b|cc[ -]zero)/i
const sleep = ms => new Promise(r => setTimeout(r, ms))

const radicals = core.stages.flatMap(s => s.radicals)
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}

function candidates(r) {
  const list = []
  const add = c => { if (c && !list.includes(c)) list.push(c) }
  add(r.full); add(r.r)
  for (const v of r.variants || []) add(v)
  for (const c of [...list]) add(TRAD[c])
  add(TRAD[r.r])
  if (r.r === '月') add('月')
  return list
}
const want = new Map() // radical -> [{char, script, title}]
const allTitles = new Set()
for (const r of radicals) {
  const arr = []
  for (const c of candidates(r)) for (const s of SCRIPTS) for (const suf of SUFFIXES) {
    const title = `File:${c}-${s}${suf}.svg`
    arr.push({ char: c, script: s, title }); allTitles.add(title)
  }
  want.set(r.r, arr)
}

async function api(titles) {
  const p = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size', redirects: '1' })
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${API}?${p}`, { headers: { 'User-Agent': UA } })
    if (res.ok) return res.json()
    await sleep(2000 * (i + 1))
  }
  throw new Error('API failed')
}
const need = [...allTitles].filter(t => !(t in cache))
console.log(`titles: ${allTitles.size}, to query: ${need.length}`)
for (let i = 0; i < need.length; i += 50) {
  const batch = need.slice(i, i + 50)
  const j = await api(batch)
  const norm = {}, redir = {}
  for (const n of j.query.normalized || []) norm[n.from] = n.to
  for (const n of j.query.redirects || []) redir[n.from] = n.to
  const byTitle = Object.fromEntries(j.query.pages.map(p => [p.title, p]))
  for (const t of batch) {
    let k = norm[t] || t
    k = redir[k] || k
    const p = byTitle[k]
    cache[t] = p && !p.missing && p.imageinfo ? { title: p.title, ...p.imageinfo[0] } : null
  }
  await sleep(500)
}
fs.writeFileSync(cacheFile, JSON.stringify(cache))

const strip = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
function meta(info) {
  const m = info.extmetadata || {}
  const license = strip(m.LicenseShortName?.value) || strip(m.License?.value)
  let author = strip(m.Artist?.value) || strip(m.Credit?.value)
  return { license, author: author.slice(0, 200) }
}
function clean(svg) {
  svg = svg.replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
  svg = svg.replace(/<(sodipodi|inkscape|dc|cc|rdf):[^>]*?\/>/g, '').replace(/<(sodipodi|inkscape|dc|cc|rdf):[^>]*>[\s\S]*?<\/\1:[^>]*>/g, '')
  svg = svg.replace(/\s(sodipodi|inkscape):[\w-]+="[^"]*"/g, '').replace(/\son\w+="[^"]*"/gi, '')
  svg = svg.replace(/\sxmlns:(sodipodi|inkscape|dc|cc|rdf)="[^"]*"/g, '')
  // white background rects
  svg = svg.replace(/<rect\b[^>]*?(fill\s*[:=]\s*"?(#fff(fff)?|white)\b|fill:\s*#fff(fff)?)[^>]*?\/>/gi, '')
  const m = svg.match(/<svg\b[^>]*>/i)
  if (!m) return null
  let tag = m[0]
  if (!/viewBox=/i.test(tag)) {
    const w = parseFloat((tag.match(/\swidth="([\d.]+)/) || [])[1]), h = parseFloat((tag.match(/\sheight="([\d.]+)/) || [])[1])
    if (!w || !h) return null
    tag = tag.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`)
  }
  tag = tag.replace(/\s(width|height)="[\d.]+(px)?"/g, '')
  svg = svg.replace(m[0], tag).replace(/>\s+</g, '><').trim()
  return svg
}

const out = {}
const hist = [0, 0, 0, 0]
const licenses = {}
for (const r of radicals) {
  const id = r.r.codePointAt(0).toString(16)
  const forms = []
  for (const s of SCRIPTS) {
    // first candidate (by priority) with an accepted license
    for (const w of want.get(r.r).filter(x => x.script === s)) {
      const info = cache[w.title]
      if (!info || SKIP.has(w.title)) continue
      const { license, author } = meta(info)
      if (!ALLOWED.test(license)) continue
      const file = `radicals/ancient/${id}-${s}.svg`
      const dest = path.join(root, 'public', file)
      if (!fs.existsSync(dest)) {
        let res
        for (let t = 0; t < 5; t++) {
          res = await fetch(info.url.split('?')[0], { headers: { 'User-Agent': UA } })
          await sleep(600)
          if (res.ok) break
          await sleep(3000 * (t + 1)) // 429 backoff
        }
        if (!res.ok) { console.warn('download failed', res.status, info.url); continue }
        const svg = clean(await res.text())
        if (!svg) { console.warn('bad svg', w.title); continue }
        fs.writeFileSync(dest, svg)
      }
      licenses[license] = (licenses[license] || 0) + 1
      forms.push({ script: s, file, title: info.title, author: author || 'Unknown', license, url: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(info.title.replace(/ /g, '_'))}`, char: w.char })
      break
    }
  }
  hist[forms.length]++
  if (forms.length) out[r.r] = { char: forms[0].char, forms: forms.map(({ char, ...f }) => f) }
  else console.log('none:', r.r, r.full)
}
fs.writeFileSync(path.join(root, 'src/data/ancient.gen.json'), JSON.stringify(out, null, 1) + '\n')
console.log('radicals with 0/1/2/3 forms:', hist.join(' / '))
console.log('licenses:', licenses)
