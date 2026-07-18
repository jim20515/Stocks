// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  build: {
    transpile: ['v-calendar'],
  },
  modules: [
    '@nuxtjs/supabase',
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'zh-Hant' },
      meta: [
        // viewport-fit=cover 讓內容延伸到瀏海/圓角區
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#4f46e5' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: '股票看板' },
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: '股票看板',
      short_name: '股票看板',
      description: '台股個人投資組合管理',
      lang: 'zh-Hant',
      theme_color: '#4f46e5',
      background_color: '#f1f5f9',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // SSR 應用：導覽交給伺服器，不用 SPA fallback
      navigateFallback: undefined,
      globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
      // API / auth 一律走網路，不快取（避免快取到私人資料或壞掉的 token）
      runtimeCaching: [
        { urlPattern: /\/api\//, handler: 'NetworkOnly' },
      ],
    },
    client: { installPrompt: true },
    // 開發時不啟用 SW，避免快取干擾 HMR
    devOptions: { enabled: false },
  },
  supabase: {
    redirect: false,
    useSsrCookies: true,
  },
  runtimeConfig: {
    supabaseUrl: '',
    supabaseKey: '',
    supabaseServiceKey: '',
    anthropicApiKey: '',
    public: {
      supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_KEY,
      },
    },
  },
})
