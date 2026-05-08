import { fileURLToPath } from 'node:url'

const BRAND_LOGO_CID = 'upform-logo'
const BRAND_LOGO_PATH = fileURLToPath(new URL('../assets/logo_blue.png', import.meta.url))

export function inlineBrandLogo(html: string) {
  return html.replace(
    /<img([^>]*\balt=["']UpForm["'][^>]*)\bsrc=["'][^"']*logo_blue\.png["']([^>]*)>/i,
    `<img$1src="cid:${BRAND_LOGO_CID}"$2>`,
  )
}

export function getInlineEmailAttachments(html: string) {
  if (!html.includes(`cid:${BRAND_LOGO_CID}`)) return undefined

  return [
    {
      cid: BRAND_LOGO_CID,
      contentType: 'image/png',
      filename: 'upform-logo.png',
      path: BRAND_LOGO_PATH,
    },
  ]
}
