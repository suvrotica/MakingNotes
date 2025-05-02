// --- Configuration ---
const STROKE_WIDTH = 3;
const ERASER_WIDTH = 20;
const LOCAL_STORAGE_KEY = 'handwritingEditorCanvas';
const LOCAL_STORAGE_DARK_MODE_KEY = 'handwritingEditorDarkMode';
const ZOOM_SENSITIVITY = 1.05; // How much to zoom per wheel step or gesture change
const MIN_ZOOM = 0.05; // Minimum zoom scale
const MAX_ZOOM = 30; // Maximum zoom scale

// --- Global Variables ---
let stage = null;
let layer = null;
let isDrawing = false;
let currentTool = 'pencil'; // 'pencil' or 'eraser'
let currentLine = null;
let strokeColor = '#333333'; // Default color (Dark Charcoal)
let isDarkMode = false;
let activePointerType = null; // Track the type of pointer currently interacting ('pen', 'touch', 'mouse')
let touchGestureActive = false; // Flag to indicate if a multi-touch gesture is happening

// --- Initialization ---
function initializeEditor() {
    console.log("Initializing editor...");

    // Explicitly check if Konva library is loaded and defined
    if (typeof Konva === 'undefined') {
        console.error("FATAL: Konva library (Konva object) is not defined. Ensure konva.min.js is loaded correctly before script.js.");
        displayError("Error: Required drawing library (Konva) failed to load. Please check network connection or script order.");
        return; // Stop execution if Konva is missing
    }

    const container = document.getElementById('canvas-container');
    if (!container) {
        console.error("FATAL: Canvas container element '#canvas-container' not found!");
        displayError("Error: Could not find the canvas area. Editor cannot start.");
        return;
    }

    // Check container dimensions
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    console.log(`Container dimensions: ${containerWidth}x${containerHeight}`);

    if (containerWidth <= 0 || containerHeight <= 0) {
        console.warn("Canvas container has zero width or height. Retrying in 100ms...");
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => initializeEditorRetry(container));
        } else {
            setTimeout(() => initializeEditorRetry(container), 100);
        }
        return;
    }

    try {
        // Create Konva Stage
        console.log("Creating Konva Stage...");
        stage = new Konva.Stage({
            container: 'canvas-container',
            width: containerWidth,
            height: containerHeight,
            draggable: false, // Disable default dragging initially, enable based on pointer type
        });
        console.log("Konva Stage created.");

        // Initialize Dark Mode FIRST
        initializeDarkMode();

        // Attempt to load saved data
        let loadedSuccessfully = loadFromLocalStorage();

        if (!loadedSuccessfully) {
            console.log("Creating new default Layer...");
            layer = new Konva.Layer();
            stage.add(layer);
            console.log("Default Layer created and added to stage.");
        } else {
             if (stage && stage.getLayers().length > 0) {
                 layer = stage.getLayers()[0];
             } else {
                 console.warn("Loaded stage has no layers. Creating default.");
                 layer = new Konva.Layer();
                 stage.add(layer);
             }
        }

        // Add event listeners
        console.log("Setting up event listeners...");
        setupEventListeners();
        console.log("Setting up toolbar...");
        setupToolbar();
        console.log("Setting up touch gestures...");
        setupTouchGestures(); // Setup gestures AFTER main pointer listeners

        // Handle window resize
        window.addEventListener('resize', resizeCanvas);
        console.log("Attaching resize listener.");

        // Initial draw
        console.log("Performing initial stage draw...");
        stage.batchDraw();
        console.log("Initialization complete.");

    } catch (error) {
        console.error("FATAL ERROR during Konva initialization or setup:", error);
        if (error instanceof ReferenceError && error.message.includes('Konva')) {
             displayError(`Error: Konva library seems to have unloaded or failed. ${error.message}.`);
        } else {
             displayError(`An error occurred during editor setup: ${error.message}. Check console (F12).`);
        }
    }
}

