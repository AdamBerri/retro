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
        const rect = this.canvas.getBoundingClientRect();

        // Skip if no dimensions yet
        if (rect.width === 0 || rect.height === 0) {
            return;
        }

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
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
        ctx.fillStyle = this.colors.text;
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'left';

        const fmt = formatter || ((v) => this.formatPrice(v));
        const step = this.niceNumber((maxValue - minValue) / numLines);
        const startValue = Math.ceil(minValue / step) * step;

        for (let value = startValue; value <= maxValue; value += step) {
            const y = this.margin.top + this.chartHeight - ((value - minValue) / (maxValue - minValue)) * this.chartHeight;
            ctx.fillText(fmt(value), this.width - this.margin.right + 5, y + 4);
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

    drawCrosshair(valueToY, getValue = null) {
        const index = this.viewState.hoverIndex;
        if (index < 0 || index >= this.data.length) return;

        const x = this.indexToX(index);
        const ctx = this.ctx;

        ctx.strokeStyle = this.colors.crosshair;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(x, this.margin.top);
        ctx.lineTo(x, this.height - this.margin.bottom);
        ctx.stroke();

        // Horizontal line if we have a value
        if (getValue) {
            const value = getValue(index);
            if (!isNaN(value)) {
                const y = valueToY(value);

                ctx.beginPath();
                ctx.moveTo(this.margin.left, y);
                ctx.lineTo(this.width - this.margin.right, y);
                ctx.stroke();

                // Value label
                ctx.setLineDash([]);
                ctx.fillStyle = this.colors.background;
                ctx.fillRect(this.width - this.margin.right, y - 10, this.margin.right, 20);
                ctx.fillStyle = this.colors.text;
                ctx.textAlign = 'left';
                ctx.font = '11px -apple-system, sans-serif';
                ctx.fillText(this.formatValue(value), this.width - this.margin.right + 5, y + 4);
            }
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
