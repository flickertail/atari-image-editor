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
        this.resize();
    }

    get cellW() {
        return this.cellH * 2;
    }

    resize() {
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
        this.cellH = Math.max(1, cellH);
        this.resize();
    }

    // Screen (canvas-relative) coords -> pixel coords, or null if outside.
    pixelAt(offsetX, offsetY) {
        const x = Math.floor(offsetX / this.cellW);
        const y = Math.floor(offsetY / this.cellH);
        if (x < 0 || y < 0 || x >= Doc.widthPx(this.doc) || y >= this.doc.heightRows) return null;
        return { x, y };
    }

    draw() {
        const { ctx, doc, cellW, cellH } = this;
        const widthPx = Doc.widthPx(doc);
        ctx.imageSmoothingEnabled = false;

        for (let y = 0; y < doc.heightRows; y++) {
            for (let x = 0; x < widthPx; x++) {
                const isBg = Doc.compositeIsBackground(doc, x, y);
                if (isBg) {
                    const checker = ((x >> 2) + (y >> 2)) & 1;
                    ctx.fillStyle = CheckerColors[checker];
                } else {
                    const colorByte = Doc.compositePixel(doc, x, y);
                    ctx.fillStyle = Palette.cssForByte(colorByte);
                }
                ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
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
