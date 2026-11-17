// Halqa's version and updates.
// BUILD_TIME is when this version was built (set in next.config.js), shown in
// Settings so he can tell which version the phone is running.
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || ''

let newVersionWaiting = false
export function markNewVersion() { newVersionWaiting = true }

// Settings → "Check for update": asks for the newest version and, if there is
// one, reloads into it once it's downloaded. Resolves 'latest' if this is it.
export async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) return 'latest'
  if (newVersionWaiting) { window.location.reload(); return 'updating' }
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'latest'
  await reg.update()
  const sw = reg.installing || reg.waiting
  if (!sw) return 'latest'
  await new Promise(resolve => {
    if (sw.state === 'activated') return resolve()
    sw.addEventListener('statechange', () => { if (sw.state === 'activated' || sw.state === 'redundant') resolve() })
  })
  window.location.reload()
  return 'updating'
}
