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
        
        // Margins (extra right margin for big price labels)
        this.margin = { top: 20, right: 100, bottom: 40, left: 20 };
        
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
            crosshair: '#8b949e',
            crosshairGlow: 'rgba(139, 148, 158, 0.4)'
        };
        
        // Interaction state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.hoverIndex = -1;

        // Smooth crosshair state (FPS game feel - instant response)
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.displayX = 0;
        this.displayY = 0;
        this.mouseOnCanvas = false;
        this.crosshairLerp = 1.0; // Instant response like FPS - no smoothing delay

        // Performance
        this.rafId = null;
        this.needsRender = true;
        this.alwaysRender = false; // Set true for smooth crosshair animation

        // Smooth zoom state
        this.targetCandleWidth = this.candleWidth;
        this.zoomLerp = 0.25; // Smoothing factor for zoom
        
        // Bind methods
        this.render = this.render.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleMouseEnter = this.handleMouseEnter.bind(this);
        
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
        this.canvas.addEventListener('mouseenter', this.handleMouseEnter);
    }
    
    startRenderLoop() {
        const loop = () => {
            // Update smooth zoom
            this.updateZoom();

            // Render when needed, mouse on canvas, or zoom animating
            if (this.needsRender || this.mouseOnCanvas || this.isZooming()) {
                this.updateCrosshairPosition();
                this.render();
                this.needsRender = false;
            }
            this.rafId = requestAnimationFrame(loop);
        };
        loop();
    }

    updateZoom() {
        const diff = this.targetCandleWidth - this.candleWidth;
        if (Math.abs(diff) < 0.01) {
            if (this.candleWidth !== this.targetCandleWidth) {
                this.candleWidth = this.targetCandleWidth;
                this.needsRender = true;
            }
            return;
        }

        // Lerp toward target
        this.candleWidth += diff * this.zoomLerp;

        // Recalculate view bounds to maintain center
        const visibleCount = this.getVisibleCount();
        this.viewEnd = Math.min(this.data.length - 1, this.viewStart + visibleCount - 1);

        this.needsRender = true;
    }

    isZooming() {
        return Math.abs(this.targetCandleWidth - this.candleWidth) > 0.01;
    }

    updateCrosshairPosition() {
        // Smooth interpolation for that video game feel
        const lerp = (a, b, t) => a + (b - a) * t;

        // Calculate distance to determine lerp speed
        const dx = this.targetX - this.displayX;
        const dy = this.targetY - this.displayY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Use faster lerp for larger distances, slower for precision
        const dynamicLerp = dist > 100 ? 0.5 : this.crosshairLerp;

        this.displayX = lerp(this.displayX, this.targetX, dynamicLerp);
        this.displayY = lerp(this.displayY, this.targetY, dynamicLerp);

        // Snap when very close to prevent endless micro-movements
        if (Math.abs(this.displayX - this.targetX) < 0.5) this.displayX = this.targetX;
        if (Math.abs(this.displayY - this.targetY) < 0.5) this.displayY = this.targetY;
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

        // Sync target with current for clean state
        this.targetCandleWidth = this.candleWidth;

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

        // Draw date labels on X-axis
        this.drawDateAxis(ctx, visibleData, indexToX);
        
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
        
        // Draw crosshair (always when mouse is on canvas - follows mouse freely)
        if (this.mouseOnCanvas) {
            this.drawCrosshair(ctx, this.hoverIndex, priceToY, indexToX, chartHeight, chartWidth, minPrice, maxPrice);
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
        const priceStep = this.niceNumber((maxPrice - minPrice) / 6);
        const startPrice = Math.ceil(minPrice / priceStep) * priceStep;

        for (let price = startPrice; price <= maxPrice; price += priceStep) {
            const y = this.margin.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;

            // Bold axis labels with subtle background
            const labelText = this.formatPrice(price);
            ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
            const textWidth = ctx.measureText(labelText).width;

            // Subtle background pill
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            this.roundRect(ctx, this.width - this.margin.right + 3, y - 10, textWidth + 10, 20, 3);
            ctx.fill();

            // Bold white text
            ctx.fillStyle = '#e6e6e6';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, this.width - this.margin.right + 8, y);
        }
    }

    drawDateAxis(ctx, visibleData, indexToX) {
        if (!visibleData.length) return;

        // Show ~5-7 date labels evenly spaced
        const numLabels = Math.min(7, Math.max(3, Math.floor(visibleData.length / 15)));
        const step = Math.floor(visibleData.length / numLabels);

        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (let i = 0; i < visibleData.length; i += step) {
            const d = visibleData[i];
            const x = indexToX(this.viewStart + i);
            const y = this.height - this.margin.bottom + 8;

            // Format date nicely (show month/day or year depending on zoom)
            const dateStr = d.date; // YYYY-MM-DD format
            const parts = dateStr.split('-');
            const shortDate = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : dateStr;

            // Subtle background
            const textWidth = ctx.measureText(shortDate).width;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            this.roundRect(ctx, x - textWidth / 2 - 5, y - 2, textWidth + 10, 18, 3);
            ctx.fill();

            // Bold text
            ctx.fillStyle = '#c0c0c0';
            ctx.fillText(shortDate, x, y);
        }
    }

    drawCrosshair(ctx, index, priceToY, indexToX, chartHeight, chartWidth, minPrice, maxPrice) {
        // FPS-style: crosshair follows mouse EXACTLY, no clamping
        const cursorX = this.displayX;
        const cursorY = this.displayY;

        // Calculate price at cursor position (can be outside range)
        const priceAtCursor = maxPrice - ((cursorY - this.margin.top) / chartHeight) * (maxPrice - minPrice);

        // Get candle data if hovering over one
        const hasCandle = index >= 0 && index < this.data.length;
        const d = hasCandle ? this.data[index] : null;

        ctx.save();

        // === CROSSHAIR LINES - full screen, FPS style ===
        ctx.shadowColor = 'rgba(100, 180, 255, 0.5)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(150, 180, 220, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        // Vertical line - spans full canvas height at mouse X
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, this.height);
        ctx.stroke();

        // Horizontal line - spans full canvas width at mouse Y
        ctx.beginPath();
        ctx.moveTo(0, cursorY);
        ctx.lineTo(this.width, cursorY);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // === CENTER CROSSHAIR DOT ===
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100, 180, 255, 0.9)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // === BOLD PRICE LABEL ON Y-AXIS ===
        const priceLabelH = 32;
        const priceLabelW = this.margin.right - 4;
        const priceLabelX = this.width - this.margin.right + 2;
        const priceLabelY = Math.max(0, Math.min(this.height - priceLabelH, cursorY - priceLabelH / 2));

        // Bright, bold background
        ctx.fillStyle = '#4da6ff';
        ctx.shadowColor = 'rgba(77, 166, 255, 0.6)';
        ctx.shadowBlur = 10;
        this.roundRect(ctx, priceLabelX, priceLabelY, priceLabelW, priceLabelH, 5);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Bold price text
        ctx.fillStyle = '#000';
        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.formatPrice(priceAtCursor), priceLabelX + priceLabelW / 2, priceLabelY + priceLabelH / 2);

        // === BOLD DATE LABEL ON X-AXIS ===
        const dateLabelH = 30;
        const dateLabelW = 110;
        const dateLabelX = Math.max(0, Math.min(this.width - dateLabelW, cursorX - dateLabelW / 2));
        const dateLabelY = this.height - this.margin.bottom + 6;

        // Bright, bold background
        ctx.fillStyle = '#4da6ff';
        ctx.shadowColor = 'rgba(77, 166, 255, 0.6)';
        ctx.shadowBlur = 10;
        this.roundRect(ctx, dateLabelX, dateLabelY, dateLabelW, dateLabelH, 5);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Bold date text
        ctx.fillStyle = '#000';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hasCandle ? d.date : '—', dateLabelX + dateLabelW / 2, dateLabelY + dateLabelH / 2);

        ctx.restore();

        // Update info callback
        if (hasCandle && this.onHover) {
            this.onHover(index, d, this.indicators);
        }
    }

    // Helper for rounded rectangles
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
    
    // ============================================
    // INTERACTION
    // ============================================
    
    handleWheel(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseRatio = (mouseX - this.margin.left) / (this.width - this.margin.left - this.margin.right);

        // Pinch-to-zoom on trackpad (browser sends ctrlKey=true for pinch gestures)
        if (e.ctrlKey) {
            // Normalize deltaY for consistent zoom across devices
            const normalizedDelta = -Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) / 100;
            const zoomIntensity = 0.5;
            const zoomFactor = 1 + normalizedDelta * zoomIntensity;

            const newWidth = Math.min(Math.max(this.targetCandleWidth * zoomFactor, this.minCandleWidth), this.maxCandleWidth);

            if (newWidth !== this.targetCandleWidth) {
                const visibleBefore = Math.floor((this.width - this.margin.left - this.margin.right) / this.candleWidth);
                const centerIndex = this.viewStart + Math.floor(visibleBefore * mouseRatio);

                this.targetCandleWidth = newWidth;

                // Adjust view to keep zoom centered on mouse position
                const visibleAfter = Math.floor((this.width - this.margin.left - this.margin.right) / newWidth);
                this.viewStart = Math.max(0, centerIndex - Math.floor(visibleAfter * mouseRatio));
                this.viewEnd = Math.min(this.data.length - 1, this.viewStart + visibleAfter);
            }
        }

        // Horizontal scroll (two-finger swipe left/right on trackpad)
        if (Math.abs(e.deltaX) > 0) {
            const panAmount = -Math.sign(e.deltaX) * Math.max(1, Math.floor(this.getVisibleCount() * 0.05));
            this.pan(panAmount);
        }

        // Vertical scroll without ctrl also pans (for mouse wheel users)
        if (!e.ctrlKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            const panAmount = -Math.sign(e.deltaY) * Math.max(1, Math.floor(this.getVisibleCount() * 0.1));
            this.pan(panAmount);
        }

        this.needsRender = true;
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Track actual mouse position for smooth crosshair
        this.mouseX = mouseX;
        this.mouseY = mouseY;
        this.targetX = mouseX;
        this.targetY = mouseY;
        this.mouseOnCanvas = true;

        // Initialize display position on first move to prevent lerp from origin
        if (this.displayX === 0 && this.displayY === 0) {
            this.displayX = mouseX;
            this.displayY = mouseY;
        }

        if (this.isDragging) {
            const dx = mouseX - this.lastMouseX;
            const candlesPanned = Math.round(dx / this.candleWidth);
            if (candlesPanned !== 0) {
                this.pan(-candlesPanned);
                this.lastMouseX = mouseX;
            }
        } else {
            // Find nearest candle for data display
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
        this.canvas.style.cursor = this.mouseOnCanvas ? 'none' : 'default';
    }
    
    handleMouseLeave() {
        this.isDragging = false;
        this.hoverIndex = -1;
        this.mouseOnCanvas = false;
        this.canvas.style.cursor = 'default';
        this.needsRender = true;
    }

    handleMouseEnter(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Teleport crosshair to mouse position on enter (no lerp from old position)
        this.displayX = e.clientX - rect.left;
        this.displayY = e.clientY - rect.top;
        this.targetX = this.displayX;
        this.targetY = this.displayY;
        this.mouseOnCanvas = true;
        // Hide native cursor for clean game-like feel
        this.canvas.style.cursor = 'none';
    }
    
    pan(amount) {
        const visibleCount = this.getVisibleCount();
        this.viewStart = Math.max(0, Math.min(this.data.length - visibleCount, this.viewStart + amount));
        this.viewEnd = Math.min(this.data.length - 1, this.viewStart + visibleCount - 1);
    }
    
    getVisibleCount() {
        return Math.floor((this.width - this.margin.left - this.margin.right) / this.candleWidth);
    }
    
    // Scroll to a specific date (finds closest match for aggregated timeframes)
    scrollToDate(date) {
        let idx = this.data.findIndex(d => d.date === date);

        // If exact match not found, find the closest date
        // (needed for aggregated timeframes where candles span multiple days)
        if (idx < 0) {
            const targetTime = new Date(date).getTime();
            let closestIdx = 0;
            let closestDiff = Infinity;

            for (let i = 0; i < this.data.length; i++) {
                const candleTime = new Date(this.data[i].date).getTime();
                const diff = Math.abs(candleTime - targetTime);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIdx = i;
                }
            }
            idx = closestIdx;
        }

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
        this.canvas.removeEventListener('mouseenter', this.handleMouseEnter);
    }
}

// Export
window.CandlestickChart = CandlestickChart;