// Retry initialization
function initializeEditorRetry(container) {
     const containerWidth = container.offsetWidth;
     const containerHeight = container.offsetHeight;
     if (containerWidth <= 0 || containerHeight <= 0) {
          console.error("FATAL: Container dimensions still zero after retry. Cannot initialize Konva.");
          displayError("Error: Canvas area failed to get size. Editor cannot start.");
     } else {
          console.log("Container dimensions ok on retry. Proceeding with initialization.");
          initializeEditor();
     }
}


// --- Display Error Message ---
function displayError(message) {
    const container = document.getElementById('canvas-container');
    if (container) {
        container.innerHTML = `<div class="error-message">${message}</div>`;
    }
    console.error("DISPLAYED ERROR:", message);
}


// --- Canvas Resizing ---
function resizeCanvas() {
    if (!stage || !document.getElementById('canvas-container')) {
        console.warn("Resize skipped: Stage or container not ready.");
        return;
    }
    const container = document.getElementById('canvas-container');
    try {
        const newSize = { width: container.offsetWidth, height: container.offsetHeight };
        if (newSize.width === stage.width() && newSize.height === stage.height()) return;
        console.log(`Resizing canvas to ${newSize.width}x${newSize.height}`);
        stage.width(newSize.width);
        stage.height(newSize.height);
        stage.batchDraw();
        console.log("Canvas resize processed.");
    } catch (error) {
        console.error("Error during canvas resize:", error);
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    if (!stage) return;
    try {
        stage.off('pointerdown pointermove pointerup pointerleave'); // Clear previous
        stage.on('pointerdown', handlePointerDown);
        stage.on('pointermove', handlePointerMove);
        stage.on('pointerup pointerleave', handlePointerUp); // Use pointerleave as well
        console.log("Pointer listeners attached.");
    } catch (error) {
        console.error("Error setting up drawing listeners:", error);
        displayError("Error setting up drawing controls.");
    }
}

// --- Toolbar Setup ---
function setupToolbar() {
    try {
        // Tool selection
        document.getElementById('pencil-tool')?.addEventListener('click', () => selectTool('pencil'));
        document.getElementById('eraser-tool')?.addEventListener('click', () => selectTool('eraser'));

        // Color selection
        document.querySelectorAll('.color-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const newColor = e.target.dataset.color;
                if(newColor) {
                    strokeColor = newColor;
                    updateColorButtons(e.target);
                    if (currentTool === 'eraser') {
                        selectTool('pencil'); // Switch back to pencil if eraser was active
                    }
                    console.log(`Color selected: ${strokeColor}`);
                }
            });
        });
        updateColorButtons(document.querySelector(`.color-button[data-color="${strokeColor}"]`));

        // Action buttons
        document.getElementById('save-local')?.addEventListener('click', saveToLocalStorage);
        document.getElementById('clear-canvas')?.addEventListener('click', clearCanvas);
        document.getElementById('export-png')?.addEventListener('click', () => exportCanvas('png'));
        document.getElementById('export-jpg')?.addEventListener('click', () => exportCanvas('jpeg'));
        document.getElementById('export-svg')?.addEventListener('click', exportCanvasSVG);
        document.getElementById('export-html')?.addEventListener('click', exportCanvasHTML);
        document.getElementById('dark-mode-toggle')?.addEventListener('click', toggleDarkMode);

        selectTool(currentTool); // Set initial tool state visually
        console.log("Toolbar listeners attached.");
    } catch (error) {
        console.error("Error setting up toolbar:", error);
        displayError("Error setting up toolbar controls.");
    }
}

// Helper to update active state of color buttons
function updateColorButtons(activeButton) {
     document.querySelectorAll('.color-button').forEach(btn => btn.classList.remove('active'));
     if (activeButton) {
         activeButton.classList.add('active');
     }
}

// --- Tool Selection Logic ---
function selectTool(tool) {
    const toolButton = document.getElementById(`${tool}-tool`);
    const container = document.getElementById('canvas-container');
    if (!toolButton || !container) return;

    currentTool = tool;
    document.querySelectorAll('.tool-button').forEach(btn => btn.classList.remove('active'));
    toolButton.classList.add('active');
    container.style.cursor = (tool === 'eraser') ? 'cell' : 'crosshair';
    console.log(`Tool selected: ${tool}`);
}

