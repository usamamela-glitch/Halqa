import { Fragment } from 'react'

// Minimal Markdown for analysis reports: headings, bullets, numbered lists,
// bold/italic and paragraphs. Rendered as React elements (no raw HTML).

function inline(text, keyBase) {
  const out = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={`${keyBase}-${i++}`}>{t.slice(2, -2)}</strong>)
    else out.push(<em key={`${keyBase}-${i++}`}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function Markdown({ text, className }) {
  const lines = (text || '').split('\n')
  const blocks = []
  let list = null

  const flush = () => { if (list) { blocks.push(list); list = null } }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
    if (h) {
      flush()
      const level = Math.min(4, h[1].length + 1)
      const Tag = `h${level}`
      blocks.push(<Tag key={idx}>{inline(h[2], idx)}</Tag>)
    } else if (ul || ol) {
      const type = ul ? 'ul' : 'ol'
      if (!list || list.type !== type) { flush(); list = { type, items: [], key: idx } }
      list.items.push(<li key={idx}>{inline((ul ? ul[1] : ol[2]), idx)}</li>)
    } else if (!line.trim()) {
      flush()
    } else if (/^-{3,}$/.test(line.trim())) {
      flush()
      blocks.push(<hr key={idx} />)
    } else {
      flush()
      blocks.push(<p key={idx}>{inline(line, idx)}</p>)
    }
  })
  flush()

  return (
    <div className={className}>
      {blocks.map(b => {
        if (b && b.items) {
          const Tag = b.type
          return <Tag key={`l${b.key}`}>{b.items}</Tag>
        }
        return <Fragment key={b.key}>{b}</Fragment>
      })}
    </div>
  )
}
