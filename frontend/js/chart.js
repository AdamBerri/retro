/**
 * RETRO - High-performance candlestick chart
 * Uses Canvas 2D with optimizations for smooth 60fps rendering
 */

class CandlestickChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        
        // Data
        this.data = [];
        this.indicators = {};
        
        // View state
        this.viewStart = 0;      // Index of first visible candle
        this.viewEnd = 0;        // Index of last visible candle
        this.candleWidth = 8;    // Width of each candle in pixels
        this.minCandleWidth = 2;
        this.maxCandleWidth = 50;
        
        // Margins
        this.margin = { top: 20, right: 80, bottom: 30, left: 20 };
        
        // Colors
        this.colors = {
            background: '#0d1117',
            grid: '#21262d',
            text: '#8b949e',
            candleUp: '#26a69a',
            candleDown: '#ef5350',
            sma20: '#f7b731',
            sma50: '#3867d6',
            sma200: '#8854d0',
            volume: '#30363d',
            crosshair: '#6e7681'
        };
        
        // Interaction state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.hoverIndex = -1;
        
        // Performance
        this.rafId = null;
        this.needsRender = true;
        
        // Bind methods
        this.render = this.render.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        
        // Setup
        this.setupCanvas();
        this.setupEventListeners();
        this.startRenderLoop();
    }
    
    setupCanvas() {
        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
        this.width = rect.width;
        this.height = rect.height;
        
        // Resize observer
        this.resizeObserver = new ResizeObserver(() => {
            const rect = this.canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.ctx.scale(dpr, dpr);
            
            this.width = rect.width;
            this.height = rect.height;
            this.needsRender = true;
        });
        this.resizeObserver.observe(this.canvas);
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    }
    
    startRenderLoop() {
        const loop = () => {
            if (this.needsRender) {
                this.render();
                this.needsRender = false;
            }
            this.rafId = requestAnimationFrame(loop);
        };
        loop();
    }
    
    setData(data) {
        this.data = data;
        
        // Calculate indicators
        const closes = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const volumes = data.map(d => d.volume);
        
        this.indicators = {
            sma20: Indicators.sma(closes, 20),
            sma50: Indicators.sma(closes, 50),
            sma200: Indicators.sma(closes, 200),
            rsi: Indicators.rsi(closes, 14),
            obv: Indicators.obv(closes, volumes)
        };
        
        // Set initial view to show last 100 candles
        const visibleCandles = Math.floor((this.width - this.margin.left - this.margin.right) / this.candleWidth);
        this.viewEnd = data.length - 1;
        this.viewStart = Math.max(0, this.viewEnd - visibleCandles);
        
        this.needsRender = true;
    }
    
    // ============================================
    // RENDERING
    // ============================================
    
    render() {
        const ctx = this.ctx;
        const { width, height, margin, data } = this;
        
        if (!data.length) {
            ctx.fillStyle = this.colors.background;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = this.colors.text;
            ctx.font = '16px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data loaded', width / 2, height / 2);
            return;
        }
        
        // Clear
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, width, height);
        
        // Calculate chart area
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom - 60; // Reserve space for volume
        const volumeHeight = 50;
        
        // Get visible data
        const visibleData = data.slice(this.viewStart, this.viewEnd + 1);
        if (!visibleData.length) return;
        
        // Calculate price range
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        let maxVolume = 0;
        
        for (const d of visibleData) {
            minPrice = Math.min(minPrice, d.low);
            maxPrice = Math.max(maxPrice, d.high);
            maxVolume = Math.max(maxVolume, d.volume);
        }
        
        // Add padding to price range
        const priceRange = maxPrice - minPrice;
        minPrice -= priceRange * 0.05;
        maxPrice += priceRange * 0.05;
        
        // Price to Y coordinate
        const priceToY = (price) => {
            return margin.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
        };
        
        // Index to X coordinate
        const indexToX = (idx) => {
            const relativeIdx = idx - this.viewStart;
            return margin.left + relativeIdx * this.candleWidth + this.candleWidth / 2;
        };
        
        // Draw grid
        this.drawGrid(ctx, minPrice, maxPrice, chartHeight, chartWidth);
        
        // Draw volume bars
        ctx.save();
        const volumeTop = height - margin.bottom - volumeHeight;
        
        for (let i = 0; i < visibleData.length; i++) {
            const d = visibleData[i];
            const x = indexToX(this.viewStart + i);
            const barHeight = (d.volume / maxVolume) * volumeHeight;
            
            ctx.fillStyle = d.close >= d.open ? this.colors.candleUp + '40' : this.colors.candleDown + '40';
            ctx.fillRect(
                x - this.candleWidth / 2 + 1,
                volumeTop + volumeHeight - barHeight,
                this.candleWidth - 2,
                barHeight
            );
        }
        ctx.restore();
        
        // Draw SMAs
        this.drawLine(ctx, this.indicators.sma200, this.viewStart, this.viewEnd, priceToY, indexToX, this.colors.sma200);
        this.drawLine(ctx, this.indicators.sma50, this.viewStart, this.viewEnd, priceToY, indexToX, this.colors.sma50);
        this.drawLine(ctx, this.indicators.sma20, this.viewStart, this.viewEnd, priceToY, indexToX, this.colors.sma20);
        
        // Draw candles
        for (let i = 0; i < visibleData.length; i++) {
            const d = visibleData[i];
            const x = indexToX(this.viewStart + i);
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
            
            if (this.candleWidth > 3) {
                ctx.fillRect(
                    x - this.candleWidth / 2 + 1,
                    bodyTop,
                    this.candleWidth - 2,
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
        
        // Draw crosshair
        if (this.hoverIndex >= 0 && this.hoverIndex < data.length) {
            this.drawCrosshair(ctx, this.hoverIndex, priceToY, indexToX, chartHeight, chartWidth);
        }
        
        // Draw price axis
        this.drawPriceAxis(ctx, minPrice, maxPrice, chartHeight);
    }
    
    drawGrid(ctx, minPrice, maxPrice, chartHeight, chartWidth) {
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        
        // Horizontal lines
        const priceStep = this.niceNumber((maxPrice - minPrice) / 6);
        const startPrice = Math.ceil(minPrice / priceStep) * priceStep;
        
        for (let price = startPrice; price <= maxPrice; price += priceStep) {
            const y = this.margin.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
            
            ctx.beginPath();
            ctx.moveTo(this.margin.left, y);
            ctx.lineTo(this.width - this.margin.right, y);
            ctx.stroke();
        }
    }
    
    drawLine(ctx, values, start, end, priceToY, indexToX, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        let started = false;
        for (let i = start; i <= end; i++) {
            const v = values[i];
            if (isNaN(v)) continue;
            
            const x = indexToX(i);
            const y = priceToY(v);
            
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }
    
    drawPriceAxis(ctx, minPrice, maxPrice, chartHeight) {
        ctx.fillStyle = this.colors.text;
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        
        const priceStep = this.niceNumber((maxPrice - minPrice) / 6);
        const startPrice = Math.ceil(minPrice / priceStep) * priceStep;
        
        for (let price = startPrice; price <= maxPrice; price += priceStep) {
            const y = this.margin.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
            ctx.fillText(this.formatPrice(price), this.width - this.margin.right + 5, y + 4);
        }
    }
    
    drawCrosshair(ctx, index, priceToY, indexToX, chartHeight, chartWidth) {
        const d = this.data[index];
        const x = indexToX(index);
        const y = priceToY(d.close);
        
        ctx.strokeStyle = this.colors.crosshair;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(x, this.margin.top);
        ctx.lineTo(x, this.height - this.margin.bottom);
        ctx.stroke();
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(this.margin.left, y);
        ctx.lineTo(this.width - this.margin.right, y);
        ctx.stroke();
        
        ctx.setLineDash([]);
        
        // Price label
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(this.width - this.margin.right, y - 10, this.margin.right, 20);
        ctx.fillStyle = this.colors.text;
        ctx.textAlign = 'left';
        ctx.fillText(this.formatPrice(d.close), this.width - this.margin.right + 5, y + 4);
        
        // Date label
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(x - 40, this.height - this.margin.bottom, 80, 20);
        ctx.fillStyle = this.colors.text;
        ctx.textAlign = 'center';
        ctx.fillText(d.date, x, this.height - this.margin.bottom + 14);
        
        // Update info callback
        if (this.onHover) {
            this.onHover(index, d, this.indicators);
        }
    }
    
    // ============================================
    // INTERACTION
    // ============================================
    
    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseRatio = (mouseX - this.margin.left) / (this.width - this.margin.left - this.margin.right);
        
        if (e.ctrlKey || e.metaKey) {
            // Zoom
            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
            const newWidth = Math.min(Math.max(this.candleWidth * zoomFactor, this.minCandleWidth), this.maxCandleWidth);
            
            if (newWidth !== this.candleWidth) {
                const visibleBefore = Math.floor((this.width - this.margin.left - this.margin.right) / this.candleWidth);
                this.candleWidth = newWidth;
                const visibleAfter = Math.floor((this.width - this.margin.left - this.margin.right) / this.candleWidth);
                
                const centerIndex = this.viewStart + Math.floor(visibleBefore * mouseRatio);
                this.viewStart = Math.max(0, centerIndex - Math.floor(visibleAfter * mouseRatio));
                this.viewEnd = Math.min(this.data.length - 1, this.viewStart + visibleAfter);
            }
        } else {
            // Pan
            const panAmount = Math.sign(e.deltaY) * Math.max(1, Math.floor(this.getVisibleCount() * 0.1));
            this.pan(panAmount);
        }
        
        this.needsRender = true;
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        if (this.isDragging) {
            const dx = mouseX - this.lastMouseX;
            const candlesPanned = Math.round(dx / this.candleWidth);
            if (candlesPanned !== 0) {
                this.pan(-candlesPanned);
                this.lastMouseX = mouseX;
            }
        } else {
            // Hover
            const relativeX = mouseX - this.margin.left;
            const candleIndex = Math.floor(relativeX / this.candleWidth);
            const dataIndex = this.viewStart + candleIndex;
            
            if (dataIndex >= 0 && dataIndex < this.data.length) {
                this.hoverIndex = dataIndex;
            } else {
                this.hoverIndex = -1;
            }
        }
        
        this.needsRender = true;
    }
    
    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX - this.canvas.getBoundingClientRect().left;
        this.canvas.style.cursor = 'grabbing';
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'crosshair';
    }
    
    handleMouseLeave() {
        this.isDragging = false;
        this.hoverIndex = -1;
        this.canvas.style.cursor = 'crosshair';
        this.needsRender = true;
    }
    
    pan(amount) {
        const visibleCount = this.getVisibleCount();
        this.viewStart = Math.max(0, Math.min(this.data.length - visibleCount, this.viewStart + amount));
        this.viewEnd = Math.min(this.data.length - 1, this.viewStart + visibleCount - 1);
    }
    
    getVisibleCount() {
        return Math.floor((this.width - this.margin.left - this.margin.right) / this.candleWidth);
    }
    
    // Scroll to a specific date
    scrollToDate(date) {
        const idx = this.data.findIndex(d => d.date === date);
        if (idx >= 0) {
            const visibleCount = this.getVisibleCount();
            this.viewStart = Math.max(0, idx - Math.floor(visibleCount / 2));
            this.viewEnd = Math.min(this.data.length - 1, this.viewStart + visibleCount - 1);
            this.hoverIndex = idx;
            this.needsRender = true;
        }
    }
    
    // ============================================
    // UTILITIES
    // ============================================
    
    niceNumber(range) {
        const exponent = Math.floor(Math.log10(range));
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
    
    formatVolume(vol) {
        if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
        if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
        if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
        return vol.toString();
    }
    
    destroy() {
        cancelAnimationFrame(this.rafId);
        this.resizeObserver.disconnect();
        this.canvas.removeEventListener('wheel', this.handleWheel);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    }
}

// Export
window.CandlestickChart = CandlestickChart;