// --- Drawing Event Handlers ---
function handlePointerDown(e) {
    if (!stage || !layer || touchGestureActive) return; // Ignore if stage/layer missing or gesture active

    const pointerType = e.evt.pointerType || 'mouse'; // Default to mouse if undefined
    console.log(`Pointer Down: type=${pointerType}, button=${e.evt.button}`);
    activePointerType = pointerType; // Store the active pointer type

    // --- Pen Input: Start Drawing ---
    if (pointerType === 'pen') {
        isDrawing = true;
        stage.draggable(false); // Disable stage dragging during pen drawing
        const pos = stage.getPointerPosition();
        if (!pos) { isDrawing = false; return; }
        const transform = layer.getAbsoluteTransform().copy().invert();
        const relativePos = transform.point(pos);
        startLine(relativePos); // Call helper function to create line
    }
    // --- Touch Input: Start Panning (single touch) ---
    else if (pointerType === 'touch') {
        isDrawing = false; // Ensure drawing is off for touch
        // Only enable dragging for single touch, gestures handled separately
        if (e.evt.touches && e.evt.touches.length === 1) {
             console.log("Touch down: Enabling drag");
             stage.draggable(true); // Enable stage dragging for single touch pan
             stage.startDrag(e); // Explicitly start drag for touch panning
        } else {
             stage.draggable(false); // Disable drag if multi-touch starts
        }
    }
    // --- Mouse Input: Start Drawing (primary button) ---
    else if (pointerType === 'mouse' && e.evt.button === 0) {
        isDrawing = true;
        stage.draggable(false); // Disable stage dragging during mouse drawing
        const pos = stage.getPointerPosition();
        if (!pos) { isDrawing = false; return; }
        const transform = layer.getAbsoluteTransform().copy().invert();
        const relativePos = transform.point(pos);
        startLine(relativePos);
    }
    // --- Other Mouse Buttons: Allow potential dragging ---
     else if (pointerType === 'mouse' && e.evt.button !== 0) {
         isDrawing = false;
         // Allow dragging with middle/right mouse button if needed
         // stage.draggable(true);
         // stage.startDrag(e);
     }
     else {
         isDrawing = false; // Ensure drawing is off otherwise
     }
}

// Helper function to create the initial line/eraser shape
function startLine(relativePos) {
    try {
        if (currentTool === 'pencil') {
            currentLine = new Konva.Line({
                stroke: strokeColor,
                strokeWidth: STROKE_WIDTH,
                globalCompositeOperation: 'source-over',
                lineCap: 'round', lineJoin: 'round',
                points: [relativePos.x, relativePos.y, relativePos.x, relativePos.y],
                tension: 0.1
            });
        } else if (currentTool === 'eraser') {
            currentLine = new Konva.Line({
                stroke: 'white', strokeWidth: ERASER_WIDTH,
                globalCompositeOperation: 'destination-out',
                lineCap: 'round', lineJoin: 'round',
                points: [relativePos.x, relativePos.y, relativePos.x, relativePos.y],
            });
        }
        if (currentLine) {
            layer.add(currentLine);
        }
    } catch (error) {
        console.error("Error creating line/eraser shape:", error);
        isDrawing = false;
        currentLine = null;
    }
}


function handlePointerMove(e) {
    // Only draw if isDrawing is true AND the pointer type is pen or mouse
    if (!isDrawing || !currentLine || !stage || !layer || activePointerType === 'touch') {
        // If it's a touch move, let Konva handle dragging if stage.draggable is true
        // Or let gesture handler handle it if touchGestureActive is true
        return;
    }

    // Prevent default actions (like text selection) during pen/mouse drawing drag
    if (e.evt.cancelable) {
       e.evt.preventDefault();
    }

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const transform = layer.getAbsoluteTransform().copy().invert();
    const relativePos = transform.point(pos);

    try {
        const newPoints = currentLine.points().concat([relativePos.x, relativePos.y]);
        currentLine.points(newPoints);
        layer.batchDraw();
    } catch (error) {
        console.error("Error during pointer move drawing:", error);
    }
}

