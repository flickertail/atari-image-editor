// Detects which of a large list of common font names are actually
// installed, WITHOUT the permission-gated Local Font Access API (which
// requires a Chrome/Edge permission grant that can fail or stay silent
// for reasons outside this app's control - sandboxed browsers, enterprise
// policy, a previously-denied prompt, etc). This is the classic canvas-
// measurement trick: render a string in the candidate font with a couple
// of generic fallbacks appended, and in the bare generic fallback alone;
// if the measured width differs, the candidate font exists and actually
// changed the rendering. No permission, no prompt, works everywhere.
//
// The tradeoff: it can only confirm fonts on this candidate list, not
// discover unknown ones - so the list is intentionally broad (common
// Windows, Mac and Linux font names).
const FontDetect = {
    CANDIDATES: [
        "Arial", "Arial Black", "Arial Narrow", "Helvetica", "Helvetica Neue",
        "Verdana", "Tahoma", "Trebuchet MS", "Segoe UI", "Segoe Print", "Segoe Script",
        "Calibri", "Candara", "Corbel", "Franklin Gothic Medium", "Century Gothic",
        "Gill Sans", "Gill Sans MT", "Futura", "Optima", "Lucida Sans", "Lucida Sans Unicode",
        "Lucida Grande", "Geneva", "Myriad Pro", "Open Sans", "Roboto", "Noto Sans",
        "Ubuntu", "Cantarell", "Liberation Sans", "DejaVu Sans", "FreeSans", "PT Sans",
        "Times New Roman", "Times", "Georgia", "Garamond", "Book Antiqua", "Palatino",
        "Palatino Linotype", "Cambria", "Baskerville", "Big Caslon", "Bookman Old Style",
        "Bodoni MT", "Didot", "Rockwell", "Perpetua", "Constantia", "Goudy Old Style",
        "Century", "Century Schoolbook", "Hoefler Text", "Cochin", "Liberation Serif",
        "DejaVu Serif", "FreeSerif", "PT Serif", "Noto Serif",
        "Courier New", "Courier", "Consolas", "Lucida Console", "Monaco", "Menlo",
        "Andale Mono", "Source Code Pro", "Cascadia Code", "Cascadia Mono",
        "DejaVu Sans Mono", "Liberation Mono", "FreeMono", "SF Mono",
        "Comic Sans MS", "Papyrus", "Impact", "Copperplate", "Brush Script MT",
        "Chalkboard", "Chalkduster", "Marker Felt", "Bradley Hand", "Noteworthy",
        "American Typewriter", "Avenir", "Avenir Next", "Herculanum", "Party LET",
        "Phosphate", "Savoye LET", "SignPainter", "Skia", "Snell Roundhand",
        "Superclarendon", "Trattatello", "Zapfino", "Mistral", "Vivaldi",
        "Vladimir Script", "Kunstler Script", "Monotype Corsiva", "French Script MT",
        "Freestyle Script", "Rage Italic", "Harrington", "Jokerman", "Kristen ITC",
        "Magneto", "Playbill", "Pristina", "Ravie", "Showcard Gothic",
        "Stencil", "Broadway", "Algerian", "Bauhaus 93", "Bernard MT Condensed",
        "Britannic Bold", "Elephant", "Engravers MT", "Eras Bold ITC",
        "Footlight MT Light", "Forte", "Gigi", "Haettenschweiler", "High Tower Text",
        "Imprint MT Shadow", "Juice ITC", "Maiandra GD", "Matura MT Script Capitals",
        "Modern No. 20", "Niagara Engraved", "Niagara Solid", "OCR A Extended",
        "Old English Text MT", "Onyx", "Parchment", "Perpetua Titling MT",
        "Poor Richard", "Snap ITC", "Tempus Sans ITC", "Wide Latin", "Wingdings",
    ],

    _ctx: null,
    _baseWidths: null,

    _ensureCtx() {
        if (!this._ctx) this._ctx = document.createElement("canvas").getContext("2d");
        return this._ctx;
    },

    _measure(fontSpec, text) {
        const ctx = this._ensureCtx();
        ctx.font = fontSpec;
        return ctx.measureText(text).width;
    },

    isAvailable(fontName) {
        const testString = "mmmmmmmmmmlli|jI0O";
        const testSize = "72px";
        const fallbacks = ["monospace", "sans-serif", "serif"];
        if (!this._baseWidths) {
            this._baseWidths = {};
            for (const fb of fallbacks) this._baseWidths[fb] = this._measure(`${testSize} ${fb}`, testString);
        }
        for (const fb of fallbacks) {
            const width = this._measure(`${testSize} "${fontName}", ${fb}`, testString);
            if (width !== this._baseWidths[fb]) return true;
        }
        return false;
    },

    // Cached after first run - the candidate list is fixed, so results
    // can't change mid-session.
    _cached: null,
    detectAll() {
        if (!this._cached) this._cached = this.CANDIDATES.filter((name) => this.isAvailable(name));
        return this._cached;
    },
};
