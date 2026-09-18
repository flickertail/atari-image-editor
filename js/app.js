// Wires the DOM to the pure data/rendering modules in the other files.
let doc = createDocument(6, 64); // default: 48px wide, 64 scanlines
let grid;
let currentColorByte = Palette.byteForIndex(0x1a >> 1) || 0x1a;
let currentTool = "pencil";
let drawing = false;
let lastPixel = null;
let shapeStart = null;
let moveOriginal = null;
let pendingImportImg = null;
let pendingTextRender = null;

const $ = (id) => document.getElementById(id);

// Prefers a real native "Save As..." dialog (File System Access API) so
// saves/exports land wherever the user picks, instead of always silently
// dropping into the browser's Downloads folder. Falls back to the old
// download-link behavior only on browsers that don't support the API
// (e.g. Firefox) - showSaveFilePicker itself throws AbortError if the
// user cancels the dialog, which is treated as a no-op, not an error.
async function saveTextFileAs(content, suggestedName, mimeType, extension, description) {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName,
                types: [{ description, accept: { [mimeType]: [extension] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
        } catch (err) {
            if (err.name !== "AbortError") throw err;
        }
        return;
    }
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ---------- undo/redo ----------
const History = {
    undoStack: [],
    redoStack: [],
    MAX: 50,

    // Call BEFORE mutating `doc` - snapshots the pre-change state.
    snapshotBeforeChange() {
        this.undoStack.push(Doc.clone(doc));
        if (this.undoStack.length > this.MAX) this.undoStack.shift();
        this.redoStack.length = 0;
        this.updateButtons();
    },

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(Doc.clone(doc));
        doc = this.undoStack.pop();
        grid.setDoc(doc);
        renderLayerList();
        redraw();
        this.updateButtons();
    },

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(Doc.clone(doc));
        doc = this.redoStack.pop();
        grid.setDoc(doc);
        renderLayerList();
        redraw();
        this.updateButtons();
    },

    updateButtons() {
        $("btnUndo").disabled = this.undoStack.length === 0;
        $("btnRedo").disabled = this.redoStack.length === 0;
    },
};

function setupHistory() {
    $("btnUndo").addEventListener("click", () => History.undo());
    $("btnRedo").addEventListener("click", () => History.redo());
    History.updateButtons();

    window.addEventListener("keydown", (e) => {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (document.querySelector("dialog[open]")) return;
        const ctrlOrCmd = e.ctrlKey || e.metaKey;
        if (!ctrlOrCmd) return;
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) { e.preventDefault(); History.undo(); }
        else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); History.redo(); }
    });
}

// ---------- Move tool: arrow-key nudging ----------
function setupMoveNudge() {
    window.addEventListener("keydown", (e) => {
        if (currentTool !== "move") return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (document.querySelector("dialog[open]")) return;

        let dxPixels = 0, dyRows = 0;
        if (e.key === "ArrowLeft") dxPixels = e.shiftKey ? -8 : -1;
        else if (e.key === "ArrowRight") dxPixels = e.shiftKey ? 8 : 1;
        else if (e.key === "ArrowUp") dyRows = e.shiftKey ? -8 : -1;
        else if (e.key === "ArrowDown") dyRows = e.shiftKey ? 8 : 1;
        else return;

        e.preventDefault();
        const layer = Doc.activeLayer(doc);
        History.snapshotBeforeChange();
        Doc.shiftLayerFrom(doc, layer, layer.colorGrid, layer.maskGrid, dxPixels, dyRows);
        redraw();
    });
}

// ---------- palette panel ----------
function buildPaletteGrid() {
    const el = $("paletteGrid");
    el.innerHTML = "";
    for (let i = 0; i < 128; i++) {
        const byteValue = Palette.byteForIndex(i);
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.background = Palette.cssForByte(byteValue);
        cell.title = "0x" + byteValue.toString(16).padStart(2, "0");
        cell.dataset.byte = byteValue;
        cell.addEventListener("click", () => setCurrentColor(byteValue));
        el.appendChild(cell);
    }
    refreshPaletteSelection();
}

