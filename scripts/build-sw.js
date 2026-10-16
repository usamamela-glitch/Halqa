// Runs after `next build`: writes out/sw.js with the list of every file the
// app needs, so the whole app opens with no signal. The version is a hash of
// those files, so each deploy installs a fresh cache and drops the old one.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const OUT = path.join(__dirname, '..', 'out')
const SKIP = new Set(['sw.js', 'district-map.pdf', '404.html'])

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : [full]
  })
}

if (!fs.existsSync(OUT)) {
  console.error('build-sw: out/ not found — did next build run with output: "export"?')
  process.exit(1)
}

const files = walk(OUT)
  .map(f => path.relative(OUT, f).split(path.sep).join('/'))
  .filter(f => !SKIP.has(f) && !f.endsWith('.txt') && !f.startsWith('legacy/'))
  .sort()

const hash = crypto.createHash('sha256')
files.forEach(f => { hash.update(f); hash.update(fs.readFileSync(path.join(OUT, f))) })
const version = hash.digest('hex').slice(0, 12)

const urls = files.map(f => (f === 'index.html' ? '/' : '/' + f))
const template = fs.readFileSync(path.join(__dirname, 'sw-template.js'), 'utf8')
const sw = template
  .replace('__VERSION__', JSON.stringify(version))
  .replace('__PRECACHE__', JSON.stringify(urls))
fs.writeFileSync(path.join(OUT, 'sw.js'), sw)
console.log(`build-sw: precaching ${urls.length} files, version ${version}`)
