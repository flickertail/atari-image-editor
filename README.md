# Atari 2600 Image Editor

**Live editor: https://flickertail.github.io/atari-image-editor/**

A browser-based editor for making Atari 2600 bitmap graphics: title screens,
tiles, 48/96-pixel-wide images, sprites and text. Draw or import an image,
work in layers, and export it as a C header (`.h`) you can `#include` in a
kernel.

It runs entirely in your browser. Nothing is uploaded anywhere.

## The data model

The editor follows one hardware rule: **each 8-pixel group on each scanline
has exactly one color and one 8-pixel mask.** That is what a bus-stuffed
(e.g. ELF-VCS) kernel can produce by writing a fresh `COLUPx` + `GRPx` pair
per group per scanline.

- The canvas is `N` groups wide (8 pixels each) and `H` scanlines tall.
  A 48-pixel image is 6 groups wide, a 96-pixel image is 12.
- For every (scanline, group) a layer stores a **color byte** and a
  **mask byte**. Bit 7 of the mask is the leftmost pixel; `1` shows the
  group's color, `0` is transparent.
- So painting a pixel recolors the *whole 8-pixel group* on that scanline.
  Two different colors can't share a group on one scanline; that is the
  real hardware limit, not an editor shortcut.
- Colors are the usual Atari color bytes, `(hue << 4) | (lum << 1)`,
  `0x00`-`0xFE`. The byte is the same on every TV standard; what changes is
  how it looks (see *Palettes* below).
- The canvas shows an Atari pixel twice as wide as it is tall, as on a TV.

## Palettes

The **NTSC / PAL / SECAM** tabs above the color swatches choose which TV
standard's palette you view and pick colors from.

- **NTSC** and **PAL** have 128 colors each (16 hues x 8 luminances). In PAL,
  hues 0, 1, 14 and 15 are all gray.
- **SECAM** has only 8 colors (black, blue, red, magenta, green, cyan,
  yellow, white). The hue is ignored and the color comes from the three
  luminance bits alone, so picking a SECAM swatch gives you the hue-0 byte
  `0x00`, `0x02` ... `0x0E`. Any byte with the same luminance bits displays
  as that same color.
- Switching tabs **never changes your artwork's data**: the same color bytes
  just look different, exactly as the same ROM does on a PAL or SECAM
  console. Exported `.h` files contain the bytes, which are what the
  hardware uses on any standard.
- Importing an image snaps its colors to the palette of the tab that is
  active at that moment.
- Save Project remembers the active palette; opening a project from before
  PAL/SECAM support switches to NTSC.

## Tools

| Tool | What it does |
|---|---|
| Pencil | Draws in the current color; drag to draw lines. |
| Eraser | Clears pixels (mask only). |
| Fill | Flood fill. Hold **Shift** to erase-fill instead. |
| Eyedrop | Picks the color under the cursor. |
| Line / Rect / Rect Fill | Shapes, previewed live while you drag. |
| Rect Erase | Erases a filled rectangle of pixels (mask only; colors untouched). |
| Move | Shifts the active layer's whole content by exactly 1 pixel. Drag, or use the **arrow keys** (**Shift** = 8 pixels). |
| Camera | World playfield layers only: sets the selected camera view's point (top-left). Click or drag on the canvas, or use the **arrow keys** (**Shift** = 8). |
| Select | Drag a rectangle to select an area for **Copy** / **Paste** (below). A click without dragging, or **Esc**, clears it. |

Everything draws on the **active layer** (click a layer in the right panel).

### Copy and paste to a new layer

1. Pick **Select** and drag a rectangle over the area you want.
2. **Copy** (button, or **Ctrl+C**) takes the selected pixels of the
   **active layer**, with their colors.
3. **Paste** (button, or **Ctrl+V**) puts them into a **new layer** just above
   the active one, at the same position, and makes it the active layer. Use
   **Move** to slide it where you want it, or **Stamp** it onto the layer
   below.

Pasted pixels keep the exact color they had, and transparent pixels stay
transparent. You can paste the same copy as many times as you like, and each
paste is one **Undo** step.

**Right-click** the canvas for *Clear All*, *Clear Colors* or *Clear
Geometry* on the active layer. Colors and geometry are independent data, so
you can clear one without the other.

Other controls: **Ctrl+Z** undo, **Ctrl+Y** (or Ctrl+Shift+Z) redo, the
**Zoom** slider or **Ctrl + mouse wheel** to zoom, and checkboxes for
group lines (every 8 pixels) and row lines.

The **Help** button in the top bar shows this README inside the editor, and
**License** shows the license.

## Layers

Layers stack bottom to top; the top-most visible layer wins per pixel in the
preview. Each layer has a visibility checkbox, a name, and buttons to move it
up/down, **Stamp**, duplicate, and delete. There are two kinds, and a project
can mix them freely: **+ Sprite** adds a sprite layer (8-pixel groups, as
described above) and **+ Playfield** adds a playfield layer. The small badge
before each name says which it is: **SPR**, **PF** or **PF·W** (world).

### Playfield layers

