# Prompt Atelier

A Windows-first anime tag and prompt builder. The current implementation provides a polished Electron interface, a curated canonical Core Pack, full-source catalog synchronization for Danbooru/Gelbooru/e621/AIBooru, tag search and categories, deterministic NAI/SDXL/Anima prompt output, weighted tags, implication/requirement/conflict rules, contextual suggestions, persistent workspace state, and a Pack Manager surface.

## Run

```powershell
npm install
npm run dev
```

Use `npm run build` for the production renderer build and `npm test` for core prompt/relationship validation.

## Public DLC updates

The public Pack Manager checks the public release channel for newer installed `.atelier-dlc` packs. It has no GitHub account, repository-management, or release-publishing access.