function refreshPaletteSelection() {
    for (const cell of $("paletteGrid").children) {
        cell.classList.toggle("selected", Number(cell.dataset.byte) === currentColorByte);
    }
}

function setCurrentColor(byteValue) {
    currentColorByte = byteValue;
    $("currentColorSwatch").style.background = Palette.cssForByte(byteValue);
    $("currentColorHex").textContent = "0x" + byteValue.toString(16).padStart(2, "0");
    refreshPaletteSelection();
}

// ---------- layer panel ----------
function renderLayerList() {
    const el = $("layerList");
    el.innerHTML = "";
    for (let i = doc.layers.length - 1; i >= 0; i--) {
        const layer = doc.layers[i];
        const row = document.createElement("div");
        row.className = "layerRow" + (i === doc.activeLayerIndex ? " active" : "");

        const vis = document.createElement("input");
        vis.type = "checkbox";
        vis.checked = layer.visible;
        vis.title = "Visible";
        vis.addEventListener("click", (e) => e.stopPropagation());
        vis.addEventListener("change", () => { layer.visible = vis.checked; redraw(); });

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = layer.name;
        nameInput.addEventListener("change", () => { layer.name = nameInput.value; });
        nameInput.addEventListener("click", (e) => e.stopPropagation());

        const btns = document.createElement("div");
        btns.className = "layerBtns";
        const mkBtn = (label, title, fn) => {
            const b = document.createElement("button");
            b.textContent = label; b.title = title;
            b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
            return b;
        };
        btns.appendChild(mkBtn("▲", "Move up", () => { History.snapshotBeforeChange(); Doc.moveLayer(doc, i, 1); renderLayerList(); redraw(); }));
        btns.appendChild(mkBtn("▼", "Move down", () => { History.snapshotBeforeChange(); Doc.moveLayer(doc, i, -1); renderLayerList(); redraw(); }));
        const stampBtn = mkBtn("Stamp", "Stamp this layer's color + geometry onto the layer below it (this layer is left as-is)", () => {
            History.snapshotBeforeChange();
            Doc.stampLayerOnto(layer, doc.layers[i - 1]);
            redraw();
        });
        stampBtn.disabled = i === 0;
        if (i === 0) stampBtn.title = "Nothing below this layer to stamp onto";
        btns.appendChild(stampBtn);
        btns.appendChild(mkBtn("⧉", "Duplicate", () => { History.snapshotBeforeChange(); Doc.duplicateLayer(doc, i); renderLayerList(); redraw(); }));
        btns.appendChild(mkBtn("✕", "Delete", () => {
            if (doc.layers.length <= 1) return;
            if (!confirm(`Delete layer "${layer.name}"?`)) return;
            History.snapshotBeforeChange();
            Doc.removeLayer(doc, i); renderLayerList(); redraw();
        }));

        row.addEventListener("click", () => { doc.activeLayerIndex = i; renderLayerList(); });
        row.appendChild(vis);
        row.appendChild(nameInput);
        row.appendChild(btns);
        el.appendChild(row);
    }
}

function setupLayerPanel() {
    $("btnAddLayer").addEventListener("click", () => {
        History.snapshotBeforeChange();
        Doc.addLayer(doc, `Layer ${doc.layers.length + 1}`);
        renderLayerList();
        redraw();
    });
}

// ---------- canvas / drawing ----------
function redraw() {
    grid.draw();
    $("docInfo").textContent = `${Doc.widthPx(doc)}x${doc.heightRows}px (${doc.widthBytes} bytes wide)`;
}

function overlayPixels(points, colorByte, erase) {
    const ctx = grid.ctx;
    ctx.fillStyle = erase ? "rgba(255,60,60,0.55)" : Palette.cssForByte(colorByte);
    ctx.globalAlpha = erase ? 1 : 0.6;
    for (const [x, y] of points) {
        ctx.fillRect(x * grid.cellW, y * grid.cellH, grid.cellW, grid.cellH);
    }
    ctx.globalAlpha = 1;
}