The TIA playfield is **40 blocks** across the 160-pixel screen, so one block
is **4 pixels** wide. Every tool paints whole blocks; **Move** moves by whole
blocks (a drag snaps to the nearest block, an arrow key moves one block,
**Shift** eight). Faint 4-pixel block lines show while a playfield layer is
active. A playfield layer starts at x 0 and is cropped to the canvas; a full
screen is a 20-byte (160 px) canvas.

The active playfield layer's settings appear under its row:

- **Size**
  - **Screen** - exactly 40 blocks (one screen).
  - **World** - as wide as the canvas (canvas pixels / 4 blocks), for
    scrolling maps bigger than the screen. Always asymmetric, one colour per
    row. Use **Resize Canvas** to make the world as big as you need.
- **Right half** (Screen only)
  - **Asymmetric** - all 40 blocks are yours; the kernel rewrites PF0-PF2
    mid-line.
  - **Repeat** / **Mirror** - draw either half; the other is the same blocks
    repeated or mirrored (CTRLPF bit 0 = 0 / 1).
- **Colour** (Screen only). Like a sprite group, painting a block recolours
  its whole colour unit for that scanline:
  - **Per row** - one COLUPF per scanline.
  - **Score** - the left and right halves each have their own colour
    (COLUP0 / COLUP1 in score mode - shared with the sprites on that line).
  - **Per register** - a colour per register region per scanline (left PF0,
    PF1, PF2, then right PF0, PF1, PF2), for a kernel that rewrites COLUPF
    mid-line. A colour write can only take effect every 3 pixels (one CPU
    cycle), so at x 48, 80, 96 and 128 (112 and 144 in Mirror, only 112
    exact) the switch lands 1-2 pixels late. The preview shows that, as the
    TV would.

#### Camera views (World layers)

A camera view is just a point: the top-left of what the game shows, **x in
blocks** and **y in rows**. How much the game actually shows from there is up
to the program; the editor's yellow guide frame assumes 40 blocks x 192 rows.

- Every World layer starts with the view **default** at (0, 0).
- **+ View** adds one; give it a name, then place it with the **Camera** tool
  or by typing x and y. Click a view to select it and show its guide frame.
- Views are saved in the project file and exported (below), so the program
  can jump straight to a named spot on the map.

### Resize Canvas

**Resize Canvas** makes the canvas wider or narrower, taller or shorter, up to
128 bytes (1024 px = 256 playfield blocks) by 1024 rows. Every layer keeps its
content; anything outside the new size is cropped. World playfield layers
follow the new width. (Very large canvases limit how far you can zoom in.)

### Stamp: build a tile sheet from separate tile designs

**Stamp** copies a layer's color *and* pixels onto the layer directly below
it. The intended workflow:

1. Design a tile on its own layer.
2. Use **Move** to slide that layer over the exact spot you want on the main
   tile layer below it.
3. Click **Stamp** on the tile layer.
4. Move the tile layer to the next spot and Stamp again. The tile layer is
   never changed by stamping, so you can reuse it.

Details:

- Every 8-pixel cell where the tile layer has at least one pixel **replaces**
  that cell (color and pixels) on the layer below. Replaced, not merged,
  because a cell can hold only one color.
- Cells where the tile layer has no pixels leave the layer below alone. That
  means a blank row inside a tile will **not** erase what's underneath; clear
  that spot on the main layer first if you need it empty.
- Stamp is undoable (Ctrl+Z). It is disabled on the bottom layer.

### Importing layers from another project

**Import Layers** (top bar) copies layers out of another saved project
(`.json`) into the one you have open, so you can reuse tiles, fonts or
artwork between projects.

1. Click **Import Layers** and pick a project file you saved earlier.
2. A list shows every layer in that project with a thumbnail. Tick the ones
   you want (**Select all** / **Select none** help), then click **Import
   selected layers**.
3. The chosen layers are added on top of your layer stack, keeping their
   order, names and visibility. Your existing layers aren't touched.

If the other project's canvas is a different size, nothing is scaled (the data
is hardware bytes, so scaling would corrupt it): imported layers are placed at
the **top-left** and anything outside your canvas is cropped. If the other
canvas is bigger, an **Enlarge the active canvas to fit** checkbox appears (off
by default) that grows your canvas to the larger of the two sizes first, with
your existing layers staying exactly where they are. The whole import is one
**Undo** step. Use **Move** afterward to position an imported layer.

## Importing images

**Import Image** adds the picture as a new layer.

- **Line art mode** (default): for one-color-plus-background art such as
  logos and hand-drawn pixel art. No resizing; the image is placed at its
  native size in the top-left corner. The darker of its two colors is
  skipped and the lighter one becomes a single color, the nearest Atari
  palette entry. "Each source pixel row" lets one source pixel become 1 or 2
  scanlines (since Atari pixels are about twice as wide as tall). Use **Move**
  afterwards to position it.
- **Photo mode** (line art unchecked): resizes the image (Stretch / Fit
  (letterbox) / Fill (crop)) and, for every 8-pixel group on every scanline,
  picks one ink color (the average of that group's source pixels, snapped to
  the nearest Atari palette color). The on/off pixel pattern is then
  dithered (Floyd-Steinberg, optional) to approximate the original.

