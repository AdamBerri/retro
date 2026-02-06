/**
 * RETRO - Panel Manager
 * Orchestrates all chart panels with shared view state and synchronized crosshairs
 */

class PanelManager {
    constructor(container) {
        this.container = container;

        // Shared view state across all panels
        this.viewState = {
            viewStart: 0,
            viewEnd: 0,
            candleWidth: 8,
            minCandleWidth: 2,
            maxCandleWidth: 50,
            hoverIndex: -1,
            mouseX: 0,
            mouseY: 0,
            mouseOnCanvas: false
        };

        // Data
        this.data = [];
        this.indicatorCache = new Map();

        // Panels
        this.panels = [];
        this.panelOrder = []; // Panel IDs in display order

        // Config persistence
        this.config = this.loadConfig();

        // Performance
        this.rafId = null;
        this.isDragging = false;
        this.lastMouseX = 0;

        // Margins (shared)
        this.margin = { top: 10, right: 80, bottom: 30, left: 20 };

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
            ema12: '#e91e63',
            ema26: '#9c27b0',
            volume: '#30363d',
            crosshair: '#6e7681',
            rsiLine: '#4fc3f7',
            rsiOverbought: 'rgba(248, 81, 73, 0.3)',
            rsiOversold: 'rgba(63, 185, 80, 0.3)',
            macdLine: '#4fc3f7',
            macdSignal: '#ff9800',
            macdHistUp: 'rgba(38, 166, 154, 0.8)',
            macdHistDown: 'rgba(239, 83, 80, 0.8)',
            bollingerUpper: 'rgba(156, 39, 176, 0.5)',
            bollingerLower: 'rgba(156, 39, 176, 0.5)',
            bollingerFill: 'rgba(156, 39, 176, 0.1)'
        };

        // Event callbacks
        this.onHover = null;

