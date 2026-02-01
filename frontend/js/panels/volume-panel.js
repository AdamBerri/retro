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
            maxVolume = Math.max(maxVolume, d.volume);
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

        // Draw crosshair
        if (this.viewState.hoverIndex >= 0) {
            this.drawVolumeCrosshair(maxVolume);
        }

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
        ctx.fillStyle = this.colors.text;
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'left';

        // Show max volume
        ctx.fillText(this.formatVolume(maxVolume), this.width - this.margin.right + 5, this.margin.top + 10);

        // Show half
        const halfY = this.margin.top + this.chartHeight / 2;
        ctx.fillText(this.formatVolume(maxVolume / 2), this.width - this.margin.right + 5, halfY + 4);
    }

    drawVolumeCrosshair(maxVolume) {
        const index = this.viewState.hoverIndex;
        if (index < 0 || index >= this.data.length) return;

        const d = this.data[index];
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

        // Horizontal line at volume level
        const barHeight = (d.volume / maxVolume) * this.chartHeight;
        const y = this.margin.top + this.chartHeight - barHeight;

        ctx.beginPath();
        ctx.moveTo(this.margin.left, y);
        ctx.lineTo(this.width - this.margin.right, y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Volume label
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(this.width - this.margin.right, y - 10, this.margin.right, 20);
        ctx.fillStyle = this.colors.text;
        ctx.textAlign = 'left';
        ctx.fillText(this.formatVolume(d.volume), this.width - this.margin.right + 5, y + 4);
    }
}

// Export
window.VolumePanel = VolumePanel;
