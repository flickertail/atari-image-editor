// Document/layer data model.
//
// Hardware shape (confirmed with the user): for a document `widthBytes` (G)
// byte-groups wide (each group = 8 real pixels) and `heightRows` (H)
// scanlines tall, each layer independently stores, per (row, group):
//   - one color byte (the group's single Atari color for that scanline)
//   - one mask byte (bit7..bit0 = leftmost..rightmost of the 8 pixels,
//     1 = show the group's color, 0 = transparent/see-through)
// This mirrors what a bus-stuffed ELF-VCS kernel can actually produce: a
// fresh COLUPx + GRPx pair per 8-pixel group, every scanline. A layer maps
// to one such bitmap object; multiple layers preview-stack like multiple
// simultaneous TIA objects, but each layer's own data is independently
// valid hardware data - there is no cross-layer "one color per group" rule.

let _nextLayerId = 1;

function createLayer(widthBytes, heightRows, name) {
    return {
        id: _nextLayerId++,
        name: name || "Layer",
        visible: true,
        colorGrid: new Uint8Array(widthBytes * heightRows),
        maskGrid: new Uint8Array(widthBytes * heightRows),
    };
}

function cloneLayer(layer, name) {
    return {
        id: _nextLayerId++,
        name: name || (layer.name + " copy"),
        visible: layer.visible,
        colorGrid: layer.colorGrid.slice(),
        maskGrid: layer.maskGrid.slice(),
    };
}

function resizeLayer(layer, widthBytes, heightRows, oldWidthBytes, oldHeightRows) {
    const color = new Uint8Array(widthBytes * heightRows);
    const mask = new Uint8Array(widthBytes * heightRows);
    const copyRows = Math.min(heightRows, oldHeightRows);
    const copyCols = Math.min(widthBytes, oldWidthBytes);
    for (let row = 0; row < copyRows; row++) {
        for (let g = 0; g < copyCols; g++) {
            const srcIdx = row * oldWidthBytes + g;
            const dstIdx = row * widthBytes + g;
            color[dstIdx] = layer.colorGrid[srcIdx];
            mask[dstIdx] = layer.maskGrid[srcIdx];
        }
    }
    layer.colorGrid = color;
    layer.maskGrid = mask;
}

function createDocument(widthBytes, heightRows) {
    return {
        widthBytes,
        heightRows,
        bgColorByte: 0x00, // preview-only; not exported (COLUBK lives in the kernel)
        layers: [createLayer(widthBytes, heightRows, "Layer 1")],
        activeLayerIndex: 0,
    };
}

