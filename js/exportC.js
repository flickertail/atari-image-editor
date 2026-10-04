// Generates C source matching the confirmed hardware shape:
//   static const uint8_t name[ROWS][2][GROUPS] = { ... };
// name[row][0][g] = color byte for that group on that scanline
// name[row][1][g] = pixel mask byte for that group (bit7 = leftmost pixel)
const ExportC = {
    sanitizeIdent(name, fallback) {
        let s = (name || fallback || "layer").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
        if (!s || /^[0-9]/.test(s)) s = "_" + s;
        return s || fallback || "layer";
    },

    byteHex(b) {
        return "0x" + b.toString(16).padStart(2, "0");
    },

    // Playfield layers (see playfield.js).
    //   Screen: name[ROWS][3] = { PF0, PF1, PF2 } per row, in the TIA's own bit
    //     order - plus PF0R, PF1R, PF2R ([ROWS][6]) for an asymmetric layer -
    //     and the colours: name_color[ROWS] (Row), [ROWS][2] (Score: left,
    //     right) or [ROWS][6] (Register: one per region, screen order).
    //   World: name[ROWS][ROW_BYTES], each row's blocks packed 8 per byte,
    //     bit 7 = leftmost block; name_color[ROWS]; and the camera views,
    //     name_views[VIEWS][2] = { x in blocks, y in rows } with an enum of
    //     their names.
    playfieldToC(doc, layer, name) {
        const ident = this.sanitizeIdent(name || layer.name);
        const U = ident.toUpperCase();
        const H = doc.heightRows;
        const lines = [];
        if (layer.size === "world") {
            const rowBytes = Math.ceil(layer.blocksW / 8);
            lines.push(`// "${layer.name}" - playfield world, ${layer.blocksW} blocks (${layer.blocksW * 4} px) wide x ${H} rows`);
            lines.push(`// ${ident}[row][byte]: the row's blocks, 8 per byte, bit 7 = leftmost; ${ident}_color[row] = COLUPF`);
            lines.push(`// ${ident}_views[view] = { first block (x), first row (y) } - top-left of a camera view`);
            lines.push(`#define ${U}_ROWS ${H}`);
            lines.push(`#define ${U}_BLOCKS ${layer.blocksW}`);
            lines.push(`#define ${U}_ROW_BYTES ${rowBytes}`);
            lines.push(`#define ${U}_VIEWS ${layer.views.length}`);
            lines.push("");
            lines.push(`static const uint8_t ${ident}[${U}_ROWS][${U}_ROW_BYTES] = {`);
            for (let y = 0; y < H; y++) {
                const bytes = [];
                for (let b = 0; b < rowBytes; b++) {
                    let v = 0;
                    for (let i = 0; i < 8; i++) {
                        const x = b * 8 + i;
                        if (x < layer.blocksW && layer.blocks[y * layer.blocksW + x]) v |= 0x80 >> i;
                    }
                    bytes.push(this.byteHex(v));
                }
                lines.push(`    {${bytes.join(",")}}, // row ${y}`);
            }
            lines.push("};");
            lines.push("");
            const colors = [];
            for (let y = 0; y < H; y++) colors.push(this.byteHex(layer.colors[y * 6]));
            lines.push(`static const uint8_t ${ident}_color[${U}_ROWS] = {`);
            for (let y = 0; y < H; y += 16) lines.push(`    ${colors.slice(y, y + 16).join(",")},`);
            lines.push("};");
            lines.push("");
            const used = new Set();
            const names = layer.views.map((v, i) => {
                let n = this.sanitizeIdent(v.name, "view" + i).toUpperCase();
                let k = 2;
                const base = n;
                while (used.has(n)) n = base + "_" + k++;
                used.add(n);
                return `${U}_VIEW_${n}`;
            });
            if (names.length) lines.push(`enum { ${names.join(", ")} };`);
            lines.push(`static const uint16_t ${ident}_views[${U}_VIEWS][2] = {`);
            for (const v of layer.views) lines.push(`    { ${v.x}, ${v.y} }, // ${v.name}`);
            lines.push("};");
            return lines.join("\n");
        }

        const asym = layer.half === "asym";
        const halfName = { asym: "asymmetric", repeat: "repeated", mirror: "mirrored" }[layer.half];
        lines.push(`// "${layer.name}" - playfield, ${H} rows, right half ${halfName}, colour per ${layer.colorMode}`);
        lines.push(asym
            ? `// ${ident}[row] = { PF0, PF1, PF2, PF0R, PF1R, PF2R } (R = right half, written mid-line)`
            : `// ${ident}[row] = { PF0, PF1, PF2 } (CTRLPF bit 0 = ${layer.half === "mirror" ? 1 : 0} for the right half)`);
        lines.push(`#define ${U}_ROWS ${H}`);
        lines.push("");
        lines.push(`static const uint8_t ${ident}[${U}_ROWS][${asym ? 6 : 3}] = {`);
        for (let y = 0; y < H; y++) {
            const regs = PF.registers(layer, y, 0);
            if (asym) regs.push(...PF.registers(layer, y, 20));
            lines.push(`    {${regs.map((v) => this.byteHex(v)).join(",")}}, // row ${y}`);
        }
        lines.push("};");
        lines.push("");
        if (layer.colorMode === "row") {
            const colors = [];
            for (let y = 0; y < H; y++) colors.push(this.byteHex(layer.colors[y * 6]));
            lines.push(`static const uint8_t ${ident}_color[${U}_ROWS] = {`);
            for (let y = 0; y < H; y += 16) lines.push(`    ${colors.slice(y, y + 16).join(",")},`);
            lines.push("};");
        } else {
            const regions = layer.colorMode === "score" ? [0, 3] : [0, 1, 2, 3, 4, 5];
            lines.push(layer.colorMode === "score"
                ? `// ${ident}_color[row] = { left half (COLUP0), right half (COLUP1) } - score mode`
                : `// ${ident}_color[row] = one COLUPF per region, screen order: x ${layer.half === "mirror" ? "0-15, 16-47, 48-79, 80-111, 112-143, 144-159" : "0-15, 16-47, 48-79, 80-95, 96-127, 128-159"}`);
            lines.push(`static const uint8_t ${ident}_color[${U}_ROWS][${regions.length}] = {`);
            for (let y = 0; y < H; y++) lines.push(`    {${regions.map((k) => this.byteHex(layer.colors[y * 6 + k])).join(",")}},`);
            lines.push("};");
        }
        return lines.join("\n");
    },

    layerToC(doc, layer, name) {
        if (PF.isPlayfield(layer)) return this.playfieldToC(doc, layer, name);
        const ident = this.sanitizeIdent(name || layer.name);
        const rows = doc.heightRows;
        const groups = doc.widthBytes;
        const lines = [];
        lines.push(`// "${layer.name}" - ${groups * 8} px wide (${groups} bytes/group) x ${rows} scanlines`);
        lines.push(`// ${ident}[row][0][group] = color byte, ${ident}[row][1][group] = pixel mask (bit7 = leftmost pixel)`);
        lines.push(`#define ${ident.toUpperCase()}_ROWS ${rows}`);
        lines.push(`#define ${ident.toUpperCase()}_GROUPS ${groups}`);
        lines.push("");
        lines.push(`static const uint8_t ${ident}[${ident.toUpperCase()}_ROWS][2][${ident.toUpperCase()}_GROUPS] = {`);
        for (let y = 0; y < rows; y++) {
            const colorBytes = [];
            const maskBytes = [];
            for (let g = 0; g < groups; g++) {
                const idx = y * groups + g;
                colorBytes.push(this.byteHex(layer.colorGrid[idx]));
                maskBytes.push(this.byteHex(layer.maskGrid[idx]));
            }
            lines.push(`    { // row ${y}`);
            lines.push(`        {${colorBytes.join(",")}},`);
            lines.push(`        {${maskBytes.join(",")}},`);
            lines.push(`    },`);
        }
        lines.push("};");
        return lines.join("\n");
    },

    allLayersToC(doc) {
        const used = new Set();
        const blocks = doc.layers.map((layer) => {
            let ident = this.sanitizeIdent(layer.name);
            let n = 2;
            while (used.has(ident)) { ident = this.sanitizeIdent(layer.name) + "_" + n++; }
            used.add(ident);
            return this.layerToC(doc, layer, ident);
        });
        return blocks.join("\n\n");
    },

    // Wraps a body (from layerToC/allLayersToC) as a standalone, includable
    // header: guarded against double-inclusion, and self-sufficient (pulls
    // in stdint.h itself for uint8_t) so it drops into any project without
    // assuming another header was included first. Everything inside is
    // `static const`, so including this in several .c files in the same
    // program is safe - each translation unit just gets its own private
    // copy, no linker collisions.
    toHeader(scopeName, body) {
        const guard = this.sanitizeIdent(scopeName).toUpperCase() + "_H";
        return `#ifndef ${guard}\n#define ${guard}\n\n#include <stdint.h>\n\n${this.noTrailingCommas(body)}\n\n#endif // ${guard}\n`;
    },

    // Drops the comma after the last element of every initializer list
    // ("...,\n}" or "..., // comment\n}"). Legal C either way, but some tools
    // that read these headers don't accept it.
    noTrailingCommas(text) {
        return text.replace(/,([ \t]*(?:\/\/[^\n]*)?\n[ \t]*\})/g, "$1");
    },
};
