/**
 * RETRO - Chart Panel Base Class
 * Common functionality for all panel types
 */

class ChartPanel {
    constructor(canvas, manager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.manager = manager;

        // State
        this.needsRender = true;
        this.collapsed = false;
        this.heightRatio = 0.5;

        // Setup canvas
        this.resize();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;

        // Get dimensions from the wrapper element, not the canvas
        // Canvas elements have intrinsic sizing that interferes with flexbox
        const wrapper = this.canvas.parentElement;
        if (!wrapper) return;

        const wrapperRect = wrapper.getBoundingClientRect();
        const header = wrapper.querySelector('.panel-header-bar');
        const headerHeight = header ? header.offsetHeight : 0;

        const width = wrapperRect.width;
        const height = wrapperRect.height - headerHeight;

        // Skip if no dimensions yet
        if (width <= 0 || height <= 0) {
            return;
        }

        // Set canvas size explicitly
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;

        // Reset transform and apply DPR scaling
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.width = width;
        this.height = height;
        this.needsRender = true;
    }

    // ============================================
    // COORDINATE HELPERS
    // ============================================

    get viewState() {
        return this.manager.viewState;
    }

    get data() {
        return this.manager.data;
    }

    get margin() {
        return this.manager.margin;
    }

    get colors() {
        return this.manager.colors;
    }

    get chartWidth() {
        return this.width - this.margin.left - this.margin.right;
    }

    get chartHeight() {
        return this.height - this.margin.top - this.margin.bottom;
    }

    indexToX(index) {
        const relativeIdx = index - this.viewState.viewStart;
        return this.margin.left + relativeIdx * this.viewState.candleWidth + this.viewState.candleWidth / 2;
    }

    // Create a priceToY function for a given min/max range
    createValueToY(minValue, maxValue) {
        return (value) => {
            return this.margin.top + this.chartHeight - ((value - minValue) / (maxValue - minValue)) * this.chartHeight;
        };
    }

    // ============================================
    // DRAWING HELPERS
    // ============================================

    clear() {
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawGrid(minValue, maxValue, numLines = 4) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;

        const step = this.niceNumber((maxValue - minValue) / numLines);
        const startValue = Math.ceil(minValue / step) * step;

        for (let value = startValue; value <= maxValue; value += step) {
            const y = this.margin.top + this.chartHeight - ((value - minValue) / (maxValue - minValue)) * this.chartHeight;

            ctx.beginPath();
            ctx.moveTo(this.margin.left, y);
            ctx.lineTo(this.width - this.margin.right, y);
            ctx.stroke();
        }
    }

    drawYAxis(minValue, maxValue, numLines = 4, formatter = null) {
        const ctx = this.ctx;
        ctx.textAlign = 'left';

        const fmt = formatter || ((v) => this.formatPrice(v));
        const step = this.niceNumber((maxValue - minValue) / numLines);
        const startValue = Math.ceil(minValue / step) * step;

        for (let value = startValue; value <= maxValue; value += step) {
            const y = this.margin.top + this.chartHeight - ((value - minValue) / (maxValue - minValue)) * this.chartHeight;
            const text = fmt(value);
            const x = this.width - this.margin.right + 5;

            // Bold font with subtle background
            ctx.font = 'bold 12px -apple-system, sans-serif';
            const textWidth = ctx.measureText(text).width;

            // Background for readability
            ctx.fillStyle = 'rgba(13, 17, 23, 0.8)';
            ctx.fillRect(x - 2, y - 8, textWidth + 4, 16);

            // Text
            ctx.fillStyle = '#c9d1d9';
            ctx.fillText(text, x, y + 4);
        }
    }

    drawLine(values, start, end, valueToY, color, lineWidth = 1.5) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        let started = false;
        for (let i = start; i <= end; i++) {
            const v = values[i];
            if (isNaN(v) || v === null || v === undefined) continue;

            const x = this.indexToX(i);
            const y = valueToY(v);

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
    }

