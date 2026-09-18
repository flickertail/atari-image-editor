// Atari 2600 NTSC palette - 128 colors (16 hues x 8 luminances).
// RGB values taken verbatim from Stella's ourNTSCPalette table
// (src/common/PaletteHandler.cxx) - the reference this editor previews
// against. Real hardware/TV/emulator output varies slightly, but this is
// the same table widely used across homebrew tooling.
//
// Atari color byte value = (hue << 4) | (lum << 1), i.e. an even byte
// 0x00-0xFE. paletteIndex = hue*8 + lum = byteValue >> 1.
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

const Palette = {
    RGB: ATARI_NTSC_RGB,

    // Atari byte value (even, 0x00-0xFE) -> palette index 0-127.
    indexForByte(byteValue) {
        return (byteValue >> 1) & 0x7f;
    },

    // Palette index 0-127 -> Atari byte value.
    byteForIndex(index) {
        return (index & 0x7f) << 1;
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
        return ATARI_NTSC_RGB[this.indexForByte(byteValue)];
    },

    cssForByte(byteValue) {
        const rgb = this.rgbForByte(byteValue);
        return "#" + rgb.toString(16).padStart(6, "0");
    },

    // Nearest Atari palette entry to an arbitrary 8-bit RGB triple, by
    // simple weighted Euclidean distance (weights approximate luma
    // sensitivity so quantization errors land where the eye notices least).
    nearestByte(r, g, b) {
        let bestByte = 0;
        let bestDist = Infinity;
        for (let i = 0; i < ATARI_NTSC_RGB.length; i++) {
            const rgb = ATARI_NTSC_RGB[i];
            const pr = (rgb >> 16) & 0xff;
            const pg = (rgb >> 8) & 0xff;
            const pb = rgb & 0xff;
            const dr = r - pr, dg = g - pg, db = b - pb;
            const dist = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
            if (dist < bestDist) {
                bestDist = dist;
                bestByte = i * 2;
            }
        }
        return bestByte;
    },

    // Perceived luma 0-255 for an arbitrary RGB triple (used by the image
    // importer's on/off mask thresholding).
    luma(r, g, b) {
        return 0.30 * r + 0.59 * g + 0.11 * b;
    },
};
