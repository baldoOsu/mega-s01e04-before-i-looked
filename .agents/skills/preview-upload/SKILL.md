---
name: preview-upload
description: Save a rig page as one HTML file and put it on a public link (Vercel CLI), then take the lane marker off by uploading over the same link. Use for a plan's "Preview for review" and "Clean up" issues (ADR 0003).
---

# preview-upload

A preview is one HTML file on a public HTTPS link we can upload over (ADR 0003). Never commit it,
attach it to an issue, or paste it in chat.

## Save the page (a command, not "save as")

```sh
LANE_MARKER=<marker> PORT=8797 pnpm start &       # marked copy, for review
curl -sf localhost:8797/digest/<night> -o <outside-repo>/preview/index.html
env -u LANE_MARKER PORT=8797 pnpm start &         # clean copy, for the clean-up
```

Check the banner (`class="marker"`) before uploading. Keep the folder outside the repo.

## Upload (Vercel CLI, signed in as the lane owner)

The folder holds `index.html` and a `vercel.json` that sends `Cache-Control: no-store`:

```sh
npx vercel@latest whoami                           # must be the owner's account; else ask them to run `vercel login`
npx vercel@latest deploy --prod --yes --scope <team>
```

- Use the project's production alias that `vercel inspect <deployment-url>` lists. The bare
  `<project>.vercel.app` name may belong to someone else: fetch it and check before you send it.
- Fetch the link from outside (curl) and compare it byte for byte with the saved file before sending it.
- The claude.ai Vercel connector may be read-only (403 on create): use the CLI.

## Review, then clean up

1. Send the link. Leave the preview issue open until the reviewer has looked; sending is not done.
2. After the review: save the clean copy, deploy it over the same link, fetch it, and check the marker is gone.
3. Delete the marked deployment (`npx vercel@latest remove <deployment-url> --yes`), because each deploy
   keeps its own URL with the marker on it.
