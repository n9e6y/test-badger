// Page snapshot (03 §5.1). Injected with page.evaluate(); returns plain JSON.
// Tags each visible interactive element with data-sc-ref="N" (refs are valid for one snapshot only)
// and records a stable locator (role + accessible name, CSS fallback) for replay.
(() => {
  const MAX_ELEMENTS = 150
  const MAX_TEXT = 1500

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
  const cut = (s, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

  const isVisible = (el) => {
    if (el.closest('[hidden], [aria-hidden="true"]')) return false
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  const textOf = (id) => clean(document.getElementById(id)?.innerText)

  const accessibleName = (el) => {
    const aria = el.getAttribute('aria-label')
    if (aria) return clean(aria)
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) return clean(labelledBy.split(/\s+/).map(textOf).join(' '))
    if (el.labels && el.labels.length) return clean([...el.labels].map((l) => l.innerText).join(' ').replace(/\*/g, ''))
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) return clean(el.value)
    if (el.tagName === 'IMG') return clean(el.alt)
    const own = clean(el.innerText || el.textContent)
    if (own) return own
    return clean(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '')
  }

  const roleOf = (el) => {
    const explicit = el.getAttribute('role')
    if (explicit) return explicit
    const tag = el.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'button' || tag === 'summary') return 'button'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase()
      if (['submit', 'button', 'reset', 'image'].includes(t)) return 'button'
      if (t === 'checkbox') return 'checkbox'
      if (t === 'radio') return 'radio'
      if (t === 'number') return 'spinbutton'
      if (t === 'range') return 'slider'
      return 'textbox'
    }
    return 'generic'
  }

  const cssPath = (el) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id)
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      let part = node.tagName.toLowerCase()
      const name = node.getAttribute('name')
      if (name && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(node.tagName)) {
        part += `[name="${CSS.escape(name)}"]`
        parts.unshift(part)
        break
      }
      const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : []
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      parts.unshift(part)
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  const OVERLAY_SELECTOR = '[role="dialog"], [aria-modal="true"], dialog[open]'
  const overlayRoot = (el) => {
    let node = el
    while (node && node !== document.body) {
      if (node.matches(OVERLAY_SELECTOR)) return node
      const pos = getComputedStyle(node).position
      if (pos === 'fixed' || pos === 'sticky') {
        const r = node.getBoundingClientRect()
        const big = r.width * r.height > 0.02 * innerWidth * innerHeight
        if (big && node.tagName !== 'HEADER' && node.tagName !== 'NAV') return node
      }
      node = node.parentElement
    }
    return null
  }

  document.querySelectorAll('[data-sc-ref]').forEach((el) => el.removeAttribute('data-sc-ref'))

  // ---- overlays ----
  const overlayNodes = new Set()
  document.querySelectorAll('body *').forEach((el) => {
    if (!isVisible(el)) return
    const root = el.matches(OVERLAY_SELECTOR) ? el : null
    const style = getComputedStyle(el)
    if (root || style.position === 'fixed') {
      const o = overlayRoot(el)
      if (o && isVisible(o)) overlayNodes.add(o)
    }
  })
  const overlays = [...overlayNodes]
    .filter((o) => ![...overlayNodes].some((other) => other !== o && other.contains(o)))
    .map((o) => cut(clean(o.innerText), 120))
    .filter(Boolean)

  // ---- interactive elements ----
  const INTERACTIVE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"],' +
    ' [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="switch"], [role="combobox"],' +
    ' [contenteditable="true"]'
  const elements = []
  let ref = 0
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (elements.length >= MAX_ELEMENTS) break
    if (!isVisible(el)) continue
    ref += 1
    el.setAttribute('data-sc-ref', String(ref))
    const role = roleOf(el)
    const name = cut(accessibleName(el))
    const form = el.closest('form')
    const item = {
      ref,
      role,
      name,
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      value: ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && el.type !== 'password' ? cut(el.value ?? '', 60) : null,
      has_value: el.type === 'password' ? el.value.length > 0 : null,
      required: el.required || el.getAttribute('aria-required') === 'true',
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : null,
      invalid: el.getAttribute('aria-invalid') === 'true',
      href: el.tagName === 'A' ? el.getAttribute('href') : null,
      autocomplete: el.getAttribute('autocomplete') || null,
      form: form ? cut(clean(form.getAttribute('aria-label') || form.querySelector('h1,h2,h3,legend')?.innerText || form.getAttribute('action') || ''), 60) : null,
      in_overlay: Boolean(overlayRoot(el)),
      locator: { role, name: accessibleName(el), css: cssPath(el) },
    }
    if (el.tagName === 'SELECT') item.options = [...el.options].slice(0, 20).map((o) => cut(clean(o.text), 40))
    elements.push(item)
  }

  // ---- messages (alerts, validation errors, headings) ----
  const messages = []
  const seen = new Set()
  const addMessage = (kind, el) => {
    const text = cut(clean(el.innerText), 160)
    if (!text || seen.has(text) || !isVisible(el)) return
    seen.add(text)
    messages.push({ kind, text })
  }
  document.querySelectorAll('[role="alert"], [role="status"], [aria-live="assertive"], [aria-live="polite"]').forEach((el) => addMessage('alert', el))
  document.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
    ids.forEach((id) => document.getElementById(id) && addMessage('field_error', document.getElementById(id)))
  })
  // Native browser validation bubbles are not in the DOM: report fields the user already touched.
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    let touched = false
    try { touched = el.matches(':user-invalid') } catch { touched = false }
    if (touched && el.validationMessage && isVisible(el)) {
      const text = cut(`${accessibleName(el) || el.name}: ${el.validationMessage}`, 160)
      if (!seen.has(text)) { seen.add(text); messages.push({ kind: 'native_validation', text }) }
    }
  })
  document.querySelectorAll('[class*="error" i], [class*="invalid" i], [class*="flash" i], [class*="toast" i], [class*="notice" i]').forEach((el) => {
    if (el.children.length <= 2) addMessage('message', el)
  })
  document.querySelectorAll('h1, h2').forEach((el) => addMessage('heading', el))

  const frames = [...document.querySelectorAll('iframe')].map((f) => ({ title: f.title || '', src: f.src || '' }))
  const payment_fields = [...document.querySelectorAll('input')].some((i) =>
    /^cc-|^card/.test(i.getAttribute('autocomplete') || '') || /card.?number|cardnumber|\bcvc\b|\bcvv\b/i.test(`${i.name} ${i.id}`),
  )
  const main = document.querySelector('main') || document.body
  return {
    url: location.href,
    title: document.title,
    elements,
    messages: messages.slice(0, 25),
    overlays,
    frames,
    payment_fields,
    text: cut(clean(main.innerText), MAX_TEXT),
  }
})()
