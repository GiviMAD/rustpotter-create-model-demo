import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    LIB_VERSION: JSON.stringify(process.env.npm_package_version),
  },
  publicDir: './public',
  build: {
    outDir: "./dist"
  }
});