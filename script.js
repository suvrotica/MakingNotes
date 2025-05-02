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

// --- Initialization ---
function initializeEditor() {
    console.log("Initializing editor...");

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
        // Use requestAnimationFrame for better timing if possible, fallback to setTimeout
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
            draggable: true, // Panning enabled by default
        });
        console.log("Konva Stage created.");

        // Initialize Dark Mode FIRST (affects loading background)
        initializeDarkMode();

        // Attempt to load saved data
        let loadedSuccessfully = loadFromLocalStorage();

        if (!loadedSuccessfully) {
            console.log("Creating new default Layer...");
            layer = new Konva.Layer();
            stage.add(layer);
            console.log("Default Layer created and added to stage.");
        } else {
             // Ensure layer is assigned even if loaded
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
        setupToolbar(); // Setup toolbar AFTER potential load and dark mode init
        console.log("Setting up touch gestures...");
        setupTouchGestures();

        // Handle window resize
        window.addEventListener('resize', resizeCanvas);
        console.log("Attaching resize listener.");

        // Initial draw
        console.log("Performing initial stage draw...");
        stage.batchDraw();
        console.log("Initialization complete.");

    } catch (error) {
        console.error("FATAL ERROR during Konva initialization or setup:", error);
        displayError(`An error occurred during editor setup: ${error.message}. Check console (F12).`);
    }
}

// Retry initialization if container dimensions were initially zero
function initializeEditorRetry(container) {
     const containerWidth = container.offsetWidth;
     const containerHeight = container.offsetHeight;
     if (containerWidth <= 0 || containerHeight <= 0) {
          console.error("FATAL: Container dimensions still zero after retry. Cannot initialize Konva.");
          displayError("Error: Canvas area failed to get size. Editor cannot start.");
     } else {
          console.log("Container dimensions ok on retry. Proceeding with initialization.");
          initializeEditor(); // Call the main function again
     }
}


// --- Display Error Message ---
function displayError(message) {
    const container = document.getElementById('canvas-container');
    if (container) {
        // Clear container and show error
        container.innerHTML = `<div class="error-message">${message}</div>`;
    }
    // Also log to console
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

        if (newSize.width === stage.width() && newSize.height === stage.height()) {
            return; // No change
        }
        console.log(`Resizing canvas to ${newSize.width}x${newSize.height}`);

        // Update stage dimensions
        stage.width(newSize.width);
        stage.height(newSize.height);

        // No need to manually adjust position usually, Konva handles resizing
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
        // Clear previous listeners to avoid duplicates if re-initializing
        stage.off('pointerdown pointermove pointerup pointerleave');

        // Use pointer events for unified mouse/pen/touch drawing
        stage.on('pointerdown', handlePointerDown);
        stage.on('pointermove', handlePointerMove);
        // End drawing on up or if pointer leaves the stage area
        stage.on('pointerup pointerleave', handlePointerUp);
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
                    // Switch back to pencil if eraser was active when color picked
                    if (currentTool === 'eraser') {
                        selectTool('pencil');
                    }
                    console.log(`Color selected: ${strokeColor}`);
                }
            });
        });
        // Set initial active color button
        updateColorButtons(document.querySelector(`.color-button[data-color="${strokeColor}"]`));

        // Action buttons
        document.getElementById('save-local')?.addEventListener('click', saveToLocalStorage);
        document.getElementById('clear-canvas')?.addEventListener('click', clearCanvas);
        document.getElementById('export-png')?.addEventListener('click', () => exportCanvas('png'));
        document.getElementById('export-jpg')?.addEventListener('click', () => exportCanvas('jpeg')); // Use jpeg for mime type
        document.getElementById('export-svg')?.addEventListener('click', exportCanvasSVG);
        document.getElementById('export-html')?.addEventListener('click', exportCanvasHTML);
        document.getElementById('dark-mode-toggle')?.addEventListener('click', toggleDarkMode);

        // Set initial tool state visually
        selectTool(currentTool); // Ensure correct button is active

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

    if (!toolButton) {
        console.error(`Tool button for '${tool}' not found.`);
        return;
    }
    if (!container) {
         console.error("Canvas container not found for cursor change.");
         return;
    }

    currentTool = tool;
    // Update active state for tool buttons
    document.querySelectorAll('.tool-button').forEach(btn => btn.classList.remove('active'));
    toolButton.classList.add('active');

    // Change cursor style
    container.style.cursor = (tool === 'eraser') ? 'cell' : 'crosshair';
    console.log(`Tool selected: ${tool}`);
}