    drawFilledArea(upperValues, lowerValues, start, end, valueToY, fillColor) {
        const ctx = this.ctx;
        ctx.fillStyle = fillColor;
        ctx.beginPath();

        // Draw upper line forward
        let started = false;
        for (let i = start; i <= end; i++) {
            const v = upperValues[i];
            if (isNaN(v)) continue;

            const x = this.indexToX(i);
            const y = valueToY(v);

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        // Draw lower line backward
        for (let i = end; i >= start; i--) {
            const v = lowerValues[i];
            if (isNaN(v)) continue;

            const x = this.indexToX(i);
            const y = valueToY(v);
            ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fill();
    }

    drawHorizontalLine(y, color, dashed = false) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        if (dashed) {
            ctx.setLineDash([4, 4]);
        }

        ctx.beginPath();
        ctx.moveTo(this.margin.left, y);
        ctx.lineTo(this.width - this.margin.right, y);
        ctx.stroke();

        if (dashed) {
            ctx.setLineDash([]);
        }
    }

    drawCrosshair(valueToY, getValue = null, minValue = 0, maxValue = 100) {
        // Only draw if mouse is on canvas
        if (!this.viewState.mouseOnCanvas) return;

        const ctx = this.ctx;
        const mouseX = this.viewState.mouseX;
        const mouseY = this.viewState.mouseY;

        // Calculate this panel's Y offset within the container
        const wrapper = this.canvas.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const containerRect = this.manager.container.getBoundingClientRect();
        const header = wrapper.querySelector('.panel-header-bar');
        const headerHeight = header ? header.offsetHeight : 0;
        const panelOffsetY = wrapperRect.top - containerRect.top + headerHeight;

        // Convert container mouseY to panel-local Y
        const localMouseY = mouseY - panelOffsetY;

        // Check if mouse is within this panel's bounds
        const inPanel = localMouseY >= 0 && localMouseY <= this.height;

        // Draw crosshair lines - full span, FPS style
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        // Vertical line at exact mouse X position (full height)
        ctx.beginPath();
        ctx.moveTo(mouseX, 0);
        ctx.lineTo(mouseX, this.height);
        ctx.stroke();

        // Horizontal line at exact mouse Y position (full width) - only if mouse is in this panel
        if (inPanel) {
            ctx.beginPath();
            ctx.moveTo(0, localMouseY);
            ctx.lineTo(this.width, localMouseY);
            ctx.stroke();

            // Center dot at intersection
            ctx.fillStyle = 'rgba(88, 166, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(mouseX, localMouseY, 4, 0, Math.PI * 2);
            ctx.fill();

            // Calculate value at mouse Y position
            if (valueToY && minValue !== maxValue) {
                const valueAtMouse = maxValue - ((localMouseY - this.margin.top) / this.chartHeight) * (maxValue - minValue);

                // Draw value label with glow effect
                const valueText = this.formatValue(valueAtMouse);
                ctx.font = 'bold 12px -apple-system, sans-serif';
                const textWidth = ctx.measureText(valueText).width;
                const labelX = this.width - this.margin.right + 2;
                const labelY = localMouseY;

                // Glow background
                ctx.fillStyle = 'rgba(56, 139, 253, 0.9)';
                ctx.shadowColor = 'rgba(56, 139, 253, 0.5)';
                ctx.shadowBlur = 8;
                ctx.fillRect(labelX, labelY - 10, textWidth + 10, 20);
                ctx.shadowBlur = 0;

                // Text
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.fillText(valueText, labelX + 5, labelY + 4);
            }
        }

        // Draw date label at bottom (based on nearest candle to mouseX)
        const index = this.viewState.hoverIndex;
        if (index >= 0 && index < this.data.length) {
            const d = this.data[index];
            ctx.font = 'bold 12px -apple-system, sans-serif';
            const dateText = d.date;
            const dateWidth = ctx.measureText(dateText).width;
            const dateLabelX = mouseX - dateWidth / 2 - 5;
            const dateLabelY = this.height - this.margin.bottom + 2;

            // Glow background
            ctx.fillStyle = 'rgba(56, 139, 253, 0.9)';
            ctx.shadowColor = 'rgba(56, 139, 253, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fillRect(dateLabelX, dateLabelY, dateWidth + 10, 20);
            ctx.shadowBlur = 0;

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(dateText, mouseX, dateLabelY + 14);
        }

        ctx.setLineDash([]);
    }

    drawDateLabel(index) {
        if (index < 0 || index >= this.data.length) return;

        const d = this.data[index];
        const x = this.indexToX(index);
        const ctx = this.ctx;

        ctx.fillStyle = this.colors.background;
        ctx.fillRect(x - 40, this.height - this.margin.bottom, 80, 20);
        ctx.fillStyle = this.colors.text;
        ctx.textAlign = 'center';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillText(d.date, x, this.height - this.margin.bottom + 14);
    }

    // ============================================
    // UTILITIES
    // ============================================

    niceNumber(range) {
        if (range === 0) return 1;
        const exponent = Math.floor(Math.log10(Math.abs(range)));
        const fraction = range / Math.pow(10, exponent);

        let niceFraction;
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;

        return niceFraction * Math.pow(10, exponent);
    }

    formatPrice(price) {
        if (price >= 1000) {
            return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        } else if (price >= 1) {
            return price.toFixed(2);
        } else {
            return price.toFixed(4);
        }
    }

    formatValue(value) {
        if (Math.abs(value) >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
        } else if (Math.abs(value) >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
        } else if (Math.abs(value) >= 1) {
            return value.toFixed(2);
        } else {
            return value.toFixed(4);
        }
    }

    formatVolume(vol) {
        if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
        if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
        if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
        return vol.toString();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    render() {
        // Override in subclasses
        this.clear();
    }

    destroy() {
        // Override in subclasses if needed
    }
}

// Export
window.ChartPanel = ChartPanel;
