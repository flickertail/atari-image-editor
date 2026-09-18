// Atari 2600 palettes. The color byte itself is hardware data, (hue << 4) |
// (lum << 1), and is the same in every TV standard - what changes between
// NTSC, PAL and SECAM is only which real color that byte produces on screen.
// So the editor keeps one set of color bytes and lets you view (and pick
// from) them through any of the three palettes; switching palettes never
// changes the data, only how it looks.
//
// All three RGB tables are taken verbatim from Stella's palette tables
// (src/common/PaletteHandler.cxx: ourNTSCPalette, ourPALPalette - the active
// non-"#if 0" version - and ourSECAMPalette), the reference this editor
// previews against. Real hardware/TV/emulator output varies slightly, but
// these are the same tables widely used across homebrew tooling.
//
// NTSC and PAL: 128 colors (16 hues x 8 luminances), paletteIndex =
// hue*8 + lum = byteValue >> 1. PAL's hues 0, 1, 14 and 15 are all gray.
//
// SECAM: only 8 colors. The hue nibble is ignored entirely and the color
// comes from the 3 luminance bits alone (black, blue, red, magenta, green,
// cyan, yellow, white), so paletteIndex = (byteValue >> 1) & 7.

const ATARI_NTSC_RGB = [
    0x000000, 0x4a4a4a, 0x6f6f6f, 0x8e8e8e, 0xaaaaaa, 0xc0c0c0, 0xd6d6d6, 0xececec,
    0x484800, 0x69690f, 0x86861d, 0xa2a22a, 0xbbbb35, 0xd2d240, 0xe8e84a, 0xfcfc54,
    0x7c2c00, 0x904811, 0xa26221, 0xb47a30, 0xc3903d, 0xd2a44a, 0xdfb755, 0xecc860,
    0x901c00, 0xa33915, 0xb55328, 0xc66c3a, 0xd5824a, 0xe39759, 0xf0aa67, 0xfcbc74,
    0x940000, 0xa71a1a, 0xb83232, 0xc84848, 0xd65c5c, 0xe46f6f, 0xf08080, 0xfc9090,
    0x840064, 0x97197a, 0xa8308f, 0xb846a2, 0xc659b3, 0xd46cc3, 0xe07cd2, 0xec8ce0,
    0x500084, 0x68199a, 0x7d30ad, 0x9246c0, 0xa459d0, 0xb56ce0, 0xc57cee, 0xd48cfc,
    0x140090, 0x331aa3, 0x4e32b5, 0x6848c6, 0x7f5cd5, 0x956fe3, 0xa980f0, 0xbc90fc,
    0x000094, 0x181aa7, 0x2d32b8, 0x4248c8, 0x545cd6, 0x656fe4, 0x7580f0, 0x8490fc,
    0x001c88, 0x183b9d, 0x2d57b0, 0x4272c2, 0x548ad2, 0x65a0e1, 0x75b5ef, 0x84c8fc,
    0x003064, 0x185080, 0x2d6d98, 0x4288b0, 0x54a0c5, 0x65b7d9, 0x75cceb, 0x84e0fc,
    0x004030, 0x18624e, 0x2d8169, 0x429e82, 0x54b899, 0x65d1ae, 0x75e7c2, 0x84fcd4,
    0x004400, 0x1a661a, 0x328432, 0x48a048, 0x5cba5c, 0x6fd26f, 0x80e880, 0x90fc90,
    0x143c00, 0x355f18, 0x527e2d, 0x6e9c42, 0x87b754, 0x9ed065, 0xb4e775, 0xc8fc84,
    0x303800, 0x505916, 0x6d762b, 0x88923e, 0xa0ab4f, 0xb7c25f, 0xccd86e, 0xe0ec7c,
    0x482c00, 0x694d14, 0x866a26, 0xa28638, 0xbb9f47, 0xd2b656, 0xe8cc63, 0xfce070,
];

