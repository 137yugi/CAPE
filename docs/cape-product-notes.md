# CAPE Product Notes

## Core Direction

CAPE Live is the lightweight runtime for CAPE packs.

- Mobile-first PWA.
- No required server for the live runtime.
- Loads CAPE Scene ZIP and CAPE Project ZIP.
- Plays full-screen looping scene video.
- Overlays mouth PNGs for mic-driven lip sync.
- Lets streamers switch scenes from large bottom controls.
- Keeps advanced settings in menus or secondary pages.

## Future TikTok Live Integration

Planned later, not a v1 blocker:

- A separate server will collect TikTok Live comments/events.
- When the TikTok Live SDK/server implementation is ready, CAPE Live should integrate with it.
- CAPE Live should receive normalized event messages rather than depending directly on the TikTok SDK.
- Comment events can drive live features such as scene switching, reactions, overlays, alerts, counters, or pack-specific actions.
- Keep CAPE Live usable without this server. TikTok integration is an optional enhancement layer.

Recommended integration shape:

```text
TikTok Live SDK/server
  -> normalized event stream
  -> CAPE Live event bridge
  -> scene/reaction/action rules
```

The live runtime should therefore expose a small internal event/action layer early, even before TikTok support exists.
