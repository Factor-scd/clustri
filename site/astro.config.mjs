import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  output: 'static',
  base: isGitHubPages ? '/clustri/' : '/',
  vite: { plugins: [tailwindcss()] },
})