## Adding text

**Add Text** renders text in any installed font as a new layer.

- Type a font name, or pick from the browse list. **Load System Fonts**
  (Chrome/Edge) lists every installed font after a one-time permission, and
  you can also load a **custom font file** (`.ttf`, `.otf`, `.woff`,
  `.woff2`).
- Set size in pixels, bold/italic, and the X/Y position. Text is a single ink
  color, so it always converts cleanly.

## Projects and tabs

Every open project has its own **tab** above the canvas, so you can work on
several at once. **New Canvas** and **Load Project** each open a new tab -
nothing already open is replaced. Click a tab to switch to it, and its **×**
(or a middle-click) to close it.

- Each tab keeps its own layers, undo/redo history, selection, palette
  (NTSC/PAL/SECAM), zoom and scroll position.
- **Copy** in one tab and **Paste** in another to move pixels between
  projects (the paste becomes a new layer there).
- A **dot** before a tab's name means it has unsaved changes. Closing such a
  tab - or the browser page while any tab has one - asks first.
- Closing the last tab opens a fresh blank one.

## Saving and exporting

- **Save Project** / **Load Project** round-trip the full editor state
  (all layers) of a tab as a `.json` file. Saving names the tab after the
  file; a loaded project's tab is named after its file.
- **Export .h** generates a C header from all layers or one layer. Use
  **Copy** or **Download .h**.

In Chrome and Edge, saving opens the normal **Save As** dialog so you can put
the file anywhere. Other browsers fall back to a regular download.

### Export format

```c
#ifndef TITLE_H
#define TITLE_H

#include <stdint.h>

// "title" - 96 px wide (12 bytes/group) x 64 scanlines
// title[row][0][group] = color byte, title[row][1][group] = pixel mask (bit7 = leftmost pixel)
#define TITLE_ROWS 64
#define TITLE_GROUPS 12

static const uint8_t title[TITLE_ROWS][2][TITLE_GROUPS] = {
    { // row 0
        {0x1a,0x1a, ...},   // color byte per group
        {0x00,0x3c, ...},   // pixel mask per group
    },
    ...
};

#endif
```

- The array name comes from the layer name (sanitized to a C identifier).
  Exporting a single layer names the file after that layer; exporting all
  layers produces `sprites.h` with one array per layer.
- Everything is `static const` with include guards and its own
  `#include <stdint.h>`, so you can include the same header from several
  `.c` files without link errors.
- Ready to feed a kernel that writes `COLUPx`/`GRPx` per group per scanline.

#### Playfield layers

A **Screen** playfield layer exports the playfield registers per row, in the
TIA's own bit order (PF0 uses bits 4-7, PF1 bits 7-0, PF2 bits 0-7), ready to
write straight to the TIA, plus its colours:

```c
#define LEVEL_ROWS 192
static const uint8_t level[LEVEL_ROWS][3] = {      // { PF0, PF1, PF2 }
    {0x10,0x80,0x01}, // row 0                      // Asymmetric: [ROWS][6] = { PF0, PF1, PF2, PF0R, PF1R, PF2R }
    ...
};
static const uint8_t level_color[LEVEL_ROWS] = { ... };   // Per row: COLUPF
                                                           // Score: [ROWS][2] = { left, right }
                                                           // Per register: [ROWS][6], screen order
```

A **World** playfield layer exports the whole map as a bitmap - each row's
blocks packed 8 per byte, bit 7 = leftmost block - one colour per row, and
its camera views, with an `enum` of their names:

```c
#define LEVEL1_ROWS 600
#define LEVEL1_BLOCKS 120
#define LEVEL1_ROW_BYTES 15
#define LEVEL1_VIEWS 3
static const uint8_t level1[LEVEL1_ROWS][LEVEL1_ROW_BYTES] = { ... };
static const uint8_t level1_color[LEVEL1_ROWS] = { ... };
enum { LEVEL1_VIEW_DEFAULT, LEVEL1_VIEW_CAVE, LEVEL1_VIEW_BOSS };
static const uint16_t level1_views[LEVEL1_VIEWS][2] = {   // { x in blocks, y in rows }
    { 0, 0 }, // default
    { 40, 120 }, // cave
    { 80, 0 }, // boss
};
```

The kernel takes the 40 blocks it shows from a row (starting at the view's
x, as the map scrolls) and repacks them into PF0/PF1/PF2 itself.

## Running it locally

The live site is all you need. To run your own copy, serve the folder over
HTTP (any static server works; the native Save As dialog needs a secure
context, meaning `https://` or `http://localhost`):

```
python -m http.server 8000
```

then open `http://localhost:8000/`. There is no build step and no
dependencies.

## Browser support

Developed and tested in Chrome/Edge, which also provide the native Save As
dialog and the "Load System Fonts" button. Other modern browsers should run
the editor itself (canvas + plain JavaScript) but fall back to a normal
download for saving.

## Credits

The NTSC, PAL and SECAM palette RGB values come from the
[Stella](https://stella-emu.github.io/) emulator's palette tables.

## License

[MIT](LICENSE). Use it, change it, share it.
