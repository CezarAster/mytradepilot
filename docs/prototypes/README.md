# Look-and-feel prototypes

Single-file, self-contained prototypes of two site directions from the design panel (GSAP and Lenis are inlined; the only external resource is Google Fonts). They are not the production site: the analyzer controls are mocks and the data is the fictional sample baked in.

Each file omits the `<!doctype>`, `<html>`, `<head>` and `<body>` wrapper because it was published through a tool that adds its own. To open one locally, wrap it:

```bash
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">'; cat docs/prototypes/equity-river.html; printf '</body></html>'; } > /tmp/equity-river.html
```

- `equity-river.html`: the chosen direction. Particle hero settling onto the real equity curve, pilot marker, four-scroll story, bento, roadmap, waitlist.
- `flight-recorder.html`: the runner-up. Horizon hero, workbench, sticky stage rebuilding the report beat by beat.