// --- Drawing Event Handlers ---
function handlePointerDown(e) {
    if (!stage || !layer) return; // Ensure stage and layer are ready

    // Ignore if not left mouse button or primary pointer (touch/pen)
    // Also ignore if touch gesture (more than 1 touch point) is active
    if ((e.evt.button !== undefined && e.evt.button !== 0) || (e.evt.pointerType === 'touch' && e.evt.touches && e.evt.touches.length > 1)) {
        isDrawing = false; // Ensure drawing flag is off
        // Allow stage dragging with other buttons/pointers if needed
        // Konva handles this automatically if draggable: true
        return;
    }

    // Prevent stage dragging ONLY when drawing/erasing starts
    // Check if the event target is the stage itself, not a shape (allows shape dragging later if needed)
    if (e.target === stage) {
         stage.stopDrag(); // Stop stage panning when drawing begins
    } else {
         // If clicking on a shape, allow shape dragging (if enabled on the shape)
         // For now, we assume clicks on shapes shouldn't start drawing
         isDrawing = false;
         return;
    }


    isDrawing = true;
    const pos = stage.getPointerPosition();
    if (!pos) {
        console.warn("Could not get pointer position on pointerdown.");
        isDrawing = false;
        return; // Exit if position is invalid
    }

    // Transform pointer position to be relative to the layer
    const transform = layer.getAbsoluteTransform().copy().invert(); // Use layer's transform
    const relativePos = transform.point(pos);

    try {
        if (currentTool === 'pencil') {
            currentLine = new Konva.Line({
                stroke: strokeColor,
                strokeWidth: STROKE_WIDTH,
                globalCompositeOperation: 'source-over', // Normal drawing
                lineCap: 'round',
                lineJoin: 'round',
                points: [relativePos.x, relativePos.y, relativePos.x, relativePos.y], // Start with a point
                tension: 0.1 // Slightly smooth the line
            });
        } else if (currentTool === 'eraser') {
            // Use destination-out for direct erasing effect
            currentLine = new Konva.Line({
                stroke: 'white', // Color doesn't matter much with destination-out
                strokeWidth: ERASER_WIDTH,
                globalCompositeOperation: 'destination-out', // Erase effect
                lineCap: 'round', // Use round cap for smoother erasing
                lineJoin: 'round',
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
    if (!isDrawing || !currentLine || !stage || !layer) {
        return; // Exit if not drawing, line doesn't exist, or stage/layer aren't ready
    }

    // Prevent default touch actions during drawing move
    if (e.evt.cancelable) {
       e.evt.preventDefault();
    }


    const pos = stage.getPointerPosition();
    if (!pos) {
        // console.warn("Could not get pointer position on pointermove."); // Can be noisy
        return; // Exit if position is invalid
    }

    // Transform pointer position to be relative to the layer
    const transform = layer.getAbsoluteTransform().copy().invert(); // Use layer's transform
    const relativePos = transform.point(pos);

    try {
        // Add the new point to the current line's points array
        const newPoints = currentLine.points().concat([relativePos.x, relativePos.y]);
        currentLine.points(newPoints);

        // Use batchDraw for better performance during drawing
        layer.batchDraw();
    } catch (error) {
        console.error("Error during pointer move:", error);
        // Optionally stop drawing if errors persist?
        // isDrawing = false;
        // currentLine = null;
    }
}

function handlePointerUp() {
    if (!isDrawing) return; // Only process if drawing was active

    isDrawing = false;
    currentLine = null; // Reset current line reference

    // Re-enable stage dragging if it was stopped
    // Konva usually handles this, but ensure draggable state is correct
    if (stage && !stage.isDragging() && stage.draggable()) {
        // No explicit action needed typically, Konva re-enables drag on pointer up
    }
    console.log("Drawing stopped.");
    // Consider saving state here periodically if needed (autosave)
}


// --- Touch Gestures for Zoom and Rotate ---
function setupTouchGestures() {
    if (!stage) return;
    try {
        let lastDist = 0;
        let lastCenter = null;
        let lastAngleRad = 0; // Store angle in radians

        // --- Touch Move for Pinch/Rotate ---
        stage.on('touchmove', function (e) {
            if (!stage) return;

            const touch1 = e.evt.touches[0];
            const touch2 = e.evt.touches[1];

            // Check if two fingers are down
            if (touch1 && touch2) {
                 // Prevent default browser actions (scroll, zoom) during gesture
                 if (e.evt.cancelable) {
                    e.evt.preventDefault();
                 }

                // Stop drawing if a two-finger gesture starts
                if (isDrawing) {
                    isDrawing = false;
                    currentLine = null;
                    console.log("Drawing interrupted by touch gesture.");
                }
                // Stop panning when zooming/rotating
                if (stage.isDragging()) {
                    stage.stopDrag();
                }

                const p1 = { x: touch1.clientX, y: touch1.clientY };
                const p2 = { x: touch2.clientX, y: touch2.clientY };
                const newCenter = getCenter(p1, p2); // Center in screen coordinates

                if (!lastCenter) {
                    // First frame of the gesture, record initial state
                    lastCenter = newCenter;
                    lastDist = getDistance(p1, p2);
                    lastAngleRad = getAngle(p1, p2);
                    return; // Wait for the next move event
                }

                // --- Calculate changes ---
                const newDist = getDistance(p1, p2);
                const newAngleRad = getAngle(p1, p2);

                // --- Rotation ---
                const angleDeltaRad = newAngleRad - lastAngleRad;
                // Rotate around the starting center of the gesture
                rotateStage(angleDeltaRad, lastCenter);

                // --- Zooming ---
                // Avoid division by zero or excessive scaling from tiny distances
                if (lastDist > 1) {
                    const scaleFactor = newDist / lastDist;
                    const currentScale = stage.scaleX();
                    let newScale = currentScale * scaleFactor;
                    // Clamp zoom level
                    newScale = Math.max(MIN_ZOOM, Math.min(newScale, MAX_ZOOM));
                    // Zoom towards the starting center of the gesture
                    zoomStage(newScale, lastCenter);
                }

                // --- Update state for the next frame ---
                lastDist = newDist;
                // Update center continuously for smoother feel? Or keep initial center? Let's try initial.
                // lastCenter = newCenter;
                lastAngleRad = newAngleRad;

                stage.batchDraw(); // Redraw after zoom/rotate

            } else {
                // One finger or no fingers - reset gesture tracking
                lastCenter = null;
                lastDist = 0;
                lastAngleRad = 0;
                // Allow single-touch panning (handled by Konva's draggable)
            }
        });

        // --- Touch End ---
        stage.on('touchend', function () {
            // Reset gesture tracking state when fingers lift
            lastDist = 0;
            lastCenter = null;
            lastAngleRad = 0;
            console.log("Touch gesture end.");
            // Re-enable dragging if needed (Konva usually handles this)
        });

        // --- Desktop Zooming (Mouse Wheel) ---
        stage.on('wheel', function(e) {
            if (!stage) return;
            // Prevent default page scrolling
            e.evt.preventDefault();

            const oldScale = stage.scaleX();
            const pointer = stage.getPointerPosition();
            if (!pointer) return; // Exit if pointer position is unavailable

            // Determine zoom direction and calculate new scale
            const delta = e.evt.deltaY;
            const scaleFactor = delta < 0 ? ZOOM_SENSITIVITY : 1 / ZOOM_SENSITIVITY;
            let newScale = oldScale * scaleFactor;

            // Clamp zoom level
            newScale = Math.max(MIN_ZOOM, Math.min(newScale, MAX_ZOOM));

            // Zoom towards the mouse pointer position
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
// Zooms the stage towards a specific point (center in screen coordinates)
function zoomStage(newScale, center) {
    if (!stage) return;
    const oldScale = stage.scaleX();
    // Use provided center (from gesture) or current mouse pointer
    const pointer = center || stage.getPointerPosition();
    if (!pointer) return; // Need a point to zoom towards

    // Calculate the point in the stage's coordinate system that corresponds
    // to the pointer position before scaling.
    const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
    };

    // Apply the new scale
    stage.scale({ x: newScale, y: newScale });

    // Calculate the new position of the stage so that the point under the pointer
    // remains the same after scaling.
    const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
}

// --- Rotation Logic ---
// Rotates the stage around a specific point (center in screen coordinates)
function rotateStage(angleDeltaRad, center) {
    if (!stage) return;
    const currentRotationDeg = stage.rotation(); // Konva rotation is in degrees
    const angleDeltaDeg = angleDeltaRad * (180 / Math.PI); // Convert delta to degrees
    const newRotationDeg = currentRotationDeg + angleDeltaDeg;

    // Use provided center (from gesture) or fallback to stage center if needed
    const pivotScreen = center || { x: stage.width() / 2, y: stage.height() / 2 };
    if (!pivotScreen) return;

    // Calculate pivot point relative to stage's origin (top-left) BEFORE rotation
    const scale = stage.scaleX(); // Assume uniform scale
    const pivotRelative = {
        x: (pivotScreen.x - stage.x()) / scale,
        y: (pivotScreen.y - stage.y()) / scale,
    };

    // Set the rotation origin (offset) to the pivot point
    stage.offset(pivotRelative);

    // Apply the new rotation
    stage.rotation(newRotationDeg);

    // Calculate the new stage position to keep the pivot point stationary on screen
    // Convert the relative pivot back to screen coordinates with the NEW rotation applied (this is the tricky part)
    // For simplicity, Konva's offset handling should manage this if the offset is set correctly.
    // We might need to adjust the stage position AFTER rotation if offset alone isn't enough.

    // Let's try setting the position based on the pivot staying put
     const newPos = {
         x: pivotScreen.x - pivotRelative.x * scale,
         y: pivotScreen.y - pivotRelative.y * scale
     };
     // This position calculation might need refinement based on how Konva applies offset + rotation + position.
     // Often, setting the offset and then the position to the screen pivot works.
     stage.position(pivotScreen); // Position the offset point (pivot) at the screen center


     // Alternative: Calculate position shift manually (more complex)
     /*
     const rad = angleDeltaRad;
     const dx = pivotRelative.x * scale;
     const dy = pivotRelative.y * scale;
     const newStageX = stage.x() - (dx * Math.cos(rad) - dy * Math.sin(rad) - dx);
     const newStageY = stage.y() - (dx * Math.sin(rad) + dy * Math.cos(rad) - dy);
     stage.position({ x: newStageX, y: newStageY });
     */
}


// --- Saving and Loading ---
function saveToLocalStorage() {
    if (!stage) {
        alert("Cannot save: Editor not initialized.");
        return;
    }
    try {
        const json = stage.toJSON();
        localStorage.setItem(LOCAL_STORAGE_KEY, json);
        console.log("Canvas saved to localStorage.");
        alert("Drawing saved locally!"); // User feedback
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
            // Destroy existing stage children *before* creating from JSON
            if (stage) {
                 // stage.destroyChildren(); // This might cause issues if stage is recreated below
            } else {
                 // Should not happen if called from initializeEditor, but good check
                 console.error("Stage not available during load attempt.");
                 return false;
            }

            // Create a new stage object from the saved JSON data
            // This REPLACES the global 'stage' variable
            const loadedStage = Konva.Node.create(json, 'canvas-container');

            if (!loadedStage || !(loadedStage instanceof Konva.Stage)) {
                 throw new Error("Failed to create Konva Stage from JSON data.");
            }

            // Replace the old stage reference with the new loaded one
            stage.destroy(); // Destroy the old empty stage
            stage = loadedStage; // Assign the newly loaded stage globally

            // Ensure the loaded stage is draggable
            stage.draggable(true);

            // Re-assign the global 'layer' variable (assuming first layer is main)
            if (stage.getLayers().length > 0) {
                layer = stage.getLayers()[0];
                console.log("Stage and Layer loaded successfully from JSON.");
                stage.batchDraw(); // Draw the loaded content
                return true; // Indicate success
            } else {
                console.warn("Loaded stage has no layers. Creating a default layer.");
                layer = new Konva.Layer();
                stage.add(layer);
                stage.batchDraw();
                return true; // Still technically successful load of stage structure
            }

        } catch (error) {
            console.error("Error loading canvas from localStorage JSON:", error);
            alert("Could not load saved drawing. The data might be corrupted. Starting with a blank canvas.");
            // Clear corrupted data? Consider asking user.
            // localStorage.removeItem(LOCAL_STORAGE_KEY);

            // Ensure a valid stage and layer exist if loading failed mid-way
            if (!stage || !(stage instanceof Konva.Stage)) {
                 console.log("Recreating stage after load failure.");
                 const container = document.getElementById('canvas-container');
                 // Check container existence again
                 if (!container) {
                      console.error("Container missing during load failure recovery.");
                      displayError("Critical error during loading recovery.");
                      return false;
                 }
                 stage = new Konva.Stage({
                     container: 'canvas-container',
                     width: container.offsetWidth,
                     height: container.offsetHeight,
                     draggable: true,
                 });
            }
            // Ensure layer exists and is added
            if (!layer || !stage.getLayers().includes(layer)) {
                 layer = new Konva.Layer();
                 stage.add(layer);
            }
            stage.batchDraw(); // Draw the fresh canvas
            return false; // Indicate failure
        }
    } else {
        console.log("No saved data found in localStorage.");
        // No data is not an error, ensure layer exists if stage was just created
        if (stage && stage.getLayers().length === 0) {
             layer = new Konva.Layer();
             stage.add(layer);
        }
        return true; // Indicate success (nothing to load)
    }
}

function clearCanvas() {
    if (!stage || !layer) {
        alert("Cannot clear: Editor not initialized.");
        return;
    }
    if (confirm("Are you sure you want to clear the canvas and remove the saved version? This cannot be undone.")) {
        try {
            layer.destroyChildren(); // Remove all shapes from the layer
            // Reset transformations (optional, but good for a true clear)
            stage.position({ x: 0, y: 0 });
            stage.scale({ x: 1, y: 1 });
            stage.rotation(0);
            stage.offset({ x: 0, y: 0 }); // Reset offset used for rotation

            stage.batchDraw(); // Redraw the empty, reset stage
            localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear saved state
            console.log("Canvas cleared, transformations reset, and local storage removed.");
        } catch (error) {
            console.error("Error clearing canvas:", error);
            alert(`Failed to clear canvas: ${error.message}`);
        }
    }
}

// --- Exporting ---
function exportCanvas(format = 'png') {
    if (!stage) {
        alert("Cannot export: Editor not initialized.");
        return;
    }
    try {
        const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`; // Correct mime type for jpg
        // Export the current view of the stage
        // Increase pixelRatio for higher resolution export
        const dataURL = stage.toDataURL({
            mimeType: mimeType,
            quality: 0.9, // Quality setting for JPEG
            pixelRatio: 2 // Export at 2x resolution (adjust as needed)
        });

        if (!dataURL) {
            throw new Error("Stage returned empty data URL.");
        }

        downloadURI(dataURL, `handwriting.${format}`);
        console.log(`Canvas exported as ${format}.`);
    } catch (error) {
        console.error(`Error exporting canvas as ${format}:`, error);
        alert(`Failed to export as ${format}. Error: ${error.message}`);
    }
}

function exportCanvasSVG() {
    if (!stage || !layer) {
        alert("Cannot export: Editor not initialized.");
        return;
    }
    console.warn("SVG export is basic and does NOT accurately reflect stage transformations (pan, zoom, rotate). It exports raw layer content.");

    try {
        const lines = layer.find('Line'); // Get all Line nodes
        const bgColor = isDarkMode ? '#343a40' : '#ffffff'; // Get current background

        // Attempt to get bounds of content *relative to the layer itself*
        // This ignores stage transform, giving raw coordinates
        const bounds = layer.getClientRect({ skipTransform: false }); // Get bounds including shape transforms

        // If bounds are invalid (e.g., empty canvas), use stage dimensions as fallback
        const viewBoxWidth = (bounds && bounds.width > 0) ? bounds.width : stage.width();
        const viewBoxHeight = (bounds && bounds.height > 0) ? bounds.height : stage.height();
        const viewBoxX = (bounds && isFinite(bounds.x)) ? bounds.x : 0;
        const viewBoxY = (bounds && isFinite(bounds.y)) ? bounds.y : 0;

        // Start SVG string
        let svgData = `<svg width="${viewBoxWidth}" height="${viewBoxHeight}" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: ${bgColor};">`;

        // Add a comment about the limitation
        svgData += ``;

        // Iterate through lines and add them as polylines
        lines.forEach(line => {
            // Skip non-visible lines or eraser lines
            if (!line.isVisible() || line.globalCompositeOperation() === 'destination-out') {
                return;
            }

            const points = line.points();
            // Ensure there are enough points to draw a line
            if (!points || points.length < 4) return;

            const color = line.stroke();
            const width = line.strokeWidth();
            const linecap = line.lineCap();
            const linejoin = line.lineJoin();

            // Convert points array to SVG points string
            let pointsString = "";
            for (let i = 0; i < points.length; i += 2) {
                // Round points for cleaner SVG? Optional.
                pointsString += `${points[i].toFixed(2)},${points[i+1].toFixed(2)} `;
            }

            // Add polyline element
            svgData += `<polyline points="${pointsString.trim()}" stroke="${color}" stroke-width="${width}" stroke-linecap="${linecap}" stroke-linejoin="${linejoin}" fill="none" />`;
        });

        svgData += `</svg>`; // Close SVG tag

        // Trigger download
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        downloadURI(url, 'handwriting_export.svg');
        URL.revokeObjectURL(url); // Clean up blob URL after download starts
        console.log("Canvas exported as SVG (basic, no transforms).");

    } catch (error) {
        console.error("Error exporting canvas as SVG:", error);
        alert(`Failed to export as SVG. Error: ${error.message}`);
    }
}

function exportCanvasHTML() {
    if (!stage || !layer) {
        alert("Cannot export: Editor not initialized.");
        return;
    }
    console.warn("HTML export uses the basic SVG export and does NOT accurately reflect stage transformations.");

    try {
        // --- Generate SVG data (reuse basic SVG export logic) ---
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
            const points = line.points();
            if (!points || points.length < 4) return;
            const color = line.stroke();
            const width = line.strokeWidth();
            const linecap = line.lineCap();
            const linejoin = line.lineJoin();
            let pointsString = "";
            for (let i = 0; i < points.length; i += 2) { pointsString += `${points[i].toFixed(2)},${points[i+1].toFixed(2)} `; }
            svgContent += `<polyline points="${pointsString.trim()}" stroke="${color}" stroke-width="${width}" stroke-linecap="${linecap}" stroke-linejoin="${linejoin}" fill="none" />`;
        });
        svgContent += `</svg>`;

        // --- Create HTML content ---
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Handwriting Export</title>
    <style>
        html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
        body { display: flex; justify-content: center; align-items: center; background-color: #e9ecef; }
        #svg-container {
            width: 90vw; /* Limit size slightly */
            height: 90vh;
            border: 1px solid #ced4da;
            background-color: ${bgColor}; /* Match SVG background */
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div id="svg-container">
        ${svgContent}
    </div>
</body>
</html>`;

        // Trigger download
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
        link.download = name;
        link.href = uri;
        // Append to body is required for Firefox compatibility
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // For blob URLs, revoke object URL after download starts
        // However, we do this in the calling function (SVG/HTML export)
        // as data URLs don't need revoking.
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
        document.body.classList.add('dark');
        isDarkMode = true;
        if (toggleButton) {
            toggleButton.textContent = '☀️ Light';
            toggleButton.title = 'Toggle Light Mode';
        }
    } else {
        // Default to light mode
        document.body.classList.remove('dark');
        isDarkMode = false;
        if (toggleButton) {
            toggleButton.textContent = '🌙 Dark';
            toggleButton.title = 'Toggle Dark Mode';
        }
    }
    console.log(`Dark mode initialized: ${isDarkMode}`);
}

function toggleDarkMode() {
    try {
        const body = document.body;
        const button = document.getElementById('dark-mode-toggle');
        // const canvasContainer = document.getElementById('canvas-container'); // CSS handles this now

        body.classList.toggle('dark');
        isDarkMode = body.classList.contains('dark'); // Update state

        if (isDarkMode) {
            localStorage.setItem(LOCAL_STORAGE_DARK_MODE_KEY, 'enabled');
            if (button) {
                button.textContent = '☀️ Light';
                button.title = 'Toggle Light Mode';
            }
        } else {
            localStorage.setItem(LOCAL_STORAGE_DARK_MODE_KEY, 'disabled');
            if (button) {
                button.textContent = '🌙 Dark';
                button.title = 'Toggle Dark Mode';
            }
        }
        console.log(`Dark mode toggled: ${isDarkMode}`);

        // Optional: Redraw stage if background color change needs explicit update
        // (CSS should handle the container, but direct canvas bg might need redraw if set)
        // if (stage) stage.batchDraw();

    } catch (error) {
        console.error("Error toggling dark mode:", error);
        alert(`Failed to toggle dark mode: ${error.message}`);
    }
}

// --- Start the application ---
// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', initializeEditor);
