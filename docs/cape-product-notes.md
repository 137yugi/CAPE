# CAPE Product Notes

## Core Direction

CAPE ANIME is the lightweight runtime for CAPE packs.

- Mobile-first PWA.
- No required server for the live runtime.
- Loads CAPE Scene packages and CAPE Project packages.
- Plays full-screen looping scene video.
- Overlays mouth PNGs for mic-driven lip sync.
- Lets streamers switch scenes from large bottom controls.
- Keeps advanced settings in menus or secondary pages.

## Future TikTok Live Integration

Planned later, not a v1 blocker:

- A separate server will collect TikTok Live comments/events.
- When the TikTok Live SDK/server implementation is ready, CAPE ANIME should integrate with it.
- CAPE ANIME should receive normalized event messages rather than depending directly on the TikTok SDK.
- Comment events can drive live features such as scene switching, reactions, overlays, alerts, counters, or pack-specific actions.
- Keep CAPE ANIME usable without this server. TikTok integration is an optional enhancement layer.

Recommended integration shape:

```text
TikTok Live SDK/server
  -> normalized event stream
  -> CAPE ANIME event bridge
  -> scene/reaction/action rules
```

The live runtime should therefore expose a small internal event/action layer early, even before TikTok support exists.
