// Playfield layers.
//
// The TIA playfield is 40 "blocks" across the full 160-pixel screen, so one
// block is 4 pixels wide. The left 20 blocks come from PF0 (4 bits), PF1 and
// PF2 (8 bits each); the right 20 are either the left half again (Repeat),
// the left half reversed (Mirror), or a second PF0/PF1/PF2 set written
// mid-line by the kernel (Asymmetric). A playfield layer is anchored at x 0
// and cropped to the canvas.
//
// Two sizes:
//   - "screen": exactly 40 blocks. Right half Repeat / Mirror / Asymmetric;
//     color per Row (one COLUPF per scanline), Score (left and right halves
//     each their own color - COLUP0 / COLUP1) or Register (a color per
//     register region per scanline, written mid-line by the kernel).
//   - "world": as many blocks as the canvas is wide (canvas pixels / 4), for
//     scrolling maps bigger than the screen. Always asymmetric, one color per
//     row. It keeps a list of camera views - plain (x in blocks, y in rows)
//     points; what a view shows at run time is the programmer's choice (the
//     editor's guide frame assumes 40 blocks x 192 rows).
//
// Data per layer: `blocks` (blocksW x rows, 0/1) and `colors` (rows x 6, one
// per region, in screen order left to right). Row mode keeps all six equal,
// Score mode keeps each half's three equal, Register mode uses all six.
// Repeat/Mirror layers only use the left 20 stored blocks.

let _pfSerial = 0;

