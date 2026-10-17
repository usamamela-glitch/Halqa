import { Html, Head, Main, NextScript } from 'next/document'
import { CONSTITUENCY } from '../lib/config'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="application-name" content="Halqa" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Halqa" />
        <meta name="theme-color" content="#0d2e2e" />
        <meta name="description" content={`Constituency management for ${CONSTITUENCY}`} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
        <link rel="icon" href="/icon-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