function handlePointerUp(e) {
    const pointerType = e.evt.pointerType || 'mouse';
    console.log(`Pointer Up: type=${pointerType}`);

    if (isDrawing) {
        isDrawing = false;
        currentLine = null; // Reset current line reference
        console.log("Drawing stopped.");
    }

    // Reset active pointer type
    activePointerType = null;

    // If stage dragging was potentially enabled for touch, disable it again
    // unless a gesture is still active (though gestures should reset on touchend)
    if (pointerType === 'touch' && !touchGestureActive) {
         console.log("Touch up: Disabling drag");
         stage.draggable(false); // Disable dragging after touch pan ends
         stage.stopDrag(); // Ensure drag stops
    } else if (pointerType === 'pen' || pointerType === 'mouse') {
         // Ensure dragging is disabled after drawing
         stage.draggable(false);
    }

    // Autosave could potentially go here
}


// --- Touch Gestures for Zoom and Rotate ---
function setupTouchGestures() {
    if (!stage) return;
    try {
        let lastDist = 0;
        let lastCenter = null;
        let lastAngleRad = 0;

        // --- Touch Start (for Gesture Detection) ---
        stage.on('touchstart', function(e) {
             // Check specifically for multi-touch start
             if (e.evt.touches && e.evt.touches.length >= 2) {
                 console.log("Gesture Start (touchstart with >= 2 touches)");
                 touchGestureActive = true; // Set gesture flag
                 isDrawing = false; // Ensure drawing stops
                 currentLine = null;
                 stage.draggable(false); // Disable panning during gesture
                 stage.stopDrag(); // Stop any existing drag

                 // Initialize gesture parameters
                 const touch1 = e.evt.touches[0];
                 const touch2 = e.evt.touches[1];
                 const p1 = { x: touch1.clientX, y: touch1.clientY };
                 const p2 = { x: touch2.clientX, y: touch2.clientY };
                 lastCenter = getCenter(p1, p2);
                 lastDist = getDistance(p1, p2);
                 lastAngleRad = getAngle(p1, p2);
             } else {
                 touchGestureActive = false; // Reset flag if not multi-touch start
             }
        });


        // --- Touch Move (for Pinch/Rotate) ---
        stage.on('touchmove', function (e) {
            // Only process if a multi-touch gesture is active
            if (!touchGestureActive || !stage) return;

            const touch1 = e.evt.touches[0];
            const touch2 = e.evt.touches[1];

            // Ensure still two fingers
            if (touch1 && touch2) {
                 if (e.evt.cancelable) e.evt.preventDefault(); // Prevent browser actions

                 const p1 = { x: touch1.clientX, y: touch1.clientY };
                 const p2 = { x: touch2.clientX, y: touch2.clientY };
                 const newCenter = getCenter(p1, p2); // Center in screen coordinates

                 if (!lastCenter) { // Should be initialized by touchstart, but check anyway
                     lastCenter = newCenter;
                     lastDist = getDistance(p1, p2);
                     lastAngleRad = getAngle(p1, p2);
                     return;
                 }

                 const newDist = getDistance(p1, p2);
                 const newAngleRad = getAngle(p1, p2);

                 // Rotation
                 const angleDeltaRad = newAngleRad - lastAngleRad;
                 rotateStage(angleDeltaRad, lastCenter);

                 // Zooming
                 if (lastDist > 1) {
                     const scaleFactor = newDist / lastDist;
                     const currentScale = stage.scaleX();
                     let newScale = currentScale * scaleFactor;
                     newScale = Math.max(MIN_ZOOM, Math.min(newScale, MAX_ZOOM));
                     zoomStage(newScale, lastCenter);
                 }

                 // Update state for the next frame
                 lastDist = newDist;
                 lastAngleRad = newAngleRad;
                 // Keep using the initial center for stability
                 // lastCenter = newCenter;

                 stage.batchDraw();

            } else {
                // If fingers reduced below 2 during move, end gesture
                touchGestureActive = false;
                lastCenter = null;
                 console.log("Gesture interrupted (finger lifted during move)");
            }
        });

        // --- Touch End (Reset Gesture State) ---
        stage.on('touchend', function (e) {
            // Reset gesture tracking state regardless of finger count on end
            if (touchGestureActive) {
                 console.log("Gesture End (touchend)");
            }
            touchGestureActive = false;
            lastDist = 0;
            lastCenter = null;
            lastAngleRad = 0;
            // Ensure dragging is off after gesture ends
            stage.draggable(false);
        });

        // --- Desktop Zooming (Mouse Wheel) ---
        stage.on('wheel', function(e) {
            if (!stage || touchGestureActive) return; // Ignore wheel during touch gesture
            e.evt.preventDefault();

            const oldScale = stage.scaleX();
            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const delta = e.evt.deltaY;
            const scaleFactor = delta < 0 ? ZOOM_SENSITIVITY : 1 / ZOOM_SENSITIVITY;
            let newScale = oldScale * scaleFactor;
            newScale = Math.max(MIN_ZOOM, Math.min(newScale, MAX_ZOOM));

            zoomStage(newScale, pointer);
            stage.batchDraw();
        });
        console.log("Touch/Wheel listeners attached.");
    } catch (error) {
        console.error("Error setting up touch/wheel gestures:", error);
        displayError("Error setting up zoom/rotate controls.");
    }
}