        // Bind methods
        this.render = this.render.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);

        // Setup
        this.setupEventListeners();
        this.startRenderLoop();
    }

    // ============================================
    // CONFIGURATION PERSISTENCE
    // ============================================

    loadConfig() {
        try {
            const saved = localStorage.getItem('retro:panels');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load panel config:', e);
        }

        // Default config
        return {
            panels: [
                { type: 'price', height: 0.6, overlays: ['sma20', 'sma50'] },
                { type: 'volume', height: 0.15 }
            ],
            indicators: {
                sma20: { period: 20, color: '#f7b731' },
                sma50: { period: 50, color: '#3867d6' },
                sma200: { period: 200, color: '#8854d0' },
                ema12: { period: 12, color: '#e91e63' },
                ema26: { period: 26, color: '#9c27b0' },
                rsi: { period: 14 },
                macd: { fast: 12, slow: 26, signal: 9 },
                bollinger: { period: 20, stdDev: 2 }
            }
        };
    }

    saveConfig() {
        const config = {
            panels: this.panels.map(p => ({
                type: p.type,
                height: p.heightRatio,
                overlays: p.overlays || [],
                params: p.params || {}
            })),
            indicators: this.config.indicators
        };

        try {
            localStorage.setItem('retro:panels', JSON.stringify(config));
        } catch (e) {
            console.warn('Failed to save panel config:', e);
        }
    }

    // ============================================
    // PANEL MANAGEMENT
    // ============================================

    initializePanels() {
        // Clear existing panels
        this.panels.forEach(p => p.destroy && p.destroy());
        this.panels = [];
        this.container.innerHTML = '';

        // Create panels from config
        for (const panelConfig of this.config.panels) {
            this.createPanel(panelConfig, false);
        }

        this.normalizeHeights();

        // Defer layout to next frame to ensure DOM is ready
        requestAnimationFrame(() => {
            this.layoutPanels();
        });
    }

    createPanel(config, save = true) {
        let panel;
        const id = `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create container
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-panel-wrapper';
        wrapper.dataset.panelId = id;

        // Create header
        const header = document.createElement('div');
        header.className = 'panel-header-bar';
        header.innerHTML = `
            <span class="panel-label">${this.getPanelLabel(config.type, config.params)}</span>
            <div class="panel-actions">
                ${config.type !== 'price' ? `
                    <button class="panel-btn panel-collapse" title="Collapse">
                        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                    </button>
                    <button class="panel-btn panel-close" title="Remove">
                        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5"/></svg>
                    </button>
                ` : ''}
            </div>
        `;
        wrapper.appendChild(header);

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'chart-panel-canvas';
        wrapper.appendChild(canvas);

        // Create resize handle (except for last panel)
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'panel-resize-handle';
        wrapper.appendChild(resizeHandle);

        this.container.appendChild(wrapper);

        // Create panel instance
        switch (config.type) {
            case 'price':
                panel = new PricePanel(canvas, this, config.overlays || []);
                break;
            case 'volume':
                panel = new VolumePanel(canvas, this);
                break;
            case 'rsi':
                panel = new OscillatorPanel(canvas, this, 'rsi', config.params || { period: 14 });
                break;
            case 'macd':
                panel = new OscillatorPanel(canvas, this, 'macd', config.params || { fast: 12, slow: 26, signal: 9 });
                break;
            case 'stochastic':
                panel = new OscillatorPanel(canvas, this, 'stochastic', config.params || { kPeriod: 14, dPeriod: 3 });
                break;
            default:
                console.warn('Unknown panel type:', config.type);
                return null;
        }

        panel.id = id;
        panel.type = config.type;
        panel.wrapper = wrapper;
        panel.heightRatio = config.height || 0.2;
        panel.collapsed = false;

        // Setup panel event handlers
        this.setupPanelEvents(panel, wrapper);

        this.panels.push(panel);

        if (save) {
            this.normalizeHeights();
            this.layoutPanels();
            this.saveConfig();
        }

        // Set data if available
        if (this.data.length > 0) {
            panel.needsRender = true;
        }

        return panel;
    }

    setupPanelEvents(panel, wrapper) {
        // Collapse button
        const collapseBtn = wrapper.querySelector('.panel-collapse');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                panel.collapsed = !panel.collapsed;
                wrapper.classList.toggle('collapsed', panel.collapsed);
                collapseBtn.querySelector('svg').style.transform = panel.collapsed ? 'rotate(-90deg)' : '';
                this.layoutPanels();
            });
        }

        // Close button
        const closeBtn = wrapper.querySelector('.panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.removePanel(panel.id);
            });
        }

        // Resize handle
        const resizeHandle = wrapper.querySelector('.panel-resize-handle');
        if (resizeHandle) {
            new PanelResizer(resizeHandle, this, panel);
        }
    }

    removePanel(panelId) {
        const index = this.panels.findIndex(p => p.id === panelId);
        if (index === -1) return;

        const panel = this.panels[index];

        // Don't allow removing price panel
        if (panel.type === 'price') return;

        // Cleanup
        if (panel.destroy) panel.destroy();
        panel.wrapper.remove();

        this.panels.splice(index, 1);
        this.normalizeHeights();
        this.layoutPanels();
        this.saveConfig();
    }

    togglePanel(type, params = {}) {
        // Check if panel of this type exists
        const existing = this.panels.find(p => p.type === type);

        if (existing) {
            this.removePanel(existing.id);
            return false;
        } else {
            this.createPanel({ type, height: 0.15, params });
            return true;
        }
    }

    toggleOverlay(overlayName) {
        const pricePanel = this.panels.find(p => p.type === 'price');
        if (!pricePanel) return false;

        const index = pricePanel.overlays.indexOf(overlayName);
        if (index >= 0) {
            pricePanel.overlays.splice(index, 1);
            pricePanel.needsRender = true;
            this.saveConfig();
            return false;
        } else {
            pricePanel.overlays.push(overlayName);
            pricePanel.needsRender = true;
            this.saveConfig();
            return true;
        }
    }

    hasPanel(type) {
        return this.panels.some(p => p.type === type);
    }

    hasOverlay(overlayName) {
        const pricePanel = this.panels.find(p => p.type === 'price');
        return pricePanel && pricePanel.overlays.includes(overlayName);
    }

    getPanelLabel(type, params) {
        switch (type) {
            case 'price': return 'Price';
            case 'volume': return 'Volume';
            case 'rsi': return `RSI (${params?.period || 14})`;
            case 'macd': return 'MACD';
            case 'stochastic': return 'Stochastic';
            default: return type;
        }
    }

    normalizeHeights() {
        // Ensure height ratios sum to 1
        const total = this.panels.reduce((sum, p) => sum + (p.collapsed ? 0 : p.heightRatio), 0);
        if (total > 0) {
            this.panels.forEach(p => {
                if (!p.collapsed) {
                    p.heightRatio = p.heightRatio / total;
                }
            });
        }
    }

    layoutPanels() {
        const containerHeight = this.container.clientHeight;
        if (containerHeight === 0) {
            // Container not ready yet, defer
            requestAnimationFrame(() => this.layoutPanels());
            return;
        }

        const collapsedHeight = 32; // Header height when collapsed

        // Calculate available height for non-collapsed panels
        const collapsedCount = this.panels.filter(p => p.collapsed).length;
        const availableHeight = containerHeight - (collapsedCount * collapsedHeight);

        this.panels.forEach((panel, index) => {
            const wrapper = panel.wrapper;

            if (panel.collapsed) {
                wrapper.style.height = `${collapsedHeight}px`;
            } else {
                const height = Math.floor(availableHeight * panel.heightRatio);
                wrapper.style.height = `${height}px`;
            }

            // Hide resize handle for last panel
            const resizeHandle = wrapper.querySelector('.panel-resize-handle');
            if (resizeHandle) {
                resizeHandle.style.display = index === this.panels.length - 1 ? 'none' : 'block';
            }
        });

        // Use RAF to ensure layout is applied before resizing canvases
        requestAnimationFrame(() => {
            this.panels.forEach(panel => {
                if (!panel.collapsed) {
                    panel.resize();
                }
            });
            this.markAllDirty();
        });
    }

    // ============================================
    // DATA & INDICATORS
    // ============================================

    setData(data) {
        this.data = data;

        // Clear indicator cache
        this.indicatorCache.clear();

        // Set initial view to show last ~100 candles
        if (data.length > 0) {
            const containerWidth = this.container.clientWidth;
            const chartWidth = containerWidth - this.margin.left - this.margin.right;
            const visibleCandles = Math.floor(chartWidth / this.viewState.candleWidth);

            this.viewState.viewEnd = data.length - 1;
            this.viewState.viewStart = Math.max(0, this.viewState.viewEnd - visibleCandles);
        }

        // Ensure panels are properly sized before rendering
        this.layoutPanels();
    }

    getIndicator(name, params = {}) {
        const cacheKey = `${name}:${JSON.stringify(params)}`;

        if (this.indicatorCache.has(cacheKey)) {
            return this.indicatorCache.get(cacheKey);
        }

        // Calculate indicator
        const closes = this.data.map(d => d.close);
        const highs = this.data.map(d => d.high);
        const lows = this.data.map(d => d.low);
        const volumes = this.data.map(d => d.volume);

        let result;

        switch (name) {
            case 'sma20':
                result = Indicators.sma(closes, 20);
                break;
            case 'sma50':
                result = Indicators.sma(closes, 50);
                break;
            case 'sma200':
                result = Indicators.sma(closes, 200);
                break;
            case 'ema12':
                result = Indicators.ema(closes, 12);
                break;
            case 'ema26':
                result = Indicators.ema(closes, 26);
                break;
            case 'rsi':
                result = Indicators.rsi(closes, params.period || 14);
                break;
            case 'macd':
                result = Indicators.macd(closes, params.fast || 12, params.slow || 26, params.signal || 9);
                break;
            case 'bollinger':
                result = Indicators.bollinger(closes, params.period || 20, params.stdDev || 2);
                break;
            case 'obv':
                result = Indicators.obv(closes, volumes);
                break;
            case 'atr':
                result = Indicators.atr(highs, lows, closes, params.period || 14);
                break;
            default:
                console.warn('Unknown indicator:', name);
                return null;
        }

        this.indicatorCache.set(cacheKey, result);
        return result;
    }

    // ============================================
    // RENDERING
    // ============================================

    setupEventListeners() {
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
        this.container.addEventListener('mousemove', this.handleMouseMove);
        this.container.addEventListener('mousedown', this.handleMouseDown);
        this.container.addEventListener('mouseup', this.handleMouseUp);
        this.container.addEventListener('mouseleave', this.handleMouseLeave);

        // Resize observer
        this.resizeObserver = new ResizeObserver(() => {
            this.layoutPanels();
        });
        this.resizeObserver.observe(this.container);
    }

    startRenderLoop() {
        const loop = () => {
            for (const panel of this.panels) {
                if (panel.needsRender && !panel.collapsed) {
                    panel.render();
                    panel.needsRender = false;
                }
            }
            this.rafId = requestAnimationFrame(loop);
        };
        loop();
    }

    markAllDirty() {
        this.panels.forEach(p => p.needsRender = true);
    }

    render() {
        this.markAllDirty();
    }

    // ============================================
    // INTERACTION
    // ============================================

    handleWheel(e) {
        e.preventDefault();

        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseRatio = (mouseX - this.margin.left) / (this.container.clientWidth - this.margin.left - this.margin.right);

        // Pinch-to-zoom on trackpad (browser sends ctrlKey=true for pinch gestures)
        if (e.ctrlKey) {
            const normalizedDelta = -Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) / 100;
            const zoomIntensity = 0.5;
            const zoomFactor = 1 + normalizedDelta * zoomIntensity;

            const newWidth = Math.min(
                Math.max(this.viewState.candleWidth * zoomFactor, this.viewState.minCandleWidth),
                this.viewState.maxCandleWidth
            );

            if (newWidth !== this.viewState.candleWidth) {
                const visibleBefore = this.getVisibleCount();
                const centerIndex = this.viewState.viewStart + Math.floor(visibleBefore * mouseRatio);

                this.viewState.candleWidth = newWidth;
                const visibleAfter = this.getVisibleCount();

                this.viewState.viewStart = Math.max(0, centerIndex - Math.floor(visibleAfter * mouseRatio));
                this.viewState.viewEnd = Math.min(this.data.length - 1, this.viewState.viewStart + visibleAfter);
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

        this.markAllDirty();
    }

    handleMouseMove(e) {
        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Store actual mouse position for free crosshair
        this.viewState.mouseX = mouseX;
        this.viewState.mouseY = mouseY;
        this.viewState.mouseOnCanvas = true;

        if (this.isDragging) {
            const dx = mouseX - this.lastMouseX;
            const candlesPanned = Math.round(dx / this.viewState.candleWidth);
            if (candlesPanned !== 0) {
                this.pan(-candlesPanned);
                this.lastMouseX = mouseX;
            }
        } else {
            // Hover - calculate index for data display
            const relativeX = mouseX - this.margin.left;
            const candleIndex = Math.floor(relativeX / this.viewState.candleWidth);
            const dataIndex = this.viewState.viewStart + candleIndex;

            if (dataIndex >= 0 && dataIndex < this.data.length) {
                this.viewState.hoverIndex = dataIndex;

                // Call hover callback
                if (this.onHover && this.data[dataIndex]) {
                    const indicators = {
                        sma20: this.getIndicator('sma20'),
                        sma50: this.getIndicator('sma50'),
                        sma200: this.getIndicator('sma200'),
                        rsi: this.getIndicator('rsi')
                    };
                    this.onHover(dataIndex, this.data[dataIndex], indicators);
                }
            } else {
                this.viewState.hoverIndex = -1;
            }
        }

        this.markAllDirty();
    }

    handleMouseDown(e) {
        // Check if we're clicking on a panel action button
        if (e.target.closest('.panel-actions')) return;
        if (e.target.closest('.panel-resize-handle')) return;

        this.isDragging = true;
        this.lastMouseX = e.clientX - this.container.getBoundingClientRect().left;
        this.container.style.cursor = 'grabbing';
    }

    handleMouseUp() {
        this.isDragging = false;
        this.container.style.cursor = 'crosshair';
    }

    handleMouseLeave() {
        this.isDragging = false;
        this.viewState.hoverIndex = -1;
        this.viewState.mouseOnCanvas = false;
        this.container.style.cursor = 'crosshair';
        this.markAllDirty();
    }

    pan(amount) {
        const visibleCount = this.getVisibleCount();
        this.viewState.viewStart = Math.max(0, Math.min(this.data.length - visibleCount, this.viewState.viewStart + amount));
        this.viewState.viewEnd = Math.min(this.data.length - 1, this.viewState.viewStart + visibleCount - 1);
    }

    getVisibleCount() {
        const chartWidth = this.container.clientWidth - this.margin.left - this.margin.right;
        return Math.floor(chartWidth / this.viewState.candleWidth);
    }

    scrollToDate(date) {
        let idx = this.data.findIndex(d => d.date === date);

        // Find closest date if exact match not found
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
            this.viewState.viewStart = Math.max(0, idx - Math.floor(visibleCount / 2));
            this.viewState.viewEnd = Math.min(this.data.length - 1, this.viewState.viewStart + visibleCount - 1);
            this.viewState.hoverIndex = idx;
            this.markAllDirty();
        }
    }

    // ============================================
    // CLEANUP
    // ============================================

    destroy() {
        cancelAnimationFrame(this.rafId);
        this.resizeObserver.disconnect();

        this.container.removeEventListener('wheel', this.handleWheel);
        this.container.removeEventListener('mousemove', this.handleMouseMove);
        this.container.removeEventListener('mousedown', this.handleMouseDown);
        this.container.removeEventListener('mouseup', this.handleMouseUp);
        this.container.removeEventListener('mouseleave', this.handleMouseLeave);

        this.panels.forEach(p => p.destroy && p.destroy());
    }
}

// Export
window.PanelManager = PanelManager;
