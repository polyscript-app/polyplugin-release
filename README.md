# Polyplugin for IINA

## Install the public release

1. Install [IINA](https://iina.io/) on macOS.
2. In IINA, open `Preferences -> Plugins`.
3. Choose `Install from GitHub...`.
4. Paste `polyscript-app/polyplugin-release`.
5. Restart IINA, open a video, and switch to the `Polyscript` sidebar tab.

IINA also accepts:

- `https://github.com/polyscript-app/polyplugin-release`
- `github.com/polyscript-app/polyplugin-release`

If GitHub install fails, download the packaged release from:

`https://github.com/polyscript-app/polyplugin-release/releases`

## First-time use

- Open a video with embedded subtitles or load an `.srt` file.
- Turn on the Polyscript sidebar tab if it is hidden.
- Pick your target language and enable the subtitle overlay.
- Basic Google-powered subtitle translation works without account sign-in.
- Use sign-in or free trial when you want synced account features or custom AI targets.

## Local development

Use the dev symlink so IINA loads the plugin directly from this repo:

```bash
npm run dev:link
npm run dev:watch
```

`dev:watch` rebuilds, syncs, and restarts IINA on changes.

Before testing the GitHub-distributed plugin, remove the local dev install:

```bash
npm run dev:unlink
```