// --- Gesture Helper Functions ---
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}
function getCenter(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}
function getAngle(p1, p2) {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x); // Radians
}

// --- Zooming Logic ---
function zoomStage(newScale, center) {
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = center || stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
}

// --- Rotation Logic ---
function rotateStage(angleDeltaRad, center) {
    if (!stage) return;
    const currentRotationDeg = stage.rotation();
    const angleDeltaDeg = angleDeltaRad * (180 / Math.PI);
    const newRotationDeg = currentRotationDeg + angleDeltaDeg;

    const pivotScreen = center || { x: stage.width() / 2, y: stage.height() / 2 };
    if (!pivotScreen) return;

    const scale = stage.scaleX();
    const pivotRelative = {
        x: (pivotScreen.x - stage.x()) / scale,
        y: (pivotScreen.y - stage.y()) / scale,
    };

    stage.offset(pivotRelative);
    stage.rotation(newRotationDeg);
    stage.position(pivotScreen); // Position the offset point (pivot) at the screen center
}


// --- Saving and Loading ---
function saveToLocalStorage() {
    if (!stage) { alert("Cannot save: Editor not initialized."); return; }
    try {
        const json = stage.toJSON();
        localStorage.setItem(LOCAL_STORAGE_KEY, json);
        console.log("Canvas saved to localStorage.");
        alert("Drawing saved locally!");
    } catch (error) {
        console.error("Error saving to localStorage:", error);
        if (error.name === 'QuotaExceededError') {
            alert("Could not save drawing. Local storage is full. Try exporting your work.");
        } else {
            alert(`Could not save drawing: ${error.message}`);
        }
    }
}

// Returns true if loading was successful (or no data), false if error occurred
function loadFromLocalStorage() {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (json) {
        console.log("Found saved data in localStorage. Attempting to load...");
        try {
            if (!stage) { console.error("Stage not available during load attempt."); return false; }

            const loadedStage = Konva.Node.create(json, 'canvas-container');
            if (!loadedStage || !(loadedStage instanceof Konva.Stage)) {
                 throw new Error("Failed to create Konva Stage from JSON data.");
            }
            stage.destroy(); // Destroy the old empty stage
            stage = loadedStage; // Assign the newly loaded stage globally
            stage.draggable(false); // Ensure loaded stage is not draggable by default

            if (stage.getLayers().length > 0) {
                layer = stage.getLayers()[0];
                console.log("Stage and Layer loaded successfully from JSON.");
                stage.batchDraw();
                return true;
            } else {
                console.warn("Loaded stage has no layers. Creating a default layer.");
                layer = new Konva.Layer();
                stage.add(layer);
                stage.batchDraw();
                return true;
            }

        } catch (error) {
            console.error("Error loading canvas from localStorage JSON:", error);
            alert("Could not load saved drawing. The data might be corrupted. Starting with a blank canvas.");
            if (!stage || !(stage instanceof Konva.Stage)) {
                 console.log("Recreating stage after load failure.");
                 const container = document.getElementById('canvas-container');
                 if (!container) { displayError("Critical error during loading recovery."); return false; }
                 stage = new Konva.Stage({
                     container: 'canvas-container',
                     width: container.offsetWidth, height: container.offsetHeight,
                     draggable: false, // Not draggable by default
                 });
            }
            if (!layer || !stage.getLayers().includes(layer)) {
                 layer = new Konva.Layer();
                 stage.add(layer);
            }
            stage.batchDraw();
            return false;
        }
    } else {
        console.log("No saved data found in localStorage.");
        if (stage && stage.getLayers().length === 0) {
             layer = new Konva.Layer();
             stage.add(layer);
        }
        return true;
    }
}

