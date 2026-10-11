# vision-matte — AI masks with Apple Vision

Used by VDO's **AI Removal**: it removes the background from a normal video, with no green screen.

- **Where it runs:** on this Mac, with Apple's built-in Vision framework and the Neural Engine. There is nothing to install and no internet or API key.
- **How it's built:** VDO builds it on first use (`build.sh` → `.build/vision-matte`), and rebuilds it when `main.swift` changes.

## Usage

```
vision-matte INPUT --probe                     → {"width","height","fps","fpsRational","frameCount",...}
vision-matte INPUT [--mode person|subject|people|hybrid] [--quality accurate|balanced|fast]
             [--all | --point X,Y ...] [--min-island PCT] [--start S] [--duration D] [--frames N]
             [--ema A] [--out FILE | --null] [--stats FILE] [--quiet]
```

- **Output:** raw 8-bit gray, one `width×height` frame per video frame, at display size (rotation is handled).
- **Progress:** stderr lines `frame i/N`.
- **Reading it in FFmpeg:** `-f rawvideo -pix_fmt gray -s WxH -r <fpsRational> -i pipe:0`.

## Modes (tested on real clips, Apple M5)

| mode                               | what it keeps             | speed   | notes                                                                                           |
| ---------------------------------- | ------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `hybrid` (VDO default, `balanced`) | people and what they hold | ~27 fps | Solid edges, the watermark is dropped, the most stable (0.024 % flicker). Hair edges are harder |
| `person` (`accurate`)              | people only               | ~21 fps | Softest hair. Held objects can turn 35–60 % see-through                                         |
| `subject`                          | the main object(s)        | ~42 fps | Any object. Touching things merge; with no clear subject it can keep background structure       |
| `people --point X,Y`               | one of up to 4 people     | ~45 fps | For AI Cutout (later). It can switch identity when people overlap                               |

**Not for effects:** smoke, powder, fireworks and muzzle flashes turn into on/off blobs. Use Color Key (Effects) or Black background for those.

## Pitfalls (how VDO handles them)

- **Frame rate:** use the probe's `fpsRational`, never the rounded fps from the video info. A slightly wrong rate drifts the mask by frames.
- **Timestamps:** use frame-index timestamps (`setpts=N/FRAME_RATE/TB`) on both the video and the mask. The mask file's millisecond times add a frame otherwise.
- **`tmedian` shift:** `tmedian=radius=R` shifts the output early. Pad with clones first: `tpad=start=R:start_mode=clone:stop=R:stop_mode=clone`.
- **Smoothing:** `tmix` and EMA lag and ghost across cuts. `tmedian` doesn't.
- **WebM input:** AVFoundation can't read WebM, so VDO makes a same-timing MP4 copy first.
- **Frame count:** the mask frame count is checked against the video before the mask is used.
- **Reading VP9 alpha back:** decode with `-c:v libvpx-vp9`. The built-in decoder drops alpha.

The other scripts here (`compare.sh`, `cutouts.sh`, `overview.sh`, `tile8*.sh`, `mask-stats.swift`) are the tools used to evaluate quality and flicker.
