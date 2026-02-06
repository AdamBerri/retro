/**
 * RETRO - Oscillator Panel
 * Displays RSI, MACD, and Stochastic oscillators
 */

class OscillatorPanel extends ChartPanel {
    constructor(canvas, manager, indicatorType, params = {}) {
        super(canvas, manager);
        this.indicatorType = indicatorType;
        this.params = params;
    }

    render() {
        const ctx = this.ctx;
        const data = this.data;

        // Clear background
        this.clear();

        if (!data.length) return;

        switch (this.indicatorType) {
            case 'rsi':
                this.renderRSI();
                break;
            case 'macd':
                this.renderMACD();
                break;
            case 'stochastic':
                this.renderStochastic();
                break;
        }
    }

    // ============================================
    // RSI
    // ============================================

    renderRSI() {
        const ctx = this.ctx;
        const { viewStart, viewEnd, hoverIndex } = this.viewState;

        const rsi = this.manager.getIndicator('rsi', { period: this.params.period || 14 });
        if (!rsi) return;

        // RSI is always 0-100
        const minValue = 0;
        const maxValue = 100;
        const valueToY = this.createValueToY(minValue, maxValue);

        // Draw overbought/oversold zones
        const overbought = this.params.overbought || 70;
        const oversold = this.params.oversold || 30;

        // Overbought zone
        const obY = valueToY(overbought);
        ctx.fillStyle = this.colors.rsiOverbought;
        ctx.fillRect(this.margin.left, this.margin.top, this.chartWidth, obY - this.margin.top);

        // Oversold zone
        const osY = valueToY(oversold);
        ctx.fillStyle = this.colors.rsiOversold;
        ctx.fillRect(this.margin.left, osY, this.chartWidth, this.margin.top + this.chartHeight - osY);

        // Draw grid lines
        this.drawRSIGrid(valueToY, overbought, oversold);

        // Draw RSI line
        this.drawLine(rsi, viewStart, viewEnd, valueToY, this.colors.rsiLine, 2);

        // Draw crosshair (free-moving FPS style)
        this.drawCrosshair(valueToY, (idx) => rsi[idx], minValue, maxValue);

        // Draw Y axis
        this.drawRSIAxis(valueToY, overbought, oversold);
    }

    drawRSIGrid(valueToY, overbought, oversold) {
        const ctx = this.ctx;

        // Middle line (50)
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        this.drawHorizontalLine(valueToY(50), this.colors.grid);

        // Overbought line
        ctx.setLineDash([4, 4]);
        this.drawHorizontalLine(valueToY(overbought), 'rgba(248, 81, 73, 0.5)');

        // Oversold line
        this.drawHorizontalLine(valueToY(oversold), 'rgba(63, 185, 80, 0.5)');
        ctx.setLineDash([]);
    }

    drawRSIAxis(valueToY, overbought, oversold) {
        const ctx = this.ctx;
        ctx.font = 'bold 12px -apple-system, sans-serif';
        ctx.textAlign = 'left';

        const x = this.width - this.margin.right + 5;
        const labels = [100, overbought, 50, oversold, 0];

        for (const value of labels) {
            const y = valueToY(value);
            const text = value.toString();
            const textWidth = ctx.measureText(text).width;

            // Background for readability
            ctx.fillStyle = 'rgba(13, 17, 23, 0.8)';
            ctx.fillRect(x - 2, y - 4, textWidth + 4, 16);

            // Text
            ctx.fillStyle = '#c9d1d9';
            ctx.fillText(text, x, y + 8);
        }
    }

    // ============================================
    // MACD
    // ============================================

