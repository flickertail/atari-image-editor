// Renders a text string with a browser font into a coverage grid the app
// can stamp onto a layer. Same physical-aspect trick as imageImport.js:
// glyphs are rasterized at double horizontal resolution then pair-averaged
// down, so text doesn't come out horizontally stretched on a real 2:1
// Atari pixel.
const TextTool = {
    _customFont: null,

    async loadCustomFont(file) {
        const buf = await file.arrayBuffer();
        const font = new FontFace("AtariEditorCustomFont", buf);
        await font.load();
        document.fonts.add(font);
        this._customFont = "AtariEditorCustomFont";
        return this._customFont;
    },

    // options: { fontFamily, fontSizePx, bold, italic }
    // Returns { widthPx, heightPx, coverage: Uint8Array(widthPx*heightPx) }
    // coverage values are 0-255 alpha, at FINAL (non-doubled) pixel scale.
    render(text, options) {
        const opts = Object.assign({ fontFamily: "sans-serif", fontSizePx: 16, bold: false, italic: false }, options);
        const weight = opts.bold ? "bold " : "";
        const style = opts.italic ? "italic " : "";
        const font = `${style}${weight}${opts.fontSizePx}px "${opts.fontFamily}"`;

        // Measure first using a scratch context.
        const measure = document.createElement("canvas").getContext("2d");
        measure.font = font;
        const metrics = measure.measureText(text || " ");
        const ascent = metrics.actualBoundingBoxAscent || opts.fontSizePx * 0.8;
        const descent = metrics.actualBoundingBoxDescent || opts.fontSizePx * 0.2;
        const textWidth = Math.max(1, Math.ceil(metrics.width));
        const heightPx = Math.max(1, Math.ceil(ascent + descent) + 2);
        const widthPx = textWidth + 2;

        // Render at double width (physical-aspect correction) then
        // pair-average columns back down to widthPx.
        const off = document.createElement("canvas");
        off.width = widthPx * 2;
        off.height = heightPx;
        const ctx = off.getContext("2d");
        ctx.font = font;
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "alphabetic";
        ctx.scale(2, 1); // draw at normal glyph proportions into the doubled canvas
        ctx.fillText(text || "", 1, ascent + 1);

        const data = ctx.getImageData(0, 0, widthPx * 2, heightPx).data;
        const coverage = new Uint8Array(widthPx * heightPx);
        for (let y = 0; y < heightPx; y++) {
            for (let x = 0; x < widthPx; x++) {
                const i0 = (y * widthPx * 2 + x * 2) * 4 + 3; // alpha channel
                const i1 = i0 + 4;
                coverage[y * widthPx + x] = Math.round((data[i0] + data[i1]) / 2);
            }
        }
        return { widthPx, heightPx, coverage };
    },

    // Stamps a rendered coverage grid onto `layer` at (offsetX, offsetY)
    // using a single ink color, thresholding alpha coverage at `threshold`
    // (0-255, default 128).
    stamp(doc, layer, rendered, offsetX, offsetY, colorByte, threshold) {
        const t = threshold == null ? 128 : threshold;
        for (let y = 0; y < rendered.heightPx; y++) {
            for (let x = 0; x < rendered.widthPx; x++) {
                if (rendered.coverage[y * rendered.widthPx + x] < t) continue;
                Doc.setPixel(doc, layer, offsetX + x, offsetY + y, colorByte);
            }
        }
    },
};