function clearCanvas() {
    if (!stage || !layer) { alert("Cannot clear: Editor not initialized."); return; }
    if (confirm("Are you sure you want to clear the canvas and remove the saved version? This cannot be undone.")) {
        try {
            layer.destroyChildren();
            stage.position({ x: 0, y: 0 });
            stage.scale({ x: 1, y: 1 });
            stage.rotation(0);
            stage.offset({ x: 0, y: 0 });
            stage.batchDraw();
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            console.log("Canvas cleared, transformations reset, and local storage removed.");
        } catch (error) {
            console.error("Error clearing canvas:", error);
            alert(`Failed to clear canvas: ${error.message}`);
        }
    }
}

// --- Exporting ---
function exportCanvas(format = 'png') {
    if (!stage) { alert("Cannot export: Editor not initialized."); return; }
    try {
        const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
        const dataURL = stage.toDataURL({ mimeType: mimeType, quality: 0.9, pixelRatio: 2 });
        if (!dataURL) throw new Error("Stage returned empty data URL.");
        downloadURI(dataURL, `handwriting.${format}`);
        console.log(`Canvas exported as ${format}.`);
    } catch (error) {
        console.error(`Error exporting canvas as ${format}:`, error);
        alert(`Failed to export as ${format}. Error: ${error.message}`);
    }
}

function exportCanvasSVG() {
    if (!stage || !layer) { alert("Cannot export: Editor not initialized."); return; }
    console.warn("SVG export is basic and does NOT accurately reflect stage transformations (pan, zoom, rotate). It exports raw layer content.");
    try {
        const lines = layer.find('Line');
        const bgColor = isDarkMode ? '#343a40' : '#ffffff';
        const bounds = layer.getClientRect({ skipTransform: false });
        const viewBoxWidth = (bounds && bounds.width > 0) ? bounds.width : stage.width();
        const viewBoxHeight = (bounds && bounds.height > 0) ? bounds.height : stage.height();
        const viewBoxX = (bounds && isFinite(bounds.x)) ? bounds.x : 0;
        const viewBoxY = (bounds && isFinite(bounds.y)) ? bounds.y : 0;

        let svgData = `<svg width="${viewBoxWidth}" height="${viewBoxHeight}" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: ${bgColor};">`;
        svgData += ``;

        lines.forEach(line => {
            if (!line.isVisible() || line.globalCompositeOperation() === 'destination-out') return;
            const points = line.points();
            if (!points || points.length < 4) return;
            const color = line.stroke(); const width = line.strokeWidth();
            const linecap = line.lineCap(); const linejoin = line.lineJoin();
            let pointsString = "";
            for (let i = 0; i < points.length; i += 2) { pointsString += `${points[i].toFixed(2)},${points[i+1].toFixed(2)} `; }
            svgData += `<polyline points="${pointsString.trim()}" stroke="${color}" stroke-width="${width}" stroke-linecap="${linecap}" stroke-linejoin="${linejoin}" fill="none" />`;
        });
        svgData += `</svg>`;

        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        downloadURI(url, 'handwriting_export.svg');
        URL.revokeObjectURL(url);
        console.log("Canvas exported as SVG (basic, no transforms).");
    } catch (error) {
        console.error("Error exporting canvas as SVG:", error);
        alert(`Failed to export as SVG. Error: ${error.message}`);
    }
}

