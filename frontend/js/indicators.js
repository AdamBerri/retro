/**
 * RETRO - Client-side indicators
 * Computed on-the-fly for display purposes
 */

const Indicators = {
    /**
     * Simple Moving Average
     */
    sma(data, period) {
        const result = new Array(data.length).fill(NaN);
        if (data.length < period) return result;
        
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        result[period - 1] = sum / period;
        
        for (let i = period; i < data.length; i++) {
            sum += data[i] - data[i - period];
            result[i] = sum / period;
        }
        
        return result;
    },
    
    /**
     * Exponential Moving Average
     */
    ema(data, period) {
        const result = new Array(data.length).fill(NaN);
        if (data.length < period) return result;
        
        const multiplier = 2 / (period + 1);
        
        // First EMA = SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        result[period - 1] = sum / period;
        
        for (let i = period; i < data.length; i++) {
            result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
        }
        
        return result;
    },
    
    /**
     * Relative Strength Index
     */
    rsi(data, period = 14) {
        const result = new Array(data.length).fill(NaN);
        if (data.length < period + 1) return result;
        
        const gains = [];
        const losses = [];
        
        gains.push(0);
        losses.push(0);
        
        for (let i = 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? -change : 0);
        }
        
        // First average (SMA)
        let avgGain = 0;
        let avgLoss = 0;
        for (let i = 1; i <= period; i++) {
            avgGain += gains[i];
            avgLoss += losses[i];
        }
        avgGain /= period;
        avgLoss /= period;
        
        result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        
        // Smoothed average
        for (let i = period + 1; i < data.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        }
        
        return result;
    },
    
    /**
     * On-Balance Volume
     */
    obv(close, volume) {
        const result = new Array(close.length).fill(0);
        
        for (let i = 1; i < close.length; i++) {
            if (close[i] > close[i - 1]) {
                result[i] = result[i - 1] + volume[i];
            } else if (close[i] < close[i - 1]) {
                result[i] = result[i - 1] - volume[i];
            } else {
                result[i] = result[i - 1];
            }
        }
        
        return result;
    },
    
    /**
     * MACD
     */
    macd(data, fast = 12, slow = 26, signal = 9) {
        const emaFast = this.ema(data, fast);
        const emaSlow = this.ema(data, slow);
        
        const macdLine = emaFast.map((f, i) => f - emaSlow[i]);
        const signalLine = this.ema(macdLine.filter(v => !isNaN(v)), signal);
        
        // Pad signal line to match length
        const paddedSignal = new Array(data.length).fill(NaN);
        let signalIdx = 0;
        for (let i = 0; i < data.length; i++) {
            if (!isNaN(macdLine[i]) && signalIdx < signalLine.length) {
                paddedSignal[i] = signalLine[signalIdx++];
            }
        }
        
        const histogram = macdLine.map((m, i) => m - paddedSignal[i]);
        
        return { macd: macdLine, signal: paddedSignal, histogram };
    },
    
    /**
     * Bollinger Bands
     */
    bollinger(data, period = 20, stdDev = 2) {
        const middle = this.sma(data, period);
        const upper = new Array(data.length).fill(NaN);
        const lower = new Array(data.length).fill(NaN);
        
        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const mean = middle[i];
            const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
            const std = Math.sqrt(variance);
            
            upper[i] = mean + stdDev * std;
            lower[i] = mean - stdDev * std;
        }
        
        return { middle, upper, lower };
    },
    
    /**
     * Average True Range
     */
    atr(high, low, close, period = 14) {
        const tr = new Array(high.length).fill(0);
        tr[0] = high[0] - low[0];
        
        for (let i = 1; i < high.length; i++) {
            const hl = high[i] - low[i];
            const hc = Math.abs(high[i] - close[i - 1]);
            const lc = Math.abs(low[i] - close[i - 1]);
            tr[i] = Math.max(hl, hc, lc);
        }
        
        return this.sma(tr, period);
    },
    
    /**
     * Rolling max/min
     */
    rollingMax(data, period) {
        const result = new Array(data.length).fill(NaN);
        for (let i = period - 1; i < data.length; i++) {
            result[i] = Math.max(...data.slice(i - period + 1, i + 1));
        }
        return result;
    },
    
    rollingMin(data, period) {
        const result = new Array(data.length).fill(NaN);
        for (let i = period - 1; i < data.length; i++) {
            result[i] = Math.min(...data.slice(i - period + 1, i + 1));
        }
        return result;
    }
};

// Export for use
window.Indicators = Indicators;
