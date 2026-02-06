/**
 * RETRO - Volume Panel
 * Displays volume bars with color based on price direction
 */

class VolumePanel extends ChartPanel {
    constructor(canvas, manager) {
        super(canvas, manager);
    }

    render() {
        const ctx = this.ctx;
        const data = this.data;

        // Clear background
        this.clear();

        if (!data.length) return;

        // Get visible data
        const { viewStart, viewEnd } = this.viewState;
        const visibleData = data.slice(viewStart, viewEnd + 1);
        if (!visibleData.length) return;

        // Calculate volume range
        let maxVolume = 0;
        for (const d of visibleData) {
            maxVolume = Math.max(maxVolume, d.volume || 0);
        }

        // Avoid divide by zero
        if (maxVolume === 0) {
            maxVolume = 1;
        }

        // Add padding
        maxVolume *= 1.1;

        // Draw grid (simpler for volume)
        this.drawVolumeGrid(maxVolume);

        // Draw volume bars
        const candleWidth = this.viewState.candleWidth;
        const barWidth = Math.max(1, candleWidth - 2);

        for (let i = 0; i < visibleData.length; i++) {
            const d = visibleData[i];
            const x = this.indexToX(viewStart + i);
            const barHeight = (d.volume / maxVolume) * this.chartHeight;

            const isUp = d.close >= d.open;
            ctx.fillStyle = isUp ? this.colors.candleUp + '80' : this.colors.candleDown + '80';

            ctx.fillRect(
                x - barWidth / 2,
                this.margin.top + this.chartHeight - barHeight,
                barWidth,
                barHeight
            );
        }

        // Draw crosshair (free-moving FPS style)
        const valueToY = this.createValueToY(0, maxVolume);
        this.drawCrosshair(valueToY, (idx) => this.data[idx]?.volume, 0, maxVolume);

        // Draw Y axis
        this.drawVolumeAxis(maxVolume);
    }

    drawVolumeGrid(maxVolume) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;

        // Just draw 2 horizontal lines
        const steps = [0.25, 0.5, 0.75];

        for (const step of steps) {
            const y = this.margin.top + this.chartHeight * (1 - step);

            ctx.beginPath();
            ctx.moveTo(this.margin.left, y);
            ctx.lineTo(this.width - this.margin.right, y);
            ctx.stroke();
        }
    }

    drawVolumeAxis(maxVolume) {
        const ctx = this.ctx;
        ctx.font = 'bold 12px -apple-system, sans-serif';
        ctx.textAlign = 'left';

        const x = this.width - this.margin.right + 5;

        // Show max volume
        const maxText = this.formatVolume(maxVolume);
        const maxWidth = ctx.measureText(maxText).width;
        ctx.fillStyle = 'rgba(13, 17, 23, 0.8)';
        ctx.fillRect(x - 2, this.margin.top + 2, maxWidth + 4, 16);
        ctx.fillStyle = '#c9d1d9';
        ctx.fillText(maxText, x, this.margin.top + 14);

        // Show half
        const halfY = this.margin.top + this.chartHeight / 2;
        const halfText = this.formatVolume(maxVolume / 2);
        const halfWidth = ctx.measureText(halfText).width;
        ctx.fillStyle = 'rgba(13, 17, 23, 0.8)';
        ctx.fillRect(x - 2, halfY - 4, halfWidth + 4, 16);
        ctx.fillStyle = '#c9d1d9';
        ctx.fillText(halfText, x, halfY + 8);
    }

}

// Export
window.VolumePanel = VolumePanel;
