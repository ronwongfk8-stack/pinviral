import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Resolve the Gemini API key from any of the common env var names
  const geminiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.API_KEY || env.GEMINI_API_KEY || ''

  return {
    plugins: [react()],
    define: {
      // Expose under every name the app might read
      'import.meta.env.VITE_API_KEY':        JSON.stringify(geminiKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
      'import.meta.env.API_KEY':             JSON.stringify(geminiKey),
      'import.meta.env.GEMINI_API_KEY':      JSON.stringify(geminiKey),

      // Stripe keys
      'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_STRIPE_PUBLISHABLE_KEY || env.STRIPE_PUBLISHABLE_KEY || ''),
      'import.meta.env.VITE_STRIPE_SECRET_KEY':      JSON.stringify(env.VITE_STRIPE_SECRET_KEY      || env.STRIPE_SECRET_KEY      || ''),
    }
  }
})