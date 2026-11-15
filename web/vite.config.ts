import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path for GitHub Pages project site: https://<user>.github.io/sunlock-app/
export default defineConfig({
  base: '/sunlock-app/',
  plugins: [react()],
})