const Doc = {
    widthPx(doc) {
        return doc.widthBytes * 8;
    },

    activeLayer(doc) {
        return doc.layers[doc.activeLayerIndex];
    },

    addLayer(doc, name) {
        const layer = createLayer(doc.widthBytes, doc.heightRows, name);
        doc.layers.push(layer);
        doc.activeLayerIndex = doc.layers.length - 1;
        return layer;
    },

    duplicateLayer(doc, index) {
        const copy = cloneLayer(doc.layers[index]);
        doc.layers.splice(index + 1, 0, copy);
        doc.activeLayerIndex = index + 1;
        return copy;
    },

    removeLayer(doc, index) {
        if (doc.layers.length <= 1) return;
        doc.layers.splice(index, 1);
        doc.activeLayerIndex = Math.min(doc.activeLayerIndex, doc.layers.length - 1);
    },

    moveLayer(doc, index, dir) {
        const target = index + dir;
        if (target < 0 || target >= doc.layers.length) return;
        const [layer] = doc.layers.splice(index, 1);
        doc.layers.splice(target, 0, layer);
        doc.activeLayerIndex = target;
    },

    resizeDocument(doc, widthBytes, heightRows) {
        for (const layer of doc.layers) {
            resizeLayer(layer, widthBytes, heightRows, doc.widthBytes, doc.heightRows);
        }
        doc.widthBytes = widthBytes;
        doc.heightRows = heightRows;
    },

    // Sets pixel (x,y) on `layer` to `colorByte`, turning it on. Setting a
    // pixel's color re-colors the WHOLE 8-pixel group it lives in for that
    // scanline (every other pixel in the group, on or off, shares one
    // color byte - that's the real hardware constraint, not an
    // implementation shortcut).
    setPixel(doc, layer, x, y, colorByte) {
        if (x < 0 || y < 0 || x >= this.widthPx(doc) || y >= doc.heightRows) return;
        const g = x >> 3;
        const bit = 7 - (x & 7);
        const idx = y * doc.widthBytes + g;
        layer.colorGrid[idx] = colorByte;
        layer.maskGrid[idx] |= (1 << bit);
    },

    clearPixel(doc, layer, x, y) {
        if (x < 0 || y < 0 || x >= this.widthPx(doc) || y >= doc.heightRows) return;
        const g = x >> 3;
        const bit = 7 - (x & 7);
        const idx = y * doc.widthBytes + g;
        layer.maskGrid[idx] &= ~(1 << bit);
    },

    // Returns { on, colorByte, group } for pixel (x,y) on `layer`.
    getPixel(doc, layer, x, y) {
        const g = x >> 3;
        const bit = 7 - (x & 7);
        const idx = y * doc.widthBytes + g;
        return {
            on: (layer.maskGrid[idx] & (1 << bit)) !== 0,
            colorByte: layer.colorGrid[idx],
            group: g,
        };
    },

    // Sets an entire group's color byte directly (used by fill/eyedropper
    // and by import/text tools writing whole groups at once).
    setGroupColor(doc, layer, group, y, colorByte) {
        layer.colorGrid[y * doc.widthBytes + group] = colorByte;
    },

    // Top-most visible layer wins per pixel; falls back to doc.bgColorByte
    // for preview only.
    compositePixel(doc, x, y) {
        for (let i = doc.layers.length - 1; i >= 0; i--) {
            const layer = doc.layers[i];
            if (!layer.visible) continue;
            const p = this.getPixel(doc, layer, x, y);
            if (p.on) return p.colorByte;
        }
        return doc.bgColorByte;
    },

    compositeIsBackground(doc, x, y) {
        for (let i = doc.layers.length - 1; i >= 0; i--) {
            const layer = doc.layers[i];
            if (!layer.visible) continue;
            if (this.getPixel(doc, layer, x, y).on) return false;
        }
        return true;
    },

    // Shifts a layer's whole content by (dxPixels, dyRows) - full 1px
    // accuracy in both directions, reading from `srcColorGrid`/
    // `srcMaskGrid` (so a live drag can re-derive the result fresh from an
    // unshifted snapshot on every mousemove instead of compounding
    // rounding error).
    //
    // A group's color is a single byte, so a destination group CAN end up
    // receiving "on" pixels that came from two differently-colored source
    // groups (e.g. shifting a multi-color shaded layer, like the apple's
    // light/mid/dark bands, by a few px). That's only possible when the
    // layer actually uses more than one color - a uniform-color layer
    // (any text layer, since TextTool.stamp always writes one ink color)
    // never hits it, so it always gets exact, lossless 1px movement. When
    // it IS possible, the destination group takes whichever source color
    // contributed the most "on" pixels - a deterministic best effort
    // rather than a hard block or a silent color pick.
    shiftLayerFrom(doc, layer, srcColorGrid, srcMaskGrid, dxPixels, dyRows) {
        const W = doc.widthBytes, H = doc.heightRows, widthPx = W * 8;

        // Expand to a per-real-pixel (on, color) map so the shift itself
        // can move by any pixel amount, not just whole groups.
        const srcOn = new Uint8Array(widthPx * H);
        const srcColor = new Uint8Array(widthPx * H);
        for (let y = 0; y < H; y++) {
            for (let g = 0; g < W; g++) {
                const idx = y * W + g;
                const mask = srcMaskGrid[idx], color = srcColorGrid[idx];
                if (mask === 0) continue;
                for (let bit = 0; bit < 8; bit++) {
                    if (!(mask & (1 << (7 - bit)))) continue;
                    const px = y * widthPx + (g * 8 + bit);
                    srcOn[px] = 1;
                    srcColor[px] = color;
                }
            }
        }

        const dstOn = new Uint8Array(widthPx * H);
        const dstColor = new Uint8Array(widthPx * H);
        for (let y = 0; y < H; y++) {
            const srcY = y - dyRows;
            if (srcY < 0 || srcY >= H) continue;
            for (let x = 0; x < widthPx; x++) {
                const srcX = x - dxPixels;
                if (srcX < 0 || srcX >= widthPx) continue;
                const srcIdx = srcY * widthPx + srcX;
                if (!srcOn[srcIdx]) continue;
                const dstIdx = y * widthPx + x;
                dstOn[dstIdx] = 1;
                dstColor[dstIdx] = srcColor[srcIdx];
            }
        }

        // Collapse back down to one color+mask byte per (row, group),
        // majority-voting the color when a group's "on" pixels disagree.
        const newColor = new Uint8Array(W * H);
        const newMask = new Uint8Array(W * H);
        const votes = new Map();
        for (let y = 0; y < H; y++) {
            for (let g = 0; g < W; g++) {
                votes.clear();
                let mask = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = g * 8 + bit;
                    const idx = y * widthPx + x;
                    if (!dstOn[idx]) continue;
                    mask |= (1 << (7 - bit));
                    const c = dstColor[idx];
                    votes.set(c, (votes.get(c) || 0) + 1);
                }
                if (mask === 0) continue;
                let bestColor = 0, bestCount = -1;
                for (const [c, count] of votes) {
                    if (count > bestCount) { bestCount = count; bestColor = c; }
                }
                const dstIdx = y * W + g;
                newColor[dstIdx] = bestColor;
                newMask[dstIdx] = mask;
            }
        }
        layer.colorGrid = newColor;
        layer.maskGrid = newMask;
    },

    // Stamps `src` onto `dst`: for every (row, group) cell where `src` has
    // any pixel on, `dst`'s color byte AND mask byte for that cell are
    // replaced outright by src's. Replaced, not merged - a group only holds
    // one color, so OR-ing masks would silently recolor whatever dst
    // already had in that group. Cells where src's mask is 0 are skipped
    // entirely (even if src has a leftover color byte there, e.g. from an
    // erased pixel), so blank parts of a small tile layer never wipe
    // dst. `src` itself is left untouched so the tile can be moved and
    // stamped again. Returns how many cells were stamped.
    stampLayerOnto(src, dst) {
        let stamped = 0;
        for (let i = 0; i < src.maskGrid.length; i++) {
            if (src.maskGrid[i] === 0) continue;
            dst.colorGrid[i] = src.colorGrid[i];
            dst.maskGrid[i] = src.maskGrid[i];
            stamped++;
        }
        return stamped;
    },

    // Whole-layer clears, for the canvas right-click menu. "Colors" and
    // "Geometry" (the mask) are cleared independently since they're
    // independent hardware data per the layer model above.
    clearLayerAll(layer) {
        layer.colorGrid.fill(0);
        layer.maskGrid.fill(0);
    },

    clearLayerColors(layer) {
        layer.colorGrid.fill(0);
    },

    clearLayerGeometry(layer) {
        layer.maskGrid.fill(0);
    },

    // Plain-JSON-serializable form of a document, for Save/Load Project
    // (round-tripping the actual editor state, as opposed to Export C
    // which is a one-way dump for use in a kernel).
    toPlainObject(doc) {
        return {
            widthBytes: doc.widthBytes,
            heightRows: doc.heightRows,
            bgColorByte: doc.bgColorByte,
            activeLayerIndex: doc.activeLayerIndex,
            layers: doc.layers.map((layer) => ({
                name: layer.name,
                visible: layer.visible,
                colorGrid: Array.from(layer.colorGrid),
                maskGrid: Array.from(layer.maskGrid),
            })),
        };
    },

    fromPlainObject(data) {
        return {
            widthBytes: data.widthBytes,
            heightRows: data.heightRows,
            bgColorByte: data.bgColorByte || 0,
            activeLayerIndex: data.activeLayerIndex || 0,
            layers: data.layers.map((l) => ({
                id: _nextLayerId++,
                name: l.name,
                visible: l.visible !== false,
                colorGrid: Uint8Array.from(l.colorGrid),
                maskGrid: Uint8Array.from(l.maskGrid),
            })),
        };
    },

    // Validates parsed project JSON (the format Save Project writes) before
    // anything is imported from it. Returns an error message, or null if OK.
    checkProjectData(data) {
        if (!data || typeof data !== "object") return "This isn't a project file.";
        const { widthBytes: w, heightRows: h, layers } = data;
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 40 || h > 262) {
            return "This doesn't look like an Atari Image Editor project (missing or invalid canvas size).";
        }
        if (!Array.isArray(layers) || layers.length === 0) return "This project has no layers.";
        for (let i = 0; i < layers.length; i++) {
            const l = layers[i];
            if (!l || !Array.isArray(l.colorGrid) || !Array.isArray(l.maskGrid) ||
                l.colorGrid.length !== w * h || l.maskGrid.length !== w * h) {
                return `Layer ${i + 1} ("${l && l.name}") has damaged data.`;
            }
        }
        return null;
    },

    // Adds a copy of a layer from ANOTHER project (already validated by
    // checkProjectData) on top of `doc`'s stack. The two canvases can differ
    // in size; nothing is scaled, since the data is hardware bytes - the
    // layer is placed at the top-left, and anything outside `doc`'s canvas
    // is cropped (rows/groups `doc` doesn't have are simply left empty).
    importForeignLayer(doc, plain, srcWidthBytes, srcHeightRows) {
        const layer = createLayer(doc.widthBytes, doc.heightRows, plain.name || "Imported");
        layer.visible = plain.visible !== false;
        const rows = Math.min(srcHeightRows, doc.heightRows);
        const cols = Math.min(srcWidthBytes, doc.widthBytes);
        for (let row = 0; row < rows; row++) {
            for (let g = 0; g < cols; g++) {
                const src = row * srcWidthBytes + g;
                const dst = row * doc.widthBytes + g;
                layer.colorGrid[dst] = plain.colorGrid[src];
                layer.maskGrid[dst] = plain.maskGrid[src];
            }
        }
        doc.layers.push(layer);
        doc.activeLayerIndex = doc.layers.length - 1;
        return layer;
    },

    // Deep, independent copy of a document - used by the undo/redo history
    // stack (app.js) so later edits to `doc` can't mutate a stored snapshot.
    clone(doc) {
        return {
            widthBytes: doc.widthBytes,
            heightRows: doc.heightRows,
            bgColorByte: doc.bgColorByte,
            activeLayerIndex: doc.activeLayerIndex,
            layers: doc.layers.map((layer) => ({
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                colorGrid: layer.colorGrid.slice(),
                maskGrid: layer.maskGrid.slice(),
            })),
        };
    },
};
