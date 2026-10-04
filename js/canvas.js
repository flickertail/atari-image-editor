// Grid rendering. An Atari 2600 scanline pixel is roughly twice as wide as
// it is tall on a real TV, so every editor cell is drawn 2:1 (width:height)
// to preview true proportions - `cellH` is the only zoom knob, `cellW` is
// always 2*cellH.
const CheckerColors = ["#3a3a3a", "#2e2e2e"];

class GridCanvas {
    constructor(canvasEl, doc) {
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext("2d");
        this.doc = doc;
        this.cellH = 8;
        this.showGroupLines = true;
        this.showRowLines = false;
        this.showBlockLines = false;   // 4-pixel playfield blocks (while a playfield layer is active)
        this.resize();
    }

    get cellW() {
        return this.cellH * 2;
    }

    // Browsers can't make a canvas much over 32767 px in either direction, so
    // a big (world-sized) canvas caps the zoom.
    maxCellH() {
        return Math.max(1, Math.min(
            Math.floor(32000 / (Doc.widthPx(this.doc) * 2)),
            Math.floor(32000 / this.doc.heightRows)));
    }

    resize() {
        this.cellH = Math.min(this.cellH, this.maxCellH());
        const w = Doc.widthPx(this.doc) * this.cellW;
        const h = this.doc.heightRows * this.cellH;
        this.canvas.width = w;
        this.canvas.height = h;
    }

    setDoc(doc) {
        this.doc = doc;
        this.resize();
    }

    setZoom(cellH) {
        this.cellH = Math.max(1, Math.min(cellH, this.maxCellH()));
        this.resize();
    }

    // Screen (canvas-relative) coords -> pixel coords, or null if outside.
    pixelAt(offsetX, offsetY) {
        const x = Math.floor(offsetX / this.cellW);
        const y = Math.floor(offsetY / this.cellH);
        if (x < 0 || y < 0 || x >= Doc.widthPx(this.doc) || y >= this.doc.heightRows) return null;
        return { x, y };
    }

    // Builds the composite at 1 canvas pixel per Atari pixel in an offscreen
    // ImageData (bottom layer first, so the top-most visible layer wins each
    // pixel), then scales it up in one drawImage - far faster than a
    // fillRect per pixel on big (world-sized) canvases.
    draw() {
        const { ctx, doc, cellW, cellH } = this;
        const widthPx = Doc.widthPx(doc), H = doc.heightRows;
        if (!this.off || this.off.width !== widthPx || this.off.height !== H) {
            this.off = document.createElement("canvas");
            this.off.width = widthPx;
            this.off.height = H;
            this.offCtx = this.off.getContext("2d");
        }
        const img = this.offCtx.createImageData(widthPx, H);
        const px = new Uint32Array(img.data.buffer);   // little-endian: 0xAABBGGRR
        const abgr = (rgb) => (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0;
        const colorCache = new Map();
        const colorOf = (byte) => {
            let c = colorCache.get(byte);
            if (c === undefined) { c = abgr(Palette.rgbForByte(byte)); colorCache.set(byte, c); }
            return c;
        };
        const checker = CheckerColors.map((css) => abgr(parseInt(css.slice(1), 16)));
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < widthPx; x++) px[y * widthPx + x] = checker[((x >> 2) + (y >> 2)) & 1];
        }

        for (const layer of doc.layers) {
            if (!layer.visible) continue;
            if (PF.isPlayfield(layer)) {
                const blocks = Math.ceil(widthPx / 4);
                for (let y = 0; y < H; y++) {
                    for (let bx = 0; bx < blocks; bx++) {
                        const si = PF.storedIndex(layer, bx);
                        if (si < 0 || !layer.blocks[y * layer.blocksW + si]) continue;
                        for (let k = 0; k < 4; k++) {
                            const x = bx * 4 + k;
                            if (x >= widthPx) break;
                            const region = layer.size === "world" ? 0 : PF.previewRegion(layer, x);
                            px[y * widthPx + x] = colorOf(layer.colors[y * 6 + region]);
                        }
                    }
                }
            } else {
                const W = doc.widthBytes;
                for (let y = 0; y < H; y++) {
                    for (let g = 0; g < W; g++) {
                        const mask = layer.maskGrid[y * W + g];
                        if (!mask) continue;
                        const c = colorOf(layer.colorGrid[y * W + g]);
                        for (let bit = 0; bit < 8; bit++) if (mask & (0x80 >> bit)) px[y * widthPx + g * 8 + bit] = c;
                    }
                }
            }
        }
        this.offCtx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.off, 0, 0, widthPx * cellW, H * cellH);

        if (this.showBlockLines) {
            ctx.strokeStyle = "rgba(255,255,255,0.07)";
            ctx.lineWidth = 1;
            for (let b = 0; b <= widthPx / 4; b++) {
                if (this.showGroupLines && (b & 1) === 0) continue;   // group lines already cover every other one
                const px = b * 4 * cellW + 0.5;
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, doc.heightRows * cellH);
                ctx.stroke();
            }
        }

        if (this.showGroupLines) {
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
            ctx.lineWidth = 1;
            for (let g = 0; g <= doc.widthBytes; g++) {
                const px = g * 8 * cellW + 0.5;
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, doc.heightRows * cellH);
                ctx.stroke();
            }
        }

        if (this.showRowLines) {
            ctx.strokeStyle = "rgba(255,255,255,0.10)";
            ctx.lineWidth = 1;
            for (let y = 0; y <= doc.heightRows; y++) {
                const py = y * cellH + 0.5;
                ctx.beginPath();
                ctx.moveTo(0, py);
                ctx.lineTo(widthPx * cellW, py);
                ctx.stroke();
            }
        }
    }
}
