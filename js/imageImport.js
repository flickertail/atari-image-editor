// Converts an arbitrary source image into a new layer.
//
// Each 8-pixel group/row cell can only carry ONE Atari color (the hardware
// constraint from layers.js), so a photo is reduced to: one representative
// ink color per cell, plus a dithered on/off mask that reproduces
// brightness detail within the cell by density of "on" pixels (the ink
// color) against a background - the same idea as classic 1-bit image
// dithering, just with the ink color re-picked fresh for every 8-pixel
// group instead of being fixed for the whole image.
const ImageImport = {
    // Draws `img` into an offscreen canvas sized to the document's TRUE
    // physical proportions (each Atari pixel is ~2:1 wide:tall, so the
    // working canvas is widthPx*2 wide) using the given fit mode, so the
    // later horizontal-pair-averaging step undoes the doubling correctly
    // and the final image looks right on a real TV, not squashed.
    _drawFitted(img, dstW, dstH, fitMode) {
        const off = document.createElement("canvas");
        off.width = dstW;
        off.height = dstH;
        const ctx = off.getContext("2d");
        ctx.imageSmoothingEnabled = true;

        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;

        if (fitMode === "stretch") {
            ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
            return off;
        }

        const srcAspect = srcW / srcH;
        const dstAspect = dstW / dstH;
        let sx = 0, sy = 0, sw = srcW, sh = srcH;
        let dx = 0, dy = 0, dw = dstW, dh = dstH;

        if (fitMode === "fill") { // cover: crop source to match dst aspect
            if (srcAspect > dstAspect) {
                sw = Math.round(srcH * dstAspect);
                sx = Math.round((srcW - sw) / 2);
            } else {
                sh = Math.round(srcW / dstAspect);
                sy = Math.round((srcH - sh) / 2);
            }
        } else { // "fit": letterbox, source shown in full
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, dstW, dstH);
            if (srcAspect > dstAspect) {
                dh = Math.round(dstW / srcAspect);
                dy = Math.round((dstH - dh) / 2);
            } else {
                dw = Math.round(dstH * srcAspect);
                dx = Math.round((dstW - dw) / 2);
            }
        }
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        return off;
    },

    // Returns a Float32Array[widthPx*heightRows] of luma values and a
    // parallel array of packed RGB ints, both at final (non-doubled)
    // pixel resolution, by averaging each horizontal pair of columns from
    // the doubled-width working canvas.
    _sampleGrid(img, widthPx, heightRows, fitMode) {
        const working = this._drawFitted(img, widthPx * 2, heightRows, fitMode);
        const ctx = working.getContext("2d");
        const data = ctx.getImageData(0, 0, widthPx * 2, heightRows).data;

        const rgb = new Int32Array(widthPx * heightRows);
        const luma = new Float32Array(widthPx * heightRows);
        for (let y = 0; y < heightRows; y++) {
            for (let x = 0; x < widthPx; x++) {
                const i0 = (y * widthPx * 2 + x * 2) * 4;
                const i1 = i0 + 4;
                const r = (data[i0] + data[i1]) / 2;
                const g = (data[i0 + 1] + data[i1 + 1]) / 2;
                const b = (data[i0 + 2] + data[i1 + 2]) / 2;
                const idx = y * widthPx + x;
                rgb[idx] = (r << 16) | (g << 8) | b;
                luma[idx] = Palette.luma(r, g, b);
            }
        }
        return { rgb, luma };
    },

    // Builds colorGrid/maskGrid (doc.widthBytes x doc.heightRows layout,
    // same as a layer's own grids) from `img`.
    convert(img, doc, options) {
        const opts = Object.assign({ fitMode: "stretch", dither: true }, options);
        const widthPx = Doc.widthPx(doc);
        const { rgb, luma } = this._sampleGrid(img, widthPx, doc.heightRows, opts.fitMode);

        const colorGrid = new Uint8Array(doc.widthBytes * doc.heightRows);
        const maskGrid = new Uint8Array(doc.widthBytes * doc.heightRows);

        // Pass 1: one ink color per (row, group) cell - the average color
        // of its 8 source pixels, quantized to the nearest Atari entry.
        const inkLuma = new Float32Array(doc.widthBytes * doc.heightRows);
        for (let y = 0; y < doc.heightRows; y++) {
            for (let g = 0; g < doc.widthBytes; g++) {
                let rs = 0, gs = 0, bs = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = g * 8 + bit;
                    const v = rgb[y * widthPx + x];
                    rs += (v >> 16) & 0xff;
                    gs += (v >> 8) & 0xff;
                    bs += v & 0xff;
                }
                const avgR = rs / 8, avgG = gs / 8, avgB = bs / 8;
                const cellIdx = y * doc.widthBytes + g;
                const colorByte = Palette.nearestByte(avgR, avgG, avgB);
                colorGrid[cellIdx] = colorByte;
                inkLuma[cellIdx] = Palette.luma(...this._rgbOfByte(colorByte));
            }
        }

        // Pass 2: per-pixel on/off mask. Error-diffusion dithering (Floyd-
        // Steinberg) against a threshold halfway between the cell's ink
        // luma and an assumed-black background, so brightness variation
        // within a cell still reads as texture instead of a flat blob.
        const errW = new Float32Array(widthPx);
        const errH = new Float32Array(widthPx); // next row's carried error
        for (let y = 0; y < doc.heightRows; y++) {
            errH.fill(0);
            for (let x = 0; x < widthPx; x++) {
                const g = x >> 3;
                const cellIdx = y * doc.widthBytes + g;
                const bit = 7 - (x & 7);
                // A cell whose derived ink color is itself black has
                // nothing to show - without this, `value >= threshold`
                // degenerates to `0 >= 0` (true) and marks a uniformly
                // dark cell's pixels ALL "on", painting solid black
                // background as if it were filled ink.
                if (inkLuma[cellIdx] === 0) continue;
                const threshold = inkLuma[cellIdx] / 2;
                let value = luma[y * widthPx + x];
                if (opts.dither) value += errW[x];
                const on = value >= threshold;
                if (on) maskGrid[cellIdx] |= (1 << bit);
                if (opts.dither) {
                    const actual = on ? inkLuma[cellIdx] : 0;
                    const err = value - actual;
                    if (x + 1 < widthPx) errW[x + 1] += err * 7 / 16;
                    if (x > 0) errH[x - 1] += err * 3 / 16;
                    errH[x] += err * 5 / 16;
                    if (x + 1 < widthPx) errH[x + 1] += err * 1 / 16;
                }
            }
            errW.set(errH);
        }

        return { colorGrid, maskGrid };
    },

    // Line-art import: for a genuinely 2-color source (pixel art, not a
    // photo) - no resizing/blending of any kind, so edges stay crisp.
    //   - Horizontal: 1 source pixel = 1 destination column, always.
    //   - Vertical: 1 source row = 1 or 2 destination scanlines
    //     (`rowScale`), a plain repeat - not interpolation - so a square-
    //     pixel source can be doubled to read right on the real 2:1
    //     Atari pixel without blurring anything.
    //   - Color: ONE ink color for the whole layer - the nearest Atari
    //     palette entry to the source's lightest pixel. The image's
    //     darker color is treated as background and never imported; the
    //     split point is the midpoint between the darkest and lightest
    //     luma actually present, so it works for any 2-color pair, not
    //     just pure black/white.
    //   - Placement: top-left at (0,0), clipped to the canvas - reposition
    //     afterward with the Move tool.
    convertLineArt(img, doc, options) {
        const opts = Object.assign({ rowScale: 1 }, options);
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;

        const off = document.createElement("canvas");
        off.width = srcW;
        off.height = srcH;
        const ctx = off.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, srcW, srcH).data;

        const lumaAt = new Float32Array(srcW * srcH);
        let minLuma = Infinity, maxLuma = -Infinity;
        let lightR = 255, lightG = 255, lightB = 255;
        for (let i = 0; i < srcW * srcH; i++) {
            const o = i * 4;
            const l = Palette.luma(data[o], data[o + 1], data[o + 2]);
            lumaAt[i] = l;
            if (l < minLuma) minLuma = l;
            if (l > maxLuma) { maxLuma = l; lightR = data[o]; lightG = data[o + 1]; lightB = data[o + 2]; }
        }
        const threshold = (minLuma + maxLuma) / 2;
        const inkColorByte = Palette.nearestByte(lightR, lightG, lightB);

        const widthPx = Doc.widthPx(doc);
        const heightRows = doc.heightRows;
        const colorGrid = new Uint8Array(doc.widthBytes * heightRows);
        const maskGrid = new Uint8Array(doc.widthBytes * heightRows);

        const rowScale = opts.rowScale === 2 ? 2 : 1;
        for (let sy = 0; sy < srcH; sy++) {
            for (let rep = 0; rep < rowScale; rep++) {
                const dy = sy * rowScale + rep;
                if (dy >= heightRows) break;
                for (let sx = 0; sx < srcW && sx < widthPx; sx++) {
                    if (lumaAt[sy * srcW + sx] <= threshold) continue; // the darker color - background
                    const g = sx >> 3, bit = 7 - (sx & 7);
                    const idx = dy * doc.widthBytes + g;
                    maskGrid[idx] |= (1 << bit);
                    colorGrid[idx] = inkColorByte;
                }
            }
        }
        return { colorGrid, maskGrid, inkColorByte };
    },

    _rgbOfByte(byteValue) {
        const v = Palette.rgbForByte(byteValue);
        return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
    },

    // Loads a File into an HTMLImageElement (Promise).
    loadFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            img.src = url;
        });
    },
};