function exportCanvasHTML() {
    if (!stage || !layer) { alert("Cannot export: Editor not initialized."); return; }
    console.warn("HTML export uses the basic SVG export and does NOT accurately reflect stage transformations.");
    try {
        const lines = layer.find('Line');
        const bgColor = isDarkMode ? '#343a40' : '#ffffff';
        const bounds = layer.getClientRect({ skipTransform: false });
        const viewBoxWidth = (bounds && bounds.width > 0) ? bounds.width : stage.width();
        const viewBoxHeight = (bounds && bounds.height > 0) ? bounds.height : stage.height();
        const viewBoxX = (bounds && isFinite(bounds.x)) ? bounds.x : 0;
        const viewBoxY = (bounds && isFinite(bounds.y)) ? bounds.y : 0;

        let svgContent = `<svg id="embedded-svg" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="display: block; width: 100%; height: 100%; background-color: ${bgColor};">`;
        svgContent += ``;
        lines.forEach(line => {
            if (!line.isVisible() || line.globalCompositeOperation() === 'destination-out') return;
            const points = line.points(); if (!points || points.length < 4) return;
            const color = line.stroke(); const width = line.strokeWidth();
            const linecap = line.lineCap(); const linejoin = line.lineJoin();
            let pointsString = "";
            for (let i = 0; i < points.length; i += 2) { pointsString += `${points[i].toFixed(2)},${points[i+1].toFixed(2)} `; }
            svgContent += `<polyline points="${pointsString.trim()}" stroke="${color}" stroke-width="${width}" stroke-linecap="${linecap}" stroke-linejoin="${linejoin}" fill="none" />`;
        });
        svgContent += `</svg>`;

        const htmlContent = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Handwriting Export</title><style>html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; } body { display: flex; justify-content: center; align-items: center; background-color: #e9ecef; } #svg-container { width: 90vw; height: 90vh; border: 1px solid #ced4da; background-color: ${bgColor}; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }</style></head><body><div id="svg-container">${svgContent}</div></body></html>`;

        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        downloadURI(url, 'handwriting_export.html');
        URL.revokeObjectURL(url);
        console.log("Canvas exported as HTML with embedded SVG.");
    } catch (error) {
        console.error("Error exporting canvas as HTML:", error);
        alert(`Failed to export as HTML. Error: ${error.message}`);
    }
}

// Helper function for triggering downloads
function downloadURI(uri, name) {
    try {
        const link = document.createElement('a');
        link.download = name; link.href = uri;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (error) {
        console.error("Error triggering download:", error);
        alert(`Could not start download for ${name}.`);
    }
}

// --- Dark Mode ---
function initializeDarkMode() {
    const savedMode = localStorage.getItem(LOCAL_STORAGE_DARK_MODE_KEY);
    const toggleButton = document.getElementById('dark-mode-toggle');
    if (savedMode === 'enabled') {
        document.body.classList.add('dark'); isDarkMode = true;
        if (toggleButton) { toggleButton.textContent = '☀️ Light'; toggleButton.title = 'Toggle Light Mode'; }
    } else {
        document.body.classList.remove('dark'); isDarkMode = false;
        if (toggleButton) { toggleButton.textContent = '🌙 Dark'; toggleButton.title = 'Toggle Dark Mode'; }
    }
    console.log(`Dark mode initialized: ${isDarkMode}`);
}

function toggleDarkMode() {
    try {
        const body = document.body; const button = document.getElementById('dark-mode-toggle');
        body.classList.toggle('dark'); isDarkMode = body.classList.contains('dark');
        if (isDarkMode) {
            localStorage.setItem(LOCAL_STORAGE_DARK_MODE_KEY, 'enabled');
            if (button) { button.textContent = '☀️ Light'; button.title = 'Toggle Light Mode'; }
        } else {
            localStorage.setItem(LOCAL_STORAGE_DARK_MODE_KEY, 'disabled');
            if (button) { button.textContent = '🌙 Dark'; button.title = 'Toggle Dark Mode'; }
        }
        console.log(`Dark mode toggled: ${isDarkMode}`);
    } catch (error) {
        console.error("Error toggling dark mode:", error);
        alert(`Failed to toggle dark mode: ${error.message}`);
    }
}

// --- Start the application ---
document.addEventListener('DOMContentLoaded', initializeEditor);

