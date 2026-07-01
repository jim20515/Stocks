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
    clientOptions: {
      auth: {
        flowType: 'implicit',
      },
    },
  },
  runtimeConfig: {
    supabaseUrl: '',
    supabaseKey: '',
    anthropicApiKey: '',
    public: {
      supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_KEY,
      },
    },
  },
})
