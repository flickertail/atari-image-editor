// Pure grid-editing algorithms - no DOM here, just doc/layer manipulation.
// app.js wires mouse events from GridCanvas to these.
const Tools = {
    setPixel(doc, layer, x, y, colorByte) {
        Doc.setPixel(doc, layer, x, y, colorByte);
    },

    erasePixel(doc, layer, x, y) {
        Doc.clearPixel(doc, layer, x, y);
    },

    // Bresenham line, used both for the pencil (drag between mousemove
    // samples so fast strokes don't leave gaps) and the line tool.
    line(doc, layer, x0, y0, x1, y1, erase, colorByte) {
        x0 = Math.round(x0); y0 = Math.round(y0);
        x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
            if (erase) this.erasePixel(doc, layer, x0, y0);
            else this.setPixel(doc, layer, x0, y0, colorByte);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    },

    rect(doc, layer, x0, y0, x1, y1, filled, erase, colorByte) {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const apply = (x, y) => {
            if (erase) this.erasePixel(doc, layer, x, y);
            else this.setPixel(doc, layer, x, y, colorByte);
        };
        if (filled) {
            for (let y = minY; y <= maxY; y++)
                for (let x = minX; x <= maxX; x++) apply(x, y);
        } else {
            for (let x = minX; x <= maxX; x++) { apply(x, minY); apply(x, maxY); }
            for (let y = minY; y <= maxY; y++) { apply(minX, y); apply(maxX, y); }
        }
    },

    // 4-connected flood fill on the ACTIVE layer's own on/off+color state
    // (layers are independent hardware bitmaps, so fill never looks at
    // other layers). `erase: true` clears the matching region instead of
    // painting it.
    floodFill(doc, layer, startX, startY, colorByte, erase) {
        const w = Doc.widthPx(doc), h = doc.heightRows;
        const start = Doc.getPixel(doc, layer, startX, startY);
        const matchOn = start.on;
        const matchColor = start.colorByte;
        const matches = (x, y) => {
            const p = Doc.getPixel(doc, layer, x, y);
            if (p.on !== matchOn) return false;
            if (matchOn && p.colorByte !== matchColor) return false;
            return true;
        };
        if (!erase && matchOn && matchColor === colorByte) return; // no-op
        if (erase && !matchOn) return; // already off

        const seen = new Uint8Array(w * h);
        const stack = [[startX, startY]];
        seen[startY * w + startX] = 1;
        while (stack.length) {
            const [x, y] = stack.pop();
            if (erase) this.erasePixel(doc, layer, x, y);
            else this.setPixel(doc, layer, x, y, colorByte);
            const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                if (seen[ny * w + nx]) continue;
                if (!matches(nx, ny)) continue;
                seen[ny * w + nx] = 1;
                stack.push([nx, ny]);
            }
        }
    },

    eyedropper(doc, layer, x, y) {
        const p = Doc.getPixel(doc, layer, x, y);
        return p.on ? p.colorByte : null;
    },
};
