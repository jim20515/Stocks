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
  ],
  supabase: {
    redirect: false,
  },
  runtimeConfig: {
    supabaseUrl: '',
    supabaseKey: '',
    anthropicApiKey: '',
  },
})
