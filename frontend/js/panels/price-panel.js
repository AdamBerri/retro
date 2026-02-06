/**
 * RETRO - Price Panel
 * Main candlestick chart with overlay support
 */

class PricePanel extends ChartPanel {
    constructor(canvas, manager, overlays = []) {
        super(canvas, manager);
        this.overlays = overlays;
    }

    render() {
        const ctx = this.ctx;
        const data = this.data;

        // Clear background
        this.clear();

        if (!data.length) {
            ctx.fillStyle = this.colors.text;
            ctx.font = '16px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data loaded', this.width / 2, this.height / 2);
            return;
        }

        // Get visible data
        const { viewStart, viewEnd } = this.viewState;
        const visibleData = data.slice(viewStart, viewEnd + 1);
        if (!visibleData.length) return;

        // Calculate price range
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        for (const d of visibleData) {
            minPrice = Math.min(minPrice, d.low);
            maxPrice = Math.max(maxPrice, d.high);
        }

        // Include overlay values in range calculation
        for (const overlay of this.overlays) {
            const values = this.manager.getIndicator(overlay);
            if (values) {
                for (let i = viewStart; i <= viewEnd; i++) {
                    const v = values[i];
                    if (!isNaN(v)) {
                        // For bollinger, values is an object
                        if (overlay === 'bollinger' && typeof values === 'object' && values.upper) {
                            const upper = values.upper[i];
                            const lower = values.lower[i];
                            if (!isNaN(upper)) maxPrice = Math.max(maxPrice, upper);
                            if (!isNaN(lower)) minPrice = Math.min(minPrice, lower);
                        } else if (typeof v === 'number') {
                            minPrice = Math.min(minPrice, v);
                            maxPrice = Math.max(maxPrice, v);
                        }
                    }
                }
            }
        }

        // Add padding to price range
        const priceRange = maxPrice - minPrice;
        minPrice -= priceRange * 0.05;
        maxPrice += priceRange * 0.05;

        // Create coordinate converter
        const priceToY = this.createValueToY(minPrice, maxPrice);

        // Draw grid
        this.drawGrid(minPrice, maxPrice);

        // Draw overlays (behind candles)
        this.drawOverlays(viewStart, viewEnd, priceToY);

        // Draw candles
        this.drawCandles(visibleData, viewStart, priceToY);

        // Draw crosshair (free-moving FPS style)
        this.drawCrosshair(priceToY, (idx) => data[idx]?.close, minPrice, maxPrice);

        // Draw Y axis
        this.drawYAxis(minPrice, maxPrice);
    }

    drawCandles(visibleData, startIndex, priceToY) {
        const ctx = this.ctx;
        const candleWidth = this.viewState.candleWidth;

        for (let i = 0; i < visibleData.length; i++) {
            const d = visibleData[i];
            const x = this.indexToX(startIndex + i);
            const isUp = d.close >= d.open;

            ctx.fillStyle = isUp ? this.colors.candleUp : this.colors.candleDown;
            ctx.strokeStyle = isUp ? this.colors.candleUp : this.colors.candleDown;
            ctx.lineWidth = 1;

            // Wick
            ctx.beginPath();
            ctx.moveTo(x, priceToY(d.high));
            ctx.lineTo(x, priceToY(d.low));
            ctx.stroke();

            // Body
            const bodyTop = priceToY(Math.max(d.open, d.close));
            const bodyBottom = priceToY(Math.min(d.open, d.close));
            const bodyHeight = Math.max(1, bodyBottom - bodyTop);

            if (candleWidth > 3) {
                ctx.fillRect(
                    x - candleWidth / 2 + 1,
                    bodyTop,
                    candleWidth - 2,
                    bodyHeight
                );
            } else {
                // Thin candles - just draw a line
                ctx.beginPath();
                ctx.moveTo(x, bodyTop);
                ctx.lineTo(x, bodyTop + bodyHeight);
                ctx.stroke();
            }
        }
    }

    drawOverlays(viewStart, viewEnd, priceToY) {
        for (const overlay of this.overlays) {
            switch (overlay) {
                case 'sma20':
                    this.drawLine(
                        this.manager.getIndicator('sma20'),
                        viewStart, viewEnd, priceToY,
                        this.colors.sma20
                    );
                    break;

                case 'sma50':
                    this.drawLine(
                        this.manager.getIndicator('sma50'),
                        viewStart, viewEnd, priceToY,
                        this.colors.sma50
                    );
                    break;

                case 'sma200':
                    this.drawLine(
                        this.manager.getIndicator('sma200'),
                        viewStart, viewEnd, priceToY,
                        this.colors.sma200
                    );
                    break;

                case 'ema12':
                    this.drawLine(
                        this.manager.getIndicator('ema12'),
                        viewStart, viewEnd, priceToY,
                        this.colors.ema12
                    );
                    break;

                case 'ema26':
                    this.drawLine(
                        this.manager.getIndicator('ema26'),
                        viewStart, viewEnd, priceToY,
                        this.colors.ema26
                    );
                    break;

                case 'bollinger':
                    this.drawBollinger(viewStart, viewEnd, priceToY);
                    break;
            }
        }
    }

    drawBollinger(viewStart, viewEnd, priceToY) {
        const bb = this.manager.getIndicator('bollinger');
        if (!bb) return;

        // Draw filled area
        this.drawFilledArea(bb.upper, bb.lower, viewStart, viewEnd, priceToY, this.colors.bollingerFill);

        // Draw lines
        this.drawLine(bb.upper, viewStart, viewEnd, priceToY, this.colors.bollingerUpper, 1);
        this.drawLine(bb.middle, viewStart, viewEnd, priceToY, this.colors.sma200, 1);
        this.drawLine(bb.lower, viewStart, viewEnd, priceToY, this.colors.bollingerLower, 1);
    }
}

// Export
window.PricePanel = PricePanel;