function linePointsDry(x0, y0, x1, y1) {
    const pts = [];
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
        pts.push([x0, y0]);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return pts;
}

function rectPointsDry(x0, y0, x1, y1, filled) {
    const pts = [];
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    if (filled) {
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) pts.push([x, y]);
    } else {
        for (let x = minX; x <= maxX; x++) { pts.push([x, minY]); pts.push([x, maxY]); }
        for (let y = minY; y <= maxY; y++) { pts.push([minX, y]); pts.push([maxX, y]); }
    }
    return pts;
}

function canvasMouseDown(e) {
    if (e.button !== 0) return; // only the left button draws - right-click is reserved for the context menu
    const p = grid.pixelAt(e.offsetX, e.offsetY);
    if (!p) return;
    const layer = Doc.activeLayer(doc);
    drawing = true;

    // Every tool below mutates the doc exactly once per mousedown-to-mouseup
    // gesture (shape tools commit on mouseup, but using the same doc
    // snapshotted here) - eyedropper is the only read-only exception.
    if (currentTool !== "eyedropper") History.snapshotBeforeChange();

    if (currentTool === "pencil") {
        Tools.setPixel(doc, layer, p.x, p.y, currentColorByte);
        lastPixel = p; redraw();
    } else if (currentTool === "eraser") {
        Tools.erasePixel(doc, layer, p.x, p.y);
        lastPixel = p; redraw();
    } else if (currentTool === "fill") {
        Tools.floodFill(doc, layer, p.x, p.y, currentColorByte, e.shiftKey);
        redraw();
    } else if (currentTool === "eyedropper") {
        const picked = Tools.eyedropper(doc, layer, p.x, p.y);
        if (picked !== null) setCurrentColor(picked);
    } else if (currentTool === "line" || currentTool === "rect" || currentTool === "rectFilled" || currentTool === "rectErase") {
        shapeStart = p;
    } else if (currentTool === "move") {
        shapeStart = p;
        moveOriginal = { colorGrid: layer.colorGrid.slice(), maskGrid: layer.maskGrid.slice() };
    }
}

function canvasMouseMove(e) {
    if (!drawing) return;
    const p = grid.pixelAt(e.offsetX, e.offsetY);
    if (!p) return;

    if (currentTool === "pencil" && lastPixel) {
        Tools.line(doc, Doc.activeLayer(doc), lastPixel.x, lastPixel.y, p.x, p.y, false, currentColorByte);
        lastPixel = p; redraw();
    } else if (currentTool === "eraser" && lastPixel) {
        Tools.line(doc, Doc.activeLayer(doc), lastPixel.x, lastPixel.y, p.x, p.y, true, currentColorByte);
        lastPixel = p; redraw();
    } else if (currentTool === "line" && shapeStart) {
        redraw();
        overlayPixels(linePointsDry(shapeStart.x, shapeStart.y, p.x, p.y), currentColorByte);
    } else if ((currentTool === "rect" || currentTool === "rectFilled" || currentTool === "rectErase") && shapeStart) {
        redraw();
        const filled = currentTool !== "rect";
        const erase = currentTool === "rectErase";
        overlayPixels(rectPointsDry(shapeStart.x, shapeStart.y, p.x, p.y, filled), currentColorByte, erase);
    } else if (currentTool === "move" && shapeStart && moveOriginal) {
        const dxPixels = p.x - shapeStart.x;
        const dyRows = p.y - shapeStart.y;
        Doc.shiftLayerFrom(doc, Doc.activeLayer(doc), moveOriginal.colorGrid, moveOriginal.maskGrid, dxPixels, dyRows);
        redraw();
    }
}