const ATARI_PAL_RGB = [
    0x0b0b0b, 0x333333, 0x595959, 0x7b7b7b, 0x999999, 0xb6b6b6, 0xcfcfcf, 0xe6e6e6,
    0x0b0b0b, 0x333333, 0x595959, 0x7b7b7b, 0x999999, 0xb6b6b6, 0xcfcfcf, 0xe6e6e6,
    0x3b2400, 0x664700, 0x8b7000, 0xac9200, 0xc5ae36, 0xdec85e, 0xf7e27f, 0xfff19e,
    0x004500, 0x006f00, 0x3b9200, 0x65b009, 0x85ca3d, 0xa3e364, 0xbffc84, 0xd5ffa5,
    0x590000, 0x802700, 0xa15700, 0xbc7937, 0xd6985f, 0xeeb381, 0xffce9e, 0xffdcbd,
    0x004900, 0x007200, 0x169216, 0x45af45, 0x6bc96b, 0x8be38b, 0xa9fba9, 0xc5ffc5,
    0x640012, 0x890821, 0xa73d4d, 0xc26472, 0xdc8491, 0xf4a3ae, 0xffbeca, 0xffdae0,
    0x003d29, 0x006a48, 0x048e63, 0x3caa84, 0x62c5a2, 0x83dfbe, 0xa1f8d9, 0xbeffe9,
    0x550046, 0x88006e, 0xa5318d, 0xc159aa, 0xda7cc5, 0xf39adf, 0xffb9f3, 0xffd4f6,
    0x003651, 0x005a7d, 0x117e9c, 0x429cb8, 0x68b7d2, 0x88d2eb, 0xa6ebff, 0xc3ffff,
    0x4c007c, 0x75009d, 0x932eb8, 0xaf57d2, 0xca7aeb, 0xe499ff, 0xecb7ff, 0xf3d4ff,
    0x002d83, 0x003ea4, 0x2d65bf, 0x5685da, 0x79a2f2, 0x99bfff, 0xb7dbff, 0xd3f5ff,
    0x220096, 0x5200b6, 0x7538cf, 0x945fe8, 0xb181ff, 0xc5a0ff, 0xd6bdff, 0xe8daff,
    0x00009a, 0x241db6, 0x504ad0, 0x746fe9, 0x928eff, 0xb1adff, 0xcecaff, 0xe9e5ff,
    0x0b0b0b, 0x333333, 0x595959, 0x7b7b7b, 0x999999, 0xb6b6b6, 0xcfcfcf, 0xe6e6e6,
    0x0b0b0b, 0x333333, 0x595959, 0x7b7b7b, 0x999999, 0xb6b6b6, 0xcfcfcf, 0xe6e6e6,
];

const ATARI_SECAM_RGB = [
    0x000000, 0x2121ff, 0xf03c79, 0xff50ff, 0x7fff00, 0x7fffff, 0xffff3f, 0xffffff,
];

const PALETTES = {
    NTSC: { name: "NTSC", rgb: ATARI_NTSC_RGB, indexMask: 0x7f },
    PAL: { name: "PAL", rgb: ATARI_PAL_RGB, indexMask: 0x7f },
    SECAM: { name: "SECAM", rgb: ATARI_SECAM_RGB, indexMask: 0x07 },
};

const Palette = {
    // Which palette is currently used to display colors, pick colors, and
    // quantize imported images.
    mode: "NTSC",

    setMode(mode) {
        if (!PALETTES[mode]) return false;
        this.mode = mode;
        return true;
    },

    get RGB() {
        return PALETTES[this.mode].rgb;
    },

    // Number of pickable colors in the current palette (128, or 8 for SECAM).
    count() {
        return this.RGB.length;
    },

    // Atari byte value (even, 0x00-0xFE) -> index into the current palette.
    indexForByte(byteValue) {
        return (byteValue >> 1) & PALETTES[this.mode].indexMask;
    },

    // Palette index -> Atari byte value (for SECAM this is the hue-0 byte,
    // 0x00-0x0E, since the hue nibble means nothing there).
    byteForIndex(index) {
        return (index & PALETTES[this.mode].indexMask) << 1;
    },

    hueOf(byteValue) {
        return (byteValue >> 5) & 0x0f;
    },

    lumOf(byteValue) {
        return (byteValue >> 1) & 0x07;
    },

    byteFor(hue, lum) {
        return ((hue & 0x0f) << 4) | ((lum & 0x07) << 1);
    },

    rgbForByte(byteValue) {
        return this.RGB[this.indexForByte(byteValue)];
    },

    cssForByte(byteValue) {
        const rgb = this.rgbForByte(byteValue);
        return "#" + rgb.toString(16).padStart(6, "0");
    },

    // Nearest entry in the CURRENT palette to an arbitrary 8-bit RGB triple,
    // by simple weighted Euclidean distance (weights approximate luma
    // sensitivity so quantization errors land where the eye notices least).
    nearestByte(r, g, b) {
        const table = this.RGB;
        let bestIndex = 0;
        let bestDist = Infinity;
        for (let i = 0; i < table.length; i++) {
            const rgb = table[i];
            const pr = (rgb >> 16) & 0xff;
            const pg = (rgb >> 8) & 0xff;
            const pb = rgb & 0xff;
            const dr = r - pr, dg = g - pg, db = b - pb;
            const dist = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }
        return this.byteForIndex(bestIndex);
    },

    // Perceived luma 0-255 for an arbitrary RGB triple (used by the image
    // importer's on/off mask thresholding).
    luma(r, g, b) {
        return 0.30 * r + 0.59 * g + 0.11 * b;
    },
};
