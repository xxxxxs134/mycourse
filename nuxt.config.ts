// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tokens.css'],
  components: [
    { path: '~/components', pathPrefix: false }
  ],
  nitro: {
    preset: 'node-cluster',
    routeRules: {
      '/**': {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        }
      }
    }
  },
  experimental: {
    typedPages: false
  }
})
