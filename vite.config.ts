/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// На GitHub Pages сайт живёт по адресу /<имя-репозитория>/. В Actions имя берём из GITHUB_REPOSITORY,
// локально (pnpm dev) база — корень.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.VITE_BASE ?? (repo ? `/${repo}/` : '/');

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Библиотека Supabase — отдельным файлом: меняется редко и кешируется независимо от кода сайта.
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'supabase', test: /node_modules[\\/]@supabase/ }] },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
