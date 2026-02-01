/**
 * RETRO - Panel Resizer
 * Handles drag-to-resize functionality for chart panels
 */

class PanelResizer {
    constructor(handle, manager, panel) {
        this.handle = handle;
        this.manager = manager;
        this.panel = panel;

        this.isDragging = false;
        this.startY = 0;
        this.startHeightRatio = 0;
        this.nextPanel = null;
        this.nextStartHeightRatio = 0;

        this.minHeightRatio = 0.08; // Minimum ~8% of container height

        // Bind event handlers
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);

        // Setup
        this.handle.addEventListener('mousedown', this.handleMouseDown);
    }

    handleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        // Find the next panel (the one below this resize handle)
        const panels = this.manager.panels;
        const currentIndex = panels.indexOf(this.panel);

        if (currentIndex < 0 || currentIndex >= panels.length - 1) {
            return; // No next panel to resize against
        }

        this.nextPanel = panels[currentIndex + 1];

        // Don't resize if either panel is collapsed
        if (this.panel.collapsed || this.nextPanel.collapsed) {
            return;
        }

        this.isDragging = true;
        this.startY = e.clientY;
        this.startHeightRatio = this.panel.heightRatio;
        this.nextStartHeightRatio = this.nextPanel.heightRatio;

        // Add body class for cursor
        document.body.classList.add('resizing-panels');

        // Add document-level listeners
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const containerHeight = this.manager.container.clientHeight;
        const deltaY = e.clientY - this.startY;
        const deltaRatio = deltaY / containerHeight;

        // Calculate new heights
        let newRatio = this.startHeightRatio + deltaRatio;
        let newNextRatio = this.nextStartHeightRatio - deltaRatio;

        // Enforce minimum heights
        if (newRatio < this.minHeightRatio) {
            newRatio = this.minHeightRatio;
            newNextRatio = this.startHeightRatio + this.nextStartHeightRatio - this.minHeightRatio;
        }

        if (newNextRatio < this.minHeightRatio) {
            newNextRatio = this.minHeightRatio;
            newRatio = this.startHeightRatio + this.nextStartHeightRatio - this.minHeightRatio;
        }

        // Apply new heights
        this.panel.heightRatio = newRatio;
        this.nextPanel.heightRatio = newNextRatio;

        // Update layout
        this.manager.layoutPanels();
    }

    handleMouseUp() {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.nextPanel = null;

        // Remove body class
        document.body.classList.remove('resizing-panels');

        // Remove document-level listeners
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        // Save config
        this.manager.saveConfig();
    }

    destroy() {
        this.handle.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
}

// Export
window.PanelResizer = PanelResizer;
