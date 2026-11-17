/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BUILD_TIME: new Date().toISOString() },
}
