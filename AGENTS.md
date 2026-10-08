<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application rules
- Keep the MusicBot presentation at the index route and use existing UI primitives; the requested experience opens immediately at the home URL.
- Treat the supplied session as an explicitly labeled visual preview until an existing bot API is provided; never imply sample data is synced to Discord or implement independent audio playback.
- Keep album artwork bundled and derive ambience from the currently displayed artwork; visual lighting must follow the music rather than unrelated decoration.
- Follow the design system guidelines in `DESIGN.md`: maintain the normalized 4-tier typography scale (minimum 11px font size) and keep the desktop layout within a no-scroll single-page viewport (compact 56px header, internal queue scrolling).
