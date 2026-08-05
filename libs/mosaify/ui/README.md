# @react-mono/mosaify-ui

This library was generated with [Nx](https://nx.dev).

## How `MosaicGrid` builds and renders a mosaic

`MosaicGrid` turns a target image + a set of tile images into a photomosaic painted
on a single `<canvas>`. The pipeline runs in four phases:

1. **Sample** (`sampleGrid`) — draws the target image downscaled to `cols×rows` and
   reads back one average RGB per cell. Grid dimensions derive from the image's aspect
   ratio, so the mosaic isn't stretched.
2. **Match** (`runMatch`, in a Web Worker) — maps each cell's colour to the nearest tile
   using the selected algorithm (RGB, ΔE76, ΔE2000, detail/Sobel, multi-scale, variety),
   returning `MatchedCell[]`. A monotonic request id drops stale responses from rapid
   toggles; falls back to a synchronous match where `Worker` is unavailable (jsdom/SSR).
3. **Paint** (`paintMosaic` / `paintCells`) — two-pass fill on one `<canvas>` (replacing
   ~40k `<img>` nodes): instant average-colour blocks first, then each unique tile decoded
   once and stamped into all of its cells (progressive as tiles decode).
4. **Interact / overlay** — pan/zoom write the transform straight to the GPU-composited
   content layer (no React re-render); `paintDetail` re-rasterizes just the visible cells
   onto a crisp overlay canvas when zoomed in.

Export (`toBlob` / `toSvg` / `toPdf` on the imperative handle) re-renders the cached
mosaic data at high resolution rather than reading the GPU-capped on-screen canvas.

```mermaid
sequenceDiagram
    autonumber
    participant Parent
    participant MG as MosaicGrid<br/>(mosaic-grid.tsx)
    participant SG as sampleGrid<br/>(mosaic-canvas)
    participant MW as mosaic-match<br/>.worker
    participant PM as paintMosaic /<br/>paintCells
    participant Base as base canvas
    participant Detail as detail canvas

    Parent->>MG: render (image, tiles, resolution, algorithm)
    note over MG: hasMosaic=false → show img placeholder

    rect rgb(235,245,255)
    note over MG,SG: Effect A — sample target [image.url, resolution]
    MG->>MG: resetZoom(), setDims(null),<br/>clear sampledRef / tileCache / dataRef
    MG->>SG: sampleGrid(url, resolution)
    SG->>SG: draw img downscaled to cols×rows,<br/>getImageData → avg RGB per cell
    SG-->>MG: SampledGrid {cols, rows, cells}
    MG->>MG: sampledRef = grid, setDims({cols,rows})
    MG-->>Parent: onGrid({cols, rows})
    end

    rect rgb(240,255,240)
    note over MG,PM: Effect B — match + paint [algorithm, tiles, dims]
    MG->>MG: reqId = ++matchReqId, setMatching(true)
    alt Worker available
        MG->>MW: postMessage {id, algorithm, grid.cells, tiles, cols}
        MW->>MW: runMatch → toSwatches + nearest-tile<br/>(RGB / ΔE76 / ΔE2000 / detail / …)
        MW-->>MG: {id, cells: MatchedCell[]}
        MG->>MG: drop if id ≠ latest, setMatching(false)
    else No Worker (jsdom/SSR)
        MG->>MG: runMatch(...) synchronously
    end
    MG->>MG: dataRef = {cols, rows, cells}
    end

    rect rgb(255,250,235)
    note over MG,Base: paint() inside requestAnimationFrame
    MG->>PM: paintMosaic(canvas, data, tileCache)
    PM->>Base: Pass 1 — fillRect avg colour per cell (instant)
    loop each unique tile URL (groupByUrl)
        PM->>PM: loadImage(url) → cache (skip if cached)
        PM->>Base: Pass 2 — drawImage into all its cells
    end
    PM-->>MG: done → drawDetail()
    end

    rect rgb(250,240,255)
    note over MG,Detail: Interaction — pan / zoom / pinch / wheel
    Parent->>MG: wheel / pointer / +−  → zoomTo / drag
    MG->>MG: write transformRef, applyTransform()
    MG->>Base: rAF: content.style.transform = translate3d+scale
    MG->>Detail: drawDetail() — if scale>1 & visibleCells≤2500
    Detail->>Detail: paintDetail: re-rasterize visible cells<br/>at device px (crisp overlay)
    end

    note over Parent,MG: Export (imperative handle):<br/>toBlob/toSvg/toPdf → renderJpeg/renderSvg/renderPdf(dataRef, tileCache)
```

### The detail overlay (`detailRef`)

The base canvas (`canvasRef`) lives inside the transformed content layer, so pan/zoom
is free — but its fixed pixels blur when scaled up. `detailRef` is a sibling canvas
that is **not** transformed; `drawDetail` re-rasterizes only the visible slice into
frame pixels at device resolution, so zoomed-in tiles stay crisp. It runs every frame
from `applyTransform` (same frame as the transform write — no settle delay) and gates
itself to stay cheap: it only shows once zoomed past `MIN_SCALE` and while the visible
cell count (`cols·rows / scale²`) is under `DETAIL_MAX_CELLS` (2500); otherwise it hides
and the base shows through.

```mermaid
flowchart TD
    A[wheel / drag / pinch / +−] --> B[write transformRef]
    B --> C[applyTransform: rAF]
    C --> D[content.style.transform = translate3d + scale]
    C --> E[drawDetail]
    E --> F{scale &gt; MIN_SCALE<br/>AND<br/>visibleCells ≤ DETAIL_MAX_CELLS?}
    F -- no --> G[detail.style.opacity = 0<br/>base canvas shows through]
    F -- yes --> H[paintDetail: re-rasterize visible<br/>cells at device px into frame]
    H --> I[detail.style.opacity = 1<br/>crisp overlay on top]
```

## Running unit tests

Run `nx test @react-mono/mosaify-ui` to execute the unit tests via [Vitest](https://vitest.dev/).