function canvasMouseUp(e) {
    const p = grid.pixelAt(e.offsetX, e.offsetY) || lastPixel;
    if (drawing && shapeStart && p) {
        const layer = Doc.activeLayer(doc);
        if (currentTool === "line") {
            Tools.line(doc, layer, shapeStart.x, shapeStart.y, p.x, p.y, false, currentColorByte);
        } else if (currentTool === "rect" || currentTool === "rectFilled" || currentTool === "rectErase") {
            const filled = currentTool !== "rect";
            const erase = currentTool === "rectErase";
            Tools.rect(doc, layer, shapeStart.x, shapeStart.y, p.x, p.y, filled, erase, currentColorByte);
        }
        redraw();
    }
    drawing = false; lastPixel = null; shapeStart = null; moveOriginal = null;
}

function setupCanvasEvents() {
    const c = grid.canvas;
    c.addEventListener("mousedown", canvasMouseDown);
    c.addEventListener("mousemove", canvasMouseMove);
    window.addEventListener("mouseup", canvasMouseUp);
    c.addEventListener("contextmenu", (e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY); });
}

// Ctrl/Cmd+scroll zooms (matching the convention apps like Figma/Photoshop
// use, and how Chrome reports trackpad pinch-zoom) - a PLAIN scroll is left
// alone so it still scrolls #canvasArea normally, which you need once the
// canvas is zoomed in past the viewport.
function setupZoomWheel() {
    const zoomRange = $("zoomRange");
    const min = Number(zoomRange.min), max = Number(zoomRange.max);
    $("canvasArea").addEventListener("wheel", (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const step = e.deltaY < 0 ? 1 : -1;
        const newZoom = Math.max(min, Math.min(max, grid.cellH + step));
        if (newZoom === grid.cellH) return;
        grid.setZoom(newZoom);
        zoomRange.value = newZoom;
        redraw();
    }, { passive: false });
}

// ---------- right-click context menu ----------
function openContextMenu(clientX, clientY) {
    const menu = $("contextMenu");
    menu.style.left = clientX + "px";
    menu.style.top = clientY + "px";
    menu.style.display = "flex";
}

function setupContextMenu() {
    const menu = $("contextMenu");
    window.addEventListener("click", () => { menu.style.display = "none"; });
    menu.addEventListener("contextmenu", (e) => e.preventDefault());
    for (const btn of menu.querySelectorAll("button")) {
        btn.addEventListener("click", () => {
            const layer = Doc.activeLayer(doc);
            History.snapshotBeforeChange();
            if (btn.dataset.action === "clearAll") Doc.clearLayerAll(layer);
            else if (btn.dataset.action === "clearColors") Doc.clearLayerColors(layer);
            else if (btn.dataset.action === "clearGeometry") Doc.clearLayerGeometry(layer);
            redraw();
        });
    }
}

// ---------- tool selection ----------
function setupToolButtons() {
    for (const btn of document.querySelectorAll(".tool")) {
        btn.addEventListener("click", () => {
            document.querySelector(".tool.active")?.classList.remove("active");
            btn.classList.add("active");
            currentTool = btn.dataset.tool;
        });
    }
}

// ---------- raw grid preview renderer (used by import/text dialogs) ----------
function renderRawGridPreview(canvasEl, widthBytes, heightRows, colorGrid, maskGrid, maxWidthPx) {
    const widthPx = widthBytes * 8;
    let cellH = Math.max(1, Math.floor((maxWidthPx || 380) / (widthPx * 2)));
    const cellW = cellH * 2;
    canvasEl.width = widthPx * cellW;
    canvasEl.height = heightRows * cellH;
    const ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < heightRows; y++) {
        for (let x = 0; x < widthPx; x++) {
            const g = x >> 3, bit = 7 - (x & 7);
            const idx = y * widthBytes + g;
            const on = (maskGrid[idx] & (1 << bit)) !== 0;
            if (on) ctx.fillStyle = Palette.cssForByte(colorGrid[idx]);
            else ctx.fillStyle = ((x >> 2) + (y >> 2)) & 1 ? "#3a3a3a" : "#2e2e2e";
            ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
    }
}