const PF = {
    SCREEN_BLOCKS: 40,
    BLOCK_PX: 4,
    GUIDE_BLOCKS: 40,
    GUIDE_ROWS: 192,

    isPlayfield(layer) {
        return layer && layer.kind === "playfield";
    },

    create(doc, name, size) {
        const blocksW = size === "world" ? doc.widthBytes * 2 : this.SCREEN_BLOCKS;
        return {
            id: _nextLayerId++,
            kind: "playfield",
            name: name || "Playfield",
            visible: true,
            size: size === "world" ? "world" : "screen",
            half: "asym",            // "repeat" | "mirror" | "asym" (screen only)
            colorMode: "row",        // "row" | "score" | "register" (screen only)
            blocksW,
            blocks: new Uint8Array(blocksW * doc.heightRows),
            colors: new Uint8Array(doc.heightRows * 6),
            views: size === "world" ? [{ name: "default", x: 0, y: 0 }] : [],
            activeView: 0,
        };
    },

    clone(layer, name) {
        return {
            id: _nextLayerId++,
            kind: "playfield",
            name: name || (layer.name + " copy"),
            visible: layer.visible,
            size: layer.size,
            half: layer.half,
            colorMode: layer.colorMode,
            blocksW: layer.blocksW,
            blocks: layer.blocks.slice(),
            colors: layer.colors.slice(),
            views: layer.views.map((v) => ({ name: v.name, x: v.x, y: v.y })),
            activeView: layer.activeView,
        };
    },

    // Same layer, same id (undo snapshots).
    snapshot(layer) {
        const c = this.clone(layer, layer.name);
        c.id = layer.id;
        return c;
    },

    // The colour unit (0-5, screen order) a stored block's colour lives in.
    // Region boundaries are where each register's bits are SHOWN on screen.
    regionOfScreenX(layer, x) {
        if (x < 16) return 0;
        if (x < 48) return 1;
        if (x < 80) return 2;
        if (layer.half === "mirror") return x < 112 ? 3 : (x < 144 ? 4 : 5);   // PF2, PF1, PF0 reversed
        return x < 96 ? 3 : (x < 128 ? 4 : 5);
    },

    // Register mode, preview only: a COLUPF write takes effect on a 3-pixel
    // grid (one CPU cycle = 3 color clocks; HBLANK is 68, so the possible
    // switch points are x = 3c - 68, i.e. x % 3 == 1). A switch meant for
    // boundary B lands at the first such point at or after it, so the new
    // region's first 1-2 pixels still show the old color - which is what the
    // TV shows. Only x 16 and x 112 (Mirror) are exact.
    landedBoundaries(layer) {
        const b = layer.half === "mirror" ? [16, 48, 80, 112, 144] : [16, 48, 80, 96, 128];
        return b.map((x) => x + ((1 - (x % 3)) + 3) % 3);
    },

    previewRegion(layer, x) {
        if (layer.colorMode !== "register") return this.regionOfScreenX(layer, x);
        const b = this.landedBoundaries(layer);
        let r = 0;
        while (r < 5 && x >= b[r]) r++;
        return r;
    },

    // Display block (0..) -> stored block index, or -1 if none.
    storedIndex(layer, bx) {
        if (bx < 0 || bx >= layer.blocksW) return -1;
        if (layer.size === "world" || layer.half === "asym" || bx < 20) return bx;
        return layer.half === "repeat" ? bx - 20 : 39 - bx;
    },

    getPixel(layer, x, y, exactColor) {
        const bx = x >> 2;
        const si = this.storedIndex(layer, bx);
        if (si < 0 || y < 0 || y * 6 >= layer.colors.length) return { on: false, colorByte: 0, group: bx };
        const on = layer.blocks[y * layer.blocksW + si] !== 0;
        const region = layer.size === "world" ? 0 : (exactColor ? this.regionOfScreenX(layer, x) : this.previewRegion(layer, x));
        return { on, colorByte: layer.colors[y * 6 + region], group: bx };
    },

    setPixel(layer, x, y, colorByte) {
        const bx = x >> 2;
        const si = this.storedIndex(layer, bx);
        if (si < 0 || y < 0 || y * 6 >= layer.colors.length) return;
        layer.blocks[y * layer.blocksW + si] = 1;
        const row = y * 6;
        if (layer.size === "world" || layer.colorMode === "row") {
            for (let k = 0; k < 6; k++) layer.colors[row + k] = colorByte;
        } else if (layer.colorMode === "score") {
            const first = bx < 20 ? 0 : 3;
            for (let k = first; k < first + 3; k++) layer.colors[row + k] = colorByte;
        } else {
            layer.colors[row + this.regionOfScreenX(layer, bx * 4)] = colorByte;
        }
    },

    clearPixel(layer, x, y) {
        const si = this.storedIndex(layer, x >> 2);
        if (si < 0 || y < 0 || y * 6 >= layer.colors.length) return;
        layer.blocks[y * layer.blocksW + si] = 0;
    },

    // Moves the content by whole blocks (dxPixels rounded to the nearest
    // block - the playfield can't move by less) and whole rows, from an
    // unshifted snapshot (like Doc.shiftLayerFrom).
    shiftFrom(layer, srcBlocks, srcColors, dxPixels, dyRows) {
        const W = layer.blocksW, H = srcColors.length / 6;
        const dx = Math.round(dxPixels / this.BLOCK_PX);
        const blocks = new Uint8Array(W * H), colors = new Uint8Array(H * 6);
        for (let y = 0; y < H; y++) {
            const sy = y - dyRows;
            if (sy < 0 || sy >= H) continue;
            for (let k = 0; k < 6; k++) colors[y * 6 + k] = srcColors[sy * 6 + k];
            for (let x = 0; x < W; x++) {
                const sx = x - dx;
                if (sx >= 0 && sx < W) blocks[y * W + x] = srcBlocks[sy * W + sx];
            }
        }
        layer.blocks = blocks;
        layer.colors = colors;
    },

    // Copies `src`'s lit blocks (and their rows' colours) onto `dst`; both
    // playfield layers of the same size. Returns how many blocks were stamped.
    stampOnto(src, dst) {
        if (src.size !== dst.size || src.blocksW !== dst.blocksW) return 0;
        const W = src.blocksW, H = src.colors.length / 6;
        let n = 0;
        for (let y = 0; y < H; y++) {
            let rowUsed = false;
            for (let x = 0; x < W; x++) {
                if (!src.blocks[y * W + x]) continue;
                dst.blocks[y * W + x] = 1;
                rowUsed = true;
                n++;
            }
            if (rowUsed) for (let k = 0; k < 6; k++) dst.colors[y * 6 + k] = src.colors[y * 6 + k];
        }
        return n;
    },

    // Canvas resize: world layers follow the canvas width; all follow its height.
    resize(layer, widthBytes, heightRows) {
        const oldW = layer.blocksW, oldH = layer.colors.length / 6;
        const W = layer.size === "world" ? widthBytes * 2 : this.SCREEN_BLOCKS;
        const blocks = new Uint8Array(W * heightRows), colors = new Uint8Array(heightRows * 6);
        for (let y = 0; y < Math.min(oldH, heightRows); y++) {
            for (let k = 0; k < 6; k++) colors[y * 6 + k] = layer.colors[y * 6 + k];
            for (let x = 0; x < Math.min(oldW, W); x++) blocks[y * W + x] = layer.blocks[y * oldW + x];
        }
        layer.blocksW = W;
        layer.blocks = blocks;
        layer.colors = colors;
    },

    // Screen <-> World. Blocks that fit are kept; a world layer is always
    // asymmetric with one colour per row, so those settings are reset.
    setSize(doc, layer, size) {
        if (layer.size === size) return;
        // Repeat/Mirror right halves are generated - make them real blocks first.
        if (layer.size === "screen" && layer.half !== "asym") {
            const H = doc.heightRows;
            for (let y = 0; y < H; y++)
                for (let bx = 20; bx < 40; bx++)
                    layer.blocks[y * 40 + bx] = layer.blocks[y * 40 + this.storedIndex(layer, bx)];
        }
        layer.size = size;
        layer.half = "asym";
        if (size === "world") {
            layer.colorMode = "row";
            for (let y = 0; y < doc.heightRows; y++)
                for (let k = 1; k < 6; k++) layer.colors[y * 6 + k] = layer.colors[y * 6];
            if (!layer.views.length) layer.views = [{ name: "default", x: 0, y: 0 }];
            layer.activeView = 0;
        }
        this.resize(layer, doc.widthBytes, doc.heightRows);
    },

    toPlain(layer) {
        return {
            kind: "playfield",
            name: layer.name,
            visible: layer.visible,
            size: layer.size,
            half: layer.half,
            colorMode: layer.colorMode,
            blocksW: layer.blocksW,
            blocks: Array.from(layer.blocks),
            colors: Array.from(layer.colors),
            views: layer.views.map((v) => ({ name: v.name, x: v.x, y: v.y })),
            activeView: layer.activeView,
        };
    },

    fromPlain(l) {
        return {
            id: _nextLayerId++,
            kind: "playfield",
            name: l.name || "Playfield",
            visible: l.visible !== false,
            size: l.size === "world" ? "world" : "screen",
            half: ["repeat", "mirror", "asym"].includes(l.half) ? l.half : "asym",
            colorMode: ["row", "score", "register"].includes(l.colorMode) ? l.colorMode : "row",
            blocksW: l.blocksW,
            blocks: Uint8Array.from(l.blocks),
            colors: Uint8Array.from(l.colors),
            views: Array.isArray(l.views) ? l.views.map((v) => ({ name: String(v.name || "view"), x: v.x | 0, y: v.y | 0 })) : [],
            activeView: l.activeView | 0,
        };
    },

    // Validation for project files: an error message, or null.
    check(l, w, h, i) {
        const blocksW = l.size === "world" ? w * 2 : this.SCREEN_BLOCKS;
        if (l.blocksW !== blocksW || !Array.isArray(l.blocks) || !Array.isArray(l.colors) ||
            l.blocks.length !== blocksW * h || l.colors.length !== h * 6) {
            return `Playfield layer ${i + 1} ("${l.name}") has damaged data.`;
        }
        return null;
    },

    // A playfield layer from ANOTHER project, cropped/fitted to `doc`.
    importForeign(doc, plain, srcHeightRows) {
        const src = this.fromPlain(plain);
        const layer = this.create(doc, src.name, src.size);
        layer.visible = src.visible;
        layer.half = src.half;
        layer.colorMode = src.colorMode;
        layer.views = src.views.length ? src.views : layer.views;
        layer.activeView = Math.min(src.activeView, Math.max(0, layer.views.length - 1));
        const rows = Math.min(srcHeightRows, doc.heightRows), cols = Math.min(src.blocksW, layer.blocksW);
        for (let y = 0; y < rows; y++) {
            for (let k = 0; k < 6; k++) layer.colors[y * 6 + k] = src.colors[y * 6 + k];
            for (let x = 0; x < cols; x++) layer.blocks[y * layer.blocksW + x] = src.blocks[y * src.blocksW + x];
        }
        return layer;
    },

    // ---- export ------------------------------------------------------------
    // Register bits: PF0 shows blocks 0-3 from bits 4-7; PF1 blocks 4-11 from
    // bits 7-0; PF2 blocks 12-19 from bits 0-7. `base` is 0 (left set) or 20
    // (an asymmetric layer's right set, written mid-line).
    registers(layer, y, base) {
        const b = (i) => layer.blocks[y * layer.blocksW + base + i] ? 1 : 0;
        let pf0 = 0, pf1 = 0, pf2 = 0;
        for (let i = 0; i < 4; i++) pf0 |= b(i) << (4 + i);
        for (let i = 0; i < 8; i++) pf1 |= b(4 + i) << (7 - i);
        for (let i = 0; i < 8; i++) pf2 |= b(12 + i) << i;
        return [pf0, pf1, pf2];
    },
};
