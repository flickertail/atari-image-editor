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

    layerToC(doc, layer, name) {
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
        return `#ifndef ${guard}\n#define ${guard}\n\n#include <stdint.h>\n\n${body}\n\n#endif // ${guard}\n`;
    },
};