// ---------- Save/Load Project ----------
function setupProjectFile() {
    $("btnSaveProject").addEventListener("click", () => {
        const json = JSON.stringify(Doc.toPlainObject(doc), null, 1);
        const baseName = (doc.layers[0] && doc.layers[0].name) || "atari_image";
        const suggestedName = baseName.replace(/[^a-z0-9_]+/gi, "_") + ".json";
        saveTextFileAs(json, suggestedName, "application/json", ".json", "Atari Image Project");
    });

    $("btnLoadProject").addEventListener("click", () => $("loadProjectFile").click());
    $("loadProjectFile").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        let data;
        try { data = JSON.parse(text); } catch (err) { alert("Not a valid project file: " + err.message); return; }
        History.snapshotBeforeChange();
        doc = Doc.fromPlainObject(data);
        grid.setDoc(doc);
        renderLayerList();
        redraw();
        e.target.value = "";
    });
}

// ---------- New Canvas dialog ----------
function setupNewDialog() {
    const dlg = $("dlgNew");
    $("btnNew").addEventListener("click", () => {
        $("newWidthBytes").value = doc.widthBytes;
        $("newHeightRows").value = doc.heightRows;
        updateNewHint();
        dlg.showModal();
    });
    function updateNewHint() {
        $("newWidthPx").textContent = `(${Number($("newWidthBytes").value) * 8} px)`;
    }
    $("newWidthBytes").addEventListener("input", updateNewHint);
    $("newCancel").addEventListener("click", () => dlg.close());
    $("newCreate").addEventListener("click", () => {
        const wb = Math.max(1, Math.min(40, Number($("newWidthBytes").value) || 6));
        const hr = Math.max(1, Math.min(262, Number($("newHeightRows").value) || 64));
        History.snapshotBeforeChange();
        doc = createDocument(wb, hr);
        grid.setDoc(doc);
        renderLayerList();
        redraw();
        dlg.close();
    });
}

// ---------- Import Image dialog ----------
function setupImportDialog() {
    const dlg = $("dlgImport");
    $("btnImportImage").addEventListener("click", () => {
        pendingImportImg = null;
        $("importFile").value = "";
        $("importPreview").width = 0; $("importPreview").height = 0;
        updateModeVisibility();
        dlg.showModal();
    });
    $("importCancel").addEventListener("click", () => dlg.close());

    function updateModeVisibility() {
        const lineArt = $("importLineArt").checked;
        $("importLineArtOptions").style.display = lineArt ? "" : "none";
        $("importPhotoOptions").style.display = lineArt ? "none" : "";
    }

    async function updatePreview() {
        if (!pendingImportImg) return;
        const result = $("importLineArt").checked
            ? ImageImport.convertLineArt(pendingImportImg, doc, { rowScale: Number($("importRowScale").value) })
            : ImageImport.convert(pendingImportImg, doc, { fitMode: $("importFit").value, dither: $("importDither").checked });
        pendingImportImg._lastResult = result;
        renderRawGridPreview($("importPreview"), doc.widthBytes, doc.heightRows, result.colorGrid, result.maskGrid);
    }

    $("importFile").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        pendingImportImg = await ImageImport.loadFile(file);
        pendingImportImg._name = file.name.replace(/\.[^.]+$/, "");
        await updatePreview();
    });
    $("importLineArt").addEventListener("change", () => { updateModeVisibility(); updatePreview(); });
    $("importRowScale").addEventListener("change", updatePreview);
    $("importFit").addEventListener("change", updatePreview);
    $("importDither").addEventListener("change", updatePreview);

    $("importApply").addEventListener("click", () => {
        if (!pendingImportImg || !pendingImportImg._lastResult) return;
        History.snapshotBeforeChange();
        const layer = Doc.addLayer(doc, pendingImportImg._name || "Image");
        layer.colorGrid.set(pendingImportImg._lastResult.colorGrid);
        layer.maskGrid.set(pendingImportImg._lastResult.maskGrid);
        renderLayerList();
        redraw();
        dlg.close();
    });
}

