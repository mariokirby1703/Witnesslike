# Witnesslike

Puzzle generator and solver inspired by *The Witness*, built with React + TypeScript + Vite.

## Requirements

- Node.js `>=20.19.0` (or `>=22.12.0`)
- npm

## Local development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm run build
```

## Production build

```bash
npm run build
```

The output is written to `dist/`.

`vite.config.ts` uses `base: './'`, so the app can be deployed both on a root domain and in a subfolder path (for example GitHub Pages project sites).

## Public deployment (GitHub Pages)

This repository already contains a deployment workflow at `.github/workflows/deploy.yml`.

Required one-time GitHub setup:

1. Open repository settings in GitHub.
2. Go to `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` (or run the workflow manually from the Actions tab).

After that, each push to `main` deploys the latest `witnesslike/dist` to your public GitHub Pages URL.