    renderMACD() {
        const ctx = this.ctx;
        const { viewStart, viewEnd, hoverIndex } = this.viewState;

        const macdData = this.manager.getIndicator('macd', {
            fast: this.params.fast || 12,
            slow: this.params.slow || 26,
            signal: this.params.signal || 9
        });

        if (!macdData) return;

        const { macd, signal, histogram } = macdData;

        // Calculate value range from visible data
        let minValue = Infinity;
        let maxValue = -Infinity;

        for (let i = viewStart; i <= viewEnd; i++) {
            if (!isNaN(macd[i])) {
                minValue = Math.min(minValue, macd[i]);
                maxValue = Math.max(maxValue, macd[i]);
            }
            if (!isNaN(signal[i])) {
                minValue = Math.min(minValue, signal[i]);
                maxValue = Math.max(maxValue, signal[i]);
            }
            if (!isNaN(histogram[i])) {
                minValue = Math.min(minValue, histogram[i]);
                maxValue = Math.max(maxValue, histogram[i]);
            }
        }

        // Ensure symmetric range around 0
        const absMax = Math.max(Math.abs(minValue), Math.abs(maxValue));
        minValue = -absMax * 1.1;
        maxValue = absMax * 1.1;

        if (!isFinite(minValue) || !isFinite(maxValue)) {
            minValue = -1;
            maxValue = 1;
        }

        const valueToY = this.createValueToY(minValue, maxValue);

        // Draw zero line
        this.drawHorizontalLine(valueToY(0), this.colors.grid);

        // Draw histogram
        this.drawMACDHistogram(histogram, viewStart, viewEnd, valueToY);

        // Draw MACD line
        this.drawLine(macd, viewStart, viewEnd, valueToY, this.colors.macdLine, 1.5);

        // Draw signal line
        this.drawLine(signal, viewStart, viewEnd, valueToY, this.colors.macdSignal, 1.5);

        // Draw crosshair (free-moving FPS style)
        this.drawCrosshair(valueToY, (idx) => macd[idx], minValue, maxValue);

        // Draw Y axis
        this.drawYAxis(minValue, maxValue, 4, (v) => v.toFixed(2));
    }

    drawMACDHistogram(histogram, viewStart, viewEnd, valueToY) {
        const ctx = this.ctx;
        const candleWidth = this.viewState.candleWidth;
        const barWidth = Math.max(1, candleWidth - 2);
        const zeroY = valueToY(0);

        for (let i = viewStart; i <= viewEnd; i++) {
            const h = histogram[i];
            if (isNaN(h)) continue;

            const x = this.indexToX(i);
            const y = valueToY(h);

            ctx.fillStyle = h >= 0 ? this.colors.macdHistUp : this.colors.macdHistDown;

            if (h >= 0) {
                ctx.fillRect(x - barWidth / 2, y, barWidth, zeroY - y);
            } else {
                ctx.fillRect(x - barWidth / 2, zeroY, barWidth, y - zeroY);
            }
        }
    }

    // ============================================
    // STOCHASTIC
    // ============================================

    renderStochastic() {
        const ctx = this.ctx;
        const { viewStart, viewEnd, hoverIndex } = this.viewState;

        // Calculate Stochastic %K and %D
        const kPeriod = this.params.kPeriod || 14;
        const dPeriod = this.params.dPeriod || 3;

        const data = this.data;
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const closes = data.map(d => d.close);

        const stochK = this.calculateStochasticK(highs, lows, closes, kPeriod);
        const stochD = Indicators.sma(stochK, dPeriod);

        // Stochastic is always 0-100
        const minValue = 0;
        const maxValue = 100;
        const valueToY = this.createValueToY(minValue, maxValue);

        // Draw overbought/oversold zones
        const overbought = 80;
        const oversold = 20;

        const obY = valueToY(overbought);
        ctx.fillStyle = this.colors.rsiOverbought;
        ctx.fillRect(this.margin.left, this.margin.top, this.chartWidth, obY - this.margin.top);

        const osY = valueToY(oversold);
        ctx.fillStyle = this.colors.rsiOversold;
        ctx.fillRect(this.margin.left, osY, this.chartWidth, this.margin.top + this.chartHeight - osY);

        // Draw grid
        this.drawRSIGrid(valueToY, overbought, oversold);

        // Draw %K line
        this.drawLine(stochK, viewStart, viewEnd, valueToY, this.colors.macdLine, 2);

        // Draw %D line
        this.drawLine(stochD, viewStart, viewEnd, valueToY, this.colors.macdSignal, 1.5);

        // Draw crosshair (free-moving FPS style)
        this.drawCrosshair(valueToY, (idx) => stochK[idx], minValue, maxValue);

        // Draw Y axis
        this.drawRSIAxis(valueToY, overbought, oversold);
    }

    calculateStochasticK(highs, lows, closes, period) {
        const result = new Array(closes.length).fill(NaN);

        for (let i = period - 1; i < closes.length; i++) {
            let highestHigh = -Infinity;
            let lowestLow = Infinity;

            for (let j = i - period + 1; j <= i; j++) {
                highestHigh = Math.max(highestHigh, highs[j]);
                lowestLow = Math.min(lowestLow, lows[j]);
            }

            const range = highestHigh - lowestLow;
            if (range > 0) {
                result[i] = ((closes[i] - lowestLow) / range) * 100;
            } else {
                result[i] = 50; // No range, default to middle
            }
        }

        return result;
    }
}

// Export
window.OscillatorPanel = OscillatorPanel;