// ---------- Add Text dialog ----------
// Fills BOTH the <datalist> (autocomplete while typing in the text field)
// and a real <select> (a plain dropdown isn't filtered by whatever text
// happens to already be in the field, unlike a datalist - browsing the
// full list needs the select, since a datalist only ever suggests options
// that match the current text as a substring).
function setFontChoices(families) {
    const sorted = [...families].sort((a, b) => a.localeCompare(b));
    const datalist = $("fontList");
    datalist.innerHTML = "";
    for (const family of sorted) {
        const opt = document.createElement("option");
        opt.value = family;
        datalist.appendChild(opt);
    }
    const select = $("textFontPicker");
    select.innerHTML = "";
    for (const family of sorted) {
        const opt = document.createElement("option");
        opt.value = family;
        opt.textContent = family;
        select.appendChild(opt);
    }
    const current = $("textFont").value;
    if (sorted.includes(current)) select.value = current;
}

// Fonts you've explicitly typed and asked to remember - covers anything
// neither detection path catches (a name FontDetect's fixed candidate
// list doesn't include, or Local Font Access mangled/omitted). Persisted
// in localStorage so it survives reloads; a per-browser convenience only,
// never anything the editor depends on reading back reliably.
function getCustomFonts() {
    try {
        return JSON.parse(localStorage.getItem("atariEditorCustomFonts") || "[]");
    } catch { return []; }
}
function addCustomFont(name) {
    if (!name || !name.trim()) return;
    try {
        const list = getCustomFonts();
        if (!list.includes(name)) {
            list.push(name);
            localStorage.setItem("atariEditorCustomFonts", JSON.stringify(list));
        }
    } catch { /* localStorage unavailable (private mode etc) - just skip remembering */ }
}

function populateDetectedFonts() {
    const detected = FontDetect.detectAll();
    setFontChoices([...detected, ...getCustomFonts()]);
    $("systemFontsStatus").textContent = `Detected ${detected.length} installed fonts (no permission needed).`;
}

function setupTextDialog() {
    const dlg = $("dlgText");
    $("textFontPicker").addEventListener("change", () => {
        $("textFont").value = $("textFontPicker").value;
        $("textFont").dispatchEvent(new Event("input"));
    });
    $("btnRememberFont").addEventListener("click", () => {
        const name = $("textFont").value;
        addCustomFont(name);
        setFontChoices([...FontDetect.detectAll(), ...getCustomFonts()]);
        $("systemFontsStatus").textContent = `Remembered "${name}" for next time.`;
    });
    $("btnAddText").addEventListener("click", () => {
        populateDetectedFonts();
        updateTextPreview();
        dlg.showModal();
    });
    $("textCancel").addEventListener("click", () => dlg.close());

    function currentTextOptions() {
        return {
            fontFamily: $("textFont").value || "sans-serif",
            fontSizePx: Number($("textSize").value) || 16,
            bold: $("textBold").checked,
            italic: $("textItalic").checked,
        };
    }

    function updateTextPreview() {
        const text = $("textInput").value;
        pendingTextRender = TextTool.render(text, currentTextOptions());
        const canvasEl = $("textPreview");
        const cellH = 6, cellW = 12;
        canvasEl.width = pendingTextRender.widthPx * cellW;
        canvasEl.height = pendingTextRender.heightPx * cellH;
        const ctx = canvasEl.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.fillStyle = Palette.cssForByte(currentColorByte);
        for (let y = 0; y < pendingTextRender.heightPx; y++) {
            for (let x = 0; x < pendingTextRender.widthPx; x++) {
                const cov = pendingTextRender.coverage[y * pendingTextRender.widthPx + x];
                if (cov < 128) continue;
                ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
            }
        }
    }

    for (const id of ["textInput", "textFont", "textSize", "textBold", "textItalic"]) {
        $(id).addEventListener("input", updateTextPreview);
    }
    $("textCustomFont").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const family = await TextTool.loadCustomFont(file);
        $("textFont").value = family;
        updateTextPreview();
    });

    $("btnLoadSystemFonts").addEventListener("click", async () => {
        const status = $("systemFontsStatus");
        if (!("queryLocalFonts" in window)) {
            status.textContent = "Full enumeration needs Chrome/Edge - using the " + FontDetect.detectAll().length + " detected fonts instead.";
            return;
        }
        status.textContent = "Requesting font access…";
        try {
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const perm = await navigator.permissions.query({ name: "local-fonts" });
                    if (perm.state === "denied") {
                        status.textContent = "Font access is blocked for this site - click the tune/lock icon in the address bar, " +
                            "reset the Fonts permission, then reload the page and try again. Using detected fonts for now.";
                        return;
                    }
                } catch (permErr) { /* permissions.query for local-fonts isn't universally supported - ignore and try anyway */ }
            }
            const fonts = await window.queryLocalFonts();
            const families = [...new Set(fonts.map((f) => f.family))];
            if (families.length === 0) {
                status.textContent = "Chrome granted access but reported 0 fonts (can happen in a sandboxed/managed browser profile) - using detected fonts instead.";
                return;
            }
            const merged = [...new Set([...FontDetect.detectAll(), ...getCustomFonts(), ...families])];
            setFontChoices(merged);
            status.textContent = `Loaded ${families.length} system fonts via Chrome (${merged.length} total - use the "Browse fonts" dropdown to see them all).`;
        } catch (err) {
            status.textContent = `Couldn't get full font access (${err.name}: ${err.message}) - using detected fonts instead.`;
        }
    });

    $("textApply").addEventListener("click", () => {
        if (!pendingTextRender) return;
        History.snapshotBeforeChange();
        const layer = Doc.addLayer(doc, `Text: ${$("textInput").value.slice(0, 16)}`);
        TextTool.stamp(doc, layer, pendingTextRender, Number($("textX").value) || 0, Number($("textY").value) || 0, currentColorByte);
        renderLayerList();
        redraw();
        dlg.close();
    });
}

