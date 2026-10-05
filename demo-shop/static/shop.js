// Pine & Pebble storefront scripts. Distractors D1–D4 live here; bugs B5 and B9 are wired via templates.

function getCookie(name) {
  return document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.split('=')[1]
}

function setCookie(name, value) {
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`
}

// D1: cookie banner on first visit
function initCookieBanner() {
  const banner = document.getElementById('cookie-banner')
  if (!banner || getCookie('pp_consent')) return
  banner.hidden = false
  banner.querySelectorAll('[data-cookie]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setCookie('pp_consent', btn.dataset.cookie)
      banner.hidden = true
    }),
  )
}

// D2: newsletter popup after 4 s on product pages
function initNewsletter() {
  const popup = document.getElementById('newsletter')
  if (!popup || getCookie('pp_newsletter')) return
  setTimeout(() => {
    popup.hidden = false
  }, 4000)
  popup.querySelectorAll('[data-close-newsletter]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setCookie('pp_newsletter', 'dismissed')
      popup.hidden = true
    }),
  )
}

// D3: 1.5 s loading spinner on the catalog
function initCatalog() {
  const grid = document.getElementById('catalog-grid')
  if (!grid) return
  setTimeout(() => {
    document.getElementById('catalog-spinner').remove()
    grid.hidden = false
  }, 1500)
}

// Cart: remove a line (the buggy template calls an undefined function instead — B5)
async function removeCartItem(slug) {
  const body = new URLSearchParams({ slug })
  await fetch('/cart/remove', { method: 'POST', body })
  window.location.reload()
}
window.removeCartItem = removeCartItem

// B9: when enabled, the checkout gates "Continue" on a strict 5-digit postal code, with no message
function initCheckout() {
  const form = document.getElementById('checkout-form')
  if (!form || !('strictPostal' in form.dataset)) return
  const postal = form.querySelector('#postal_code')
  const button = form.querySelector('#continue-btn')
  const update = () => {
    const value = postal.value.trim()
    button.disabled = value !== '' && !/^\d{5}$/.test(value)
  }
  postal.addEventListener('input', update)
  update()
}

// Payment: never processes anything
function initPayment() {
  const pay = document.getElementById('pay-now')
  if (!pay) return
  pay.addEventListener('click', () => {
    document.getElementById('pay-disabled').hidden = false
  })
}

document.addEventListener('DOMContentLoaded', () => {
  initCookieBanner()
  initNewsletter()
  initCatalog()
  initCheckout()
  initPayment()
})
