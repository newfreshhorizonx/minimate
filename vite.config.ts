import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative paths, so the build works both locally and under /minimate/ on GitHub Pages.
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Minimate',
        short_name: 'Minimate',
        description: 'Small-board chess levels that train real chess skills.',
        theme_color: '#1f2a24',
        background_color: '#1f2a24',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
});