// ---------- Export dialog ----------
function setupExportDialog() {
    const dlg = $("dlgExport");
    function populateScope() {
        const sel = $("exportScope");
        sel.innerHTML = '<option value="all">All layers</option>';
        doc.layers.forEach((layer, i) => {
            const opt = document.createElement("option");
            opt.value = String(i);
            opt.textContent = layer.name;
            sel.appendChild(opt);
        });
    }
    function scopeName() {
        const v = $("exportScope").value;
        return v === "all" ? "sprites" : (doc.layers[Number(v)].name || "sprite");
    }
    function updateOutput() {
        const v = $("exportScope").value;
        const body = v === "all"
            ? ExportC.allLayersToC(doc)
            : ExportC.layerToC(doc, doc.layers[Number(v)]);
        $("exportOutput").value = ExportC.toHeader(scopeName(), body);
    }
    $("btnExport").addEventListener("click", () => { populateScope(); updateOutput(); dlg.showModal(); });
    $("exportScope").addEventListener("change", updateOutput);
    $("exportClose").addEventListener("click", () => dlg.close());
    $("exportCopy").addEventListener("click", () => navigator.clipboard.writeText($("exportOutput").value));
    $("exportDownload").addEventListener("click", () => {
        const suggestedName = scopeName().replace(/[^a-z0-9_]+/gi, "_") + ".h";
        saveTextFileAs($("exportOutput").value, suggestedName, "text/plain", ".h", "C Header File");
    });
}

// ---------- boot ----------
function main() {
    grid = new GridCanvas($("gridCanvas"), doc);
    setupCanvasEvents();
    setupToolButtons();
    buildPaletteGrid();
    setCurrentColor(0x1a);
    renderLayerList();
    redraw();

    $("zoomRange").addEventListener("input", (e) => { grid.setZoom(Number(e.target.value)); redraw(); });
    setupZoomWheel();
    $("chkGroupLines").addEventListener("change", (e) => { grid.showGroupLines = e.target.checked; redraw(); });
    $("chkRowLines").addEventListener("change", (e) => { grid.showRowLines = e.target.checked; redraw(); });

    setupNewDialog();
    setupImportDialog();
    setupTextDialog();
    setupExportDialog();
    setupLayerPanel();
    setupHistory();
    setupMoveNudge();
    setupContextMenu();
    setupProjectFile();
}

main();
