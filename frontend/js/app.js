/**
 * RETRO - Main Application
 * Ties together API, chart, command bar, and results browsing
 */

class App {
    constructor() {
        // State
        this.tickers = [];
        this.scanTypes = [];
        this.currentTicker = null;
        this.scanResults = [];
        this.currentResultIndex = -1;

        // Timeframe state
        this.currentTimeframe = '1D';
        this.rawData = {};           // Raw daily data per ticker: { AAPL: [...], MSFT: [...] }
        this.aggregatedCache = {};   // Cached aggregated data: { 'AAPL:1W': [...], 'AAPL:1M': [...] }
        
        // Ticker dropdown state
        this.tickerDropdownOpen = false;
        this.tickerSearchResults = [];
        this.selectedTickerIndex = -1;

        // DOM Elements
        this.elements = {
            commandBar: document.getElementById('command-bar'),
            commandInput: document.getElementById('command-input'),
            commandResults: document.getElementById('command-results'),
            tickerCount: document.getElementById('ticker-count'),
            scanStatus: document.getElementById('scan-status'),
            chartTicker: document.getElementById('chart-ticker'),
            chartPrice: document.getElementById('chart-price'),
            chartChange: document.getElementById('chart-change'),
            resultsList: document.getElementById('results-list'),
            resultsCount: document.getElementById('results-count'),
            resultsNav: document.getElementById('results-nav'),
            resultPosition: document.getElementById('result-position'),
            scanType: document.getElementById('scan-type'),
            scanParams: document.getElementById('scan-params'),
            dateFrom: document.getElementById('date-from'),
            dateTo: document.getElementById('date-to'),
            runScan: document.getElementById('run-scan'),
            // Ticker dropdown
            tickerTrigger: document.getElementById('ticker-trigger'),
            tickerDropdown: document.getElementById('ticker-dropdown'),
            tickerSearchInput: document.getElementById('ticker-search-input'),
            tickerResults: document.getElementById('ticker-results'),
            // Info panel
            infoOpen: document.getElementById('info-open'),
            infoHigh: document.getElementById('info-high'),
            infoLow: document.getElementById('info-low'),
            infoClose: document.getElementById('info-close'),
            infoVolume: document.getElementById('info-volume'),
            infoSma20: document.getElementById('info-sma20'),
            infoSma50: document.getElementById('info-sma50'),
            infoSma200: document.getElementById('info-sma200'),
            infoRsi: document.getElementById('info-rsi'),
        };
        
        // Panel Manager (replaces single chart)
        this.panelManager = new PanelManager(document.getElementById('panels-container'));
        this.panelManager.onHover = this.handleChartHover.bind(this);
        this.panelManager.initializePanels();

        // Indicator menu state
        this.indicatorMenuOpen = false;

        // Initialize
        this.setupEventListeners();
        this.initIndicatorMenu();
        this.setDefaultDates();
        this.loadInitialData();
    }
    
    async loadInitialData() {
        console.log('[RETRO] Starting initial data load...');

        try {
            // Load tickers
            console.log('[RETRO] Fetching tickers from /api/tickers...');
            const tickersRes = await fetch('/api/tickers');

            if (!tickersRes.ok) {
                throw new Error(`Tickers API returned ${tickersRes.status}: ${tickersRes.statusText}`);
            }

            this.tickers = await tickersRes.json();
            console.log(`[RETRO] Loaded ${this.tickers.length} tickers`);
            this.elements.tickerCount.textContent = `${this.tickers.length} tickers loaded`;

            // Load scan types
            console.log('[RETRO] Fetching scan types from /api/scan-types...');
            const scanTypesRes = await fetch('/api/scan-types');

            if (!scanTypesRes.ok) {
                throw new Error(`Scan types API returned ${scanTypesRes.status}: ${scanTypesRes.statusText}`);
            }

            this.scanTypes = await scanTypesRes.json();
            console.log(`[RETRO] Loaded ${this.scanTypes.length} scan types`);
            this.populateScanTypes();

            // Load first ticker for demo
            if (this.tickers.length > 0) {
                console.log(`[RETRO] Loading first ticker: ${this.tickers[0]}`);
                this.loadTicker(this.tickers[0]);
            }

            console.log('[RETRO] Initialization complete');
        } catch (err) {
            console.error('[RETRO] Failed to load initial data:', err);
            console.error('[RETRO] Make sure the backend is running: cargo run');
            this.elements.tickerCount.textContent = 'Error: Backend not running?';
            this.elements.scanStatus.textContent = 'Start server with: cargo run';
        }
    }
    
    populateScanTypes() {
        const select = this.elements.scanType;
        select.innerHTML = '<option value="">Select scan type...</option>';
        
        for (const scan of this.scanTypes) {
            const option = document.createElement('option');
            option.value = scan.id;
            option.textContent = scan.name;
            option.title = scan.description;
            select.appendChild(option);
        }
    }
    
    setDefaultDates() {
        const today = new Date();
        const threeYearsAgo = new Date(today.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
        
        this.elements.dateTo.value = today.toISOString().split('T')[0];
        this.elements.dateFrom.value = threeYearsAgo.toISOString().split('T')[0];
    }
    
    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+K - open command bar
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.openCommandBar();
                return;
            }

            // Escape - close command bar or ticker dropdown
            if (e.key === 'Escape') {
                this.closeCommandBar();
                this.closeTickerDropdown();
                return;
            }

            // If command bar is open, don't process other shortcuts
            if (!this.elements.commandBar.classList.contains('hidden')) return;

            // Skip if in input/select/textarea
            if (this.isInInput()) return;

            // Skip modifier keys (except shift for capitals)
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            // J/K - navigate results (only when we have results)
            if (e.key === 'j' && this.scanResults.length > 0) {
                this.nextResult();
                return;
            } else if (e.key === 'k' && this.scanResults.length > 0) {
                this.prevResult();
                return;
            }

            // Number keys 1-7 for timeframes
            const tfMap = {
                '1': '1D', '2': '1W', '3': '1M', '4': '3M', '5': '6M',
                '6': '1Y', '7': 'ALL'
            };
            if (tfMap[e.key]) {
                this.setTimeframe(tfMap[e.key]);
                // Update the indicator visually
                const btn = document.querySelector(`.tf-btn[data-tf="${tfMap[e.key]}"]`);
                const indicator = document.querySelector('.tf-indicator');
                if (btn && indicator) {
                    this.updateTimeframeIndicator(btn, indicator, true);
                }
                return;
            }

            // TradingView-style "type anywhere to search"
            // Single printable character (letters/numbers) opens command bar
            if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
                e.preventDefault();
                this.openCommandBarWithChar(e.key);
            }
        });
        
        // Command bar
        this.elements.commandInput.addEventListener('input', (e) => {
            this.handleCommandInput(e.target.value);
        });
        
        this.elements.commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeSelectedCommand();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectNextCommand();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectPrevCommand();
            }
        });
        
        document.querySelector('.command-overlay')?.addEventListener('click', () => {
            this.closeCommandBar();
        });
        
        // Scan type change
        this.elements.scanType.addEventListener('change', () => {
            this.updateScanParams();
        });
        
        // Run scan button
        this.elements.runScan.addEventListener('click', () => {
            this.runScan();
        });
        
        // Results navigation
        document.getElementById('prev-result')?.addEventListener('click', () => this.prevResult());
        document.getElementById('next-result')?.addEventListener('click', () => this.nextResult());

        // Timeframe buttons with animated indicator
        this.initTimeframeSelector();

        // Ticker dropdown
        this.initTickerDropdown();

        // Indicator shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.isInInput()) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            switch (e.key.toLowerCase()) {
                case 'i':
                    e.preventDefault();
                    this.toggleIndicatorMenu();
                    break;
                case 'r':
                    e.preventDefault();
                    this.toggleIndicator('panel', 'rsi');
                    break;
                case 'm':
                    e.preventDefault();
                    this.toggleIndicator('panel', 'macd');
                    break;
                case 'b':
                    e.preventDefault();
                    this.toggleIndicator('overlay', 'bollinger');
                    break;
                case 'v':
                    e.preventDefault();
                    this.toggleIndicator('panel', 'volume');
                    break;
            }
        });
    }

    // ============================================
    // TICKER DROPDOWN
    // ============================================

    initTickerDropdown() {
        const trigger = this.elements.tickerTrigger;
        const dropdown = this.elements.tickerDropdown;
        const input = this.elements.tickerSearchInput;

        // Toggle on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTickerDropdown();
        });

        // Search input handling
        input.addEventListener('input', () => {
            this.handleTickerSearch(input.value);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectNextTicker();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectPrevTicker();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.confirmTickerSelection();
            } else if (e.key === 'Escape') {
                this.closeTickerDropdown();
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
                this.closeTickerDropdown();
            }
        });

        // "/" shortcut to focus ticker search (when not in other inputs)
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !this.isInInput()) {
                e.preventDefault();
                this.openTickerDropdown();
            }
        });
    }

    isInInput() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
    }

    toggleTickerDropdown() {
        if (this.tickerDropdownOpen) {
            this.closeTickerDropdown();
        } else {
            this.openTickerDropdown();
        }
    }

    openTickerDropdown() {
        this.tickerDropdownOpen = true;
        this.elements.tickerTrigger.setAttribute('aria-expanded', 'true');
        this.elements.tickerDropdown.classList.remove('dropdown-hidden');
        this.elements.tickerSearchInput.value = '';
        this.elements.tickerSearchInput.focus();
        this.handleTickerSearch('');
    }

    closeTickerDropdown() {
        this.tickerDropdownOpen = false;
        this.elements.tickerTrigger.setAttribute('aria-expanded', 'false');
        this.elements.tickerDropdown.classList.add('dropdown-hidden');
        this.selectedTickerIndex = -1;
    }

    handleTickerSearch(query) {
        const q = query.toLowerCase().trim();
        let results = [];

        if (!q) {
            // Show recent / popular tickers when empty
            results = this.tickers.slice(0, 15);
        } else {
            // Fuzzy search - prioritize starts-with, then contains
            const startsWithMatches = [];
            const containsMatches = [];

            for (const ticker of this.tickers) {
                const lowerTicker = ticker.toLowerCase();
                if (lowerTicker.startsWith(q)) {
                    startsWithMatches.push(ticker);
                } else if (lowerTicker.includes(q)) {
                    containsMatches.push(ticker);
                }
            }

            results = [...startsWithMatches, ...containsMatches].slice(0, 20);
        }

        this.tickerSearchResults = results;
        this.selectedTickerIndex = results.length > 0 ? 0 : -1;
        this.renderTickerResults(results, q);
    }

    renderTickerResults(results, query) {
        const container = this.elements.tickerResults;

        if (results.length === 0) {
            container.innerHTML = `
                <div class="ticker-empty-state">
                    No tickers found for "${query}"
                </div>
            `;
            return;
        }

        container.innerHTML = results.map((ticker, index) => {
            const highlighted = this.highlightMatch(ticker, query);
            const isSelected = index === this.selectedTickerIndex;
            return `
                <div class="ticker-result-item ${isSelected ? 'selected' : ''}"
                     data-ticker="${ticker}"
                     data-index="${index}">
                    <span class="ticker-symbol">${highlighted}</span>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.ticker-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const ticker = item.dataset.ticker;
                this.loadTicker(ticker);
                this.closeTickerDropdown();
            });

            item.addEventListener('mouseenter', () => {
                this.updateTickerSelection(parseInt(item.dataset.index));
            });
        });
    }

    highlightMatch(ticker, query) {
        if (!query) return ticker;
        const lowerTicker = ticker.toLowerCase();
        const idx = lowerTicker.indexOf(query.toLowerCase());
        if (idx === -1) return ticker;

        const before = ticker.slice(0, idx);
        const match = ticker.slice(idx, idx + query.length);
        const after = ticker.slice(idx + query.length);

        return `${before}<span class="ticker-match-highlight">${match}</span>${after}`;
    }

    updateTickerSelection(newIndex) {
        const items = this.elements.tickerResults.querySelectorAll('.ticker-result-item');
        if (this.selectedTickerIndex >= 0 && items[this.selectedTickerIndex]) {
            items[this.selectedTickerIndex].classList.remove('selected');
        }
        this.selectedTickerIndex = newIndex;
        if (newIndex >= 0 && items[newIndex]) {
            items[newIndex].classList.add('selected');
            items[newIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    selectNextTicker() {
        if (this.tickerSearchResults.length === 0) return;
        const newIndex = (this.selectedTickerIndex + 1) % this.tickerSearchResults.length;
        this.updateTickerSelection(newIndex);
    }

    selectPrevTicker() {
        if (this.tickerSearchResults.length === 0) return;
        const newIndex = (this.selectedTickerIndex - 1 + this.tickerSearchResults.length) % this.tickerSearchResults.length;
        this.updateTickerSelection(newIndex);
    }

    confirmTickerSelection() {
        if (this.selectedTickerIndex >= 0 && this.tickerSearchResults[this.selectedTickerIndex]) {
            const ticker = this.tickerSearchResults[this.selectedTickerIndex];
            this.loadTicker(ticker);
            this.closeTickerDropdown();
        }
    }

    // ============================================
    // TIMEFRAME SELECTOR
    // ============================================

    initTimeframeSelector() {
        const buttons = document.querySelectorAll('.tf-btn');
        const indicator = document.querySelector('.tf-indicator');

        if (!indicator) return;

        // Set initial indicator position after layout is complete
        const activeBtn = document.querySelector('.tf-btn.active');
        if (activeBtn) {
            // Use requestAnimationFrame to ensure layout is complete
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.updateTimeframeIndicator(activeBtn, indicator, false);
                });
            });
        }

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tf = btn.dataset.tf;
                this.setTimeframe(tf);
                this.updateTimeframeIndicator(btn, indicator, true);
            });
        });
    }

    updateTimeframeIndicator(activeBtn, indicator, animate = true) {
        const btnRect = activeBtn.getBoundingClientRect();
        const trackRect = activeBtn.parentElement.getBoundingClientRect();

        const offsetLeft = btnRect.left - trackRect.left;
        const width = btnRect.width;

        if (!animate) {
            indicator.style.transition = 'none';
        }

        indicator.style.transform = `translateX(${offsetLeft - 3}px)`;
        indicator.style.width = `${width}px`;

        if (!animate) {
            // Force reflow then restore transition
            indicator.offsetHeight;
            indicator.style.transition = '';
        }
    }

    // ============================================
    // INDICATOR MENU
    // ============================================

    initIndicatorMenu() {
        const trigger = document.getElementById('indicator-trigger');
        const dropdown = document.getElementById('indicator-dropdown');

        if (!trigger || !dropdown) return;

        // Toggle on click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleIndicatorMenu();
        });

        // Handle checkbox changes
        dropdown.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const type = checkbox.dataset.type;
                const indicator = checkbox.dataset.indicator;
                this.toggleIndicator(type, indicator, checkbox.checked);
            });
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
                this.closeIndicatorMenu();
            }
        });

        // Sync checkbox states with panel manager
        this.syncIndicatorCheckboxes();
    }

    toggleIndicatorMenu() {
        const dropdown = document.getElementById('indicator-dropdown');
        const trigger = document.getElementById('indicator-trigger');

        if (!dropdown) return;

        this.indicatorMenuOpen = !this.indicatorMenuOpen;
        dropdown.classList.toggle('dropdown-hidden', !this.indicatorMenuOpen);
        trigger?.setAttribute('aria-expanded', this.indicatorMenuOpen.toString());

        if (this.indicatorMenuOpen) {
            this.syncIndicatorCheckboxes();
        }
    }

    closeIndicatorMenu() {
        const dropdown = document.getElementById('indicator-dropdown');
        const trigger = document.getElementById('indicator-trigger');

        this.indicatorMenuOpen = false;
        dropdown?.classList.add('dropdown-hidden');
        trigger?.setAttribute('aria-expanded', 'false');
    }

    syncIndicatorCheckboxes() {
        const dropdown = document.getElementById('indicator-dropdown');
        if (!dropdown) return;

        dropdown.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            const type = checkbox.dataset.type;
            const indicator = checkbox.dataset.indicator;

            if (type === 'overlay') {
                checkbox.checked = this.panelManager.hasOverlay(indicator);
            } else if (type === 'panel') {
                checkbox.checked = this.panelManager.hasPanel(indicator);
            }
        });
    }

    toggleIndicator(type, indicator, forceState = null) {
        let isEnabled;

        if (type === 'overlay') {
            if (forceState !== null) {
                // Force state from checkbox
                const hasIt = this.panelManager.hasOverlay(indicator);
                if (forceState !== hasIt) {
                    isEnabled = this.panelManager.toggleOverlay(indicator);
                } else {
                    isEnabled = hasIt;
                }
            } else {
                isEnabled = this.panelManager.toggleOverlay(indicator);
            }
        } else if (type === 'panel') {
            if (forceState !== null) {
                const hasIt = this.panelManager.hasPanel(indicator);
                if (forceState !== hasIt) {
                    isEnabled = this.panelManager.togglePanel(indicator);
                } else {
                    isEnabled = hasIt;
                }
            } else {
                isEnabled = this.panelManager.togglePanel(indicator);
            }
        }

        // Sync checkboxes
        this.syncIndicatorCheckboxes();

        return isEnabled;
    }

    // ============================================
    // COMMAND BAR
    // ============================================
    
    openCommandBar() {
        this.elements.commandBar.classList.remove('hidden');
        this.elements.commandInput.value = '';
        this.elements.commandInput.focus();
        this.handleCommandInput('');
    }

    /**
     * Open command bar with a pre-filled character (TradingView-style type-anywhere)
     */
    openCommandBarWithChar(char) {
        this.elements.commandBar.classList.remove('hidden');
        this.elements.commandInput.value = char;
        this.elements.commandInput.focus();
        // Move cursor to end
        this.elements.commandInput.setSelectionRange(char.length, char.length);
        this.handleCommandInput(char);
    }

    closeCommandBar() {
        this.elements.commandBar.classList.add('hidden');
    }
    
    handleCommandInput(query) {
        const results = [];
        const q = query.toLowerCase().trim();
        
        if (!q) {
            // Show recent/popular options
            results.push(
                { type: 'action', title: 'Run Golden Cross Scan', action: () => this.quickScan('golden_cross') },
                { type: 'action', title: 'Run RSI Oversold Scan', action: () => this.quickScan('rsi_oversold') },
                { type: 'action', title: 'Run Volume Spike Scan', action: () => this.quickScan('volume_spike') },
            );
            
            // Top tickers
            for (const ticker of this.tickers.slice(0, 5)) {
                results.push({ type: 'ticker', title: ticker, action: () => this.loadTicker(ticker) });
            }
        } else {
            // Search tickers
            const matchingTickers = this.tickers
                .filter(t => t.toLowerCase().includes(q))
                .slice(0, 10);
            
            for (const ticker of matchingTickers) {
                results.push({ type: 'ticker', title: ticker, action: () => this.loadTicker(ticker) });
            }
            
            // Search scan types
            for (const scan of this.scanTypes) {
                if (scan.name.toLowerCase().includes(q) || scan.id.includes(q)) {
                    results.push({
                        type: 'scan',
                        title: scan.name,
                        subtitle: scan.description,
                        action: () => this.quickScan(scan.id)
                    });
                }
            }
        }
        
        this.renderCommandResults(results);
    }
    
    renderCommandResults(results) {
        const container = this.elements.commandResults;
        container.innerHTML = '';
        
        results.forEach((result, index) => {
            const div = document.createElement('div');
            div.className = 'command-result' + (index === 0 ? ' selected' : '');
            div.dataset.index = index;
            
            const icon = result.type === 'ticker' ? '📈' : result.type === 'scan' ? '🔍' : '⚡';
            
            div.innerHTML = `
                <div class="command-result-icon">${icon}</div>
                <div class="command-result-text">
                    <div class="command-result-title">${result.title}</div>
                    ${result.subtitle ? `<div class="command-result-subtitle">${result.subtitle}</div>` : ''}
                </div>
                <div class="command-result-type">${result.type}</div>
            `;
            
            div.addEventListener('click', () => {
                result.action();
                this.closeCommandBar();
            });
            
            container.appendChild(div);
        });
        
        this.commandResults = results;
        this.selectedCommandIndex = results.length > 0 ? 0 : -1;
    }
    
    selectNextCommand() {
        if (this.commandResults.length === 0) return;
        
        const items = this.elements.commandResults.querySelectorAll('.command-result');
        items[this.selectedCommandIndex]?.classList.remove('selected');
        
        this.selectedCommandIndex = (this.selectedCommandIndex + 1) % this.commandResults.length;
        items[this.selectedCommandIndex]?.classList.add('selected');
        items[this.selectedCommandIndex]?.scrollIntoView({ block: 'nearest' });
    }
    
    selectPrevCommand() {
        if (this.commandResults.length === 0) return;
        
        const items = this.elements.commandResults.querySelectorAll('.command-result');
        items[this.selectedCommandIndex]?.classList.remove('selected');
        
        this.selectedCommandIndex = (this.selectedCommandIndex - 1 + this.commandResults.length) % this.commandResults.length;
        items[this.selectedCommandIndex]?.classList.add('selected');
        items[this.selectedCommandIndex]?.scrollIntoView({ block: 'nearest' });
    }
    
    executeSelectedCommand() {
        if (this.selectedCommandIndex >= 0 && this.commandResults[this.selectedCommandIndex]) {
            this.commandResults[this.selectedCommandIndex].action();
            this.closeCommandBar();
        }
    }
    
    // ============================================
    // DATA LOADING
    // ============================================
    
    async loadTicker(ticker) {
        try {
            this.currentTicker = ticker;
            this.elements.chartTicker.textContent = ticker;
            this.elements.chartTicker.classList.add('loading');

            // Check if we already have raw data cached
            if (!this.rawData[ticker]) {
                const res = await fetch(`/api/ticker/${ticker}`);
                const data = await res.json();

                // Store raw daily data
                this.rawData[ticker] = data.data;

                // Invalidate any stale aggregation cache for this ticker
                this.invalidateCache(ticker);
            }

            // Get data for current timeframe (uses cache if available)
            const displayData = this.getAggregatedData(ticker, this.currentTimeframe);
            this.panelManager.setData(displayData);

            // Update header from raw daily data (always show daily close)
            const rawData = this.rawData[ticker];
            if (rawData.length > 0) {
                const last = rawData[rawData.length - 1];
                const prev = rawData[rawData.length - 2];

                this.elements.chartPrice.textContent = `$${last.close.toFixed(2)}`;

                if (prev) {
                    const change = ((last.close - prev.close) / prev.close * 100).toFixed(2);
                    const isUp = last.close >= prev.close;
                    this.elements.chartChange.textContent = `${isUp ? '+' : ''}${change}%`;
                    this.elements.chartChange.className = isUp ? 'up' : 'down';
                }
            }

            this.elements.chartTicker.classList.remove('loading');
        } catch (err) {
            console.error('Failed to load ticker:', err);
            this.elements.chartTicker.classList.remove('loading');
        }
    }
    
    // ============================================
    // SCANNING
    // ============================================
    
    updateScanParams() {
        const scanId = this.elements.scanType.value;
        const scan = this.scanTypes.find(s => s.id === scanId);
        
        this.elements.scanParams.innerHTML = '';
        
        if (!scan || !scan.params.length) return;
        
        for (const param of scan.params) {
            const label = document.createElement('label');
            label.innerHTML = `
                ${param.name}:
                <input type="${param.param_type === 'number' ? 'number' : 'text'}" 
                       name="${param.name}" 
                       value="${param.default}"
                       title="${param.description}">
            `;
            this.elements.scanParams.appendChild(label);
        }
    }
    
    async quickScan(scanType) {
        this.elements.scanType.value = scanType;
        this.updateScanParams();
        await this.runScan();
    }
    
    async runScan() {
        const scanType = this.elements.scanType.value;
        if (!scanType) {
            alert('Please select a scan type');
            return;
        }
        
        // Collect params
        const params = {};
        const inputs = this.elements.scanParams.querySelectorAll('input');
        for (const input of inputs) {
            const value = input.type === 'number' ? parseFloat(input.value) : input.value;
            params[input.name] = value;
        }
        
        const query = {
            scan_type: scanType,
            params,
            date_from: this.elements.dateFrom.value || null,
            date_to: this.elements.dateTo.value || null,
        };
        
        // Run scan
        this.elements.runScan.disabled = true;
        this.elements.runScan.textContent = 'Scanning...';
        this.elements.scanStatus.textContent = 'Scanning...';
        
        try {
            const start = performance.now();
            
            const res = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query)
            });
            
            const result = await res.json();
            const elapsed = performance.now() - start;
            
            this.elements.scanStatus.textContent = `${result.matches.length} matches in ${elapsed.toFixed(0)}ms (server: ${result.scan_time_ms}ms)`;
            
            this.displayScanResults(result.matches);
        } catch (err) {
            console.error('Scan failed:', err);
            this.elements.scanStatus.textContent = 'Scan failed';
        }
        
        this.elements.runScan.disabled = false;
        this.elements.runScan.textContent = 'Run Scan';
    }
    
    displayScanResults(matches) {
        this.scanResults = matches;
        this.currentResultIndex = matches.length > 0 ? 0 : -1;
        
        this.elements.resultsCount.textContent = `${matches.length} results`;
        
        // Render results list
        const list = this.elements.resultsList;
        list.innerHTML = '';
        
        // Group by ticker for cleaner display
        for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            const div = document.createElement('div');
            div.className = 'result-item' + (i === 0 ? ' active' : '');
            div.dataset.index = i;
            
            div.innerHTML = `
                <div class="result-ticker">${m.ticker}</div>
                <div class="result-date">${m.date}</div>
                <div class="result-price">$${m.close.toFixed(2)}</div>
            `;
            
            div.addEventListener('click', () => {
                this.selectResult(i);
            });
            
            list.appendChild(div);
        }
        
        // Show nav
        if (matches.length > 0) {
            this.elements.resultsNav.classList.remove('hidden');
            this.updateResultPosition();
            this.selectResult(0);
        } else {
            this.elements.resultsNav.classList.add('hidden');
        }
    }
    
    selectResult(index) {
        if (index < 0 || index >= this.scanResults.length) return;
        
        // Update UI
        const items = this.elements.resultsList.querySelectorAll('.result-item');
        items[this.currentResultIndex]?.classList.remove('active');
        this.currentResultIndex = index;
        items[index]?.classList.add('active');
        items[index]?.scrollIntoView({ block: 'nearest' });
        
        this.updateResultPosition();
        
        // Load the ticker and scroll to date
        const result = this.scanResults[index];
        this.loadTicker(result.ticker).then(() => {
            this.panelManager.scrollToDate(result.date);
        });
    }
    
    nextResult() {
        if (this.currentResultIndex < this.scanResults.length - 1) {
            this.selectResult(this.currentResultIndex + 1);
        }
    }
    
    prevResult() {
        if (this.currentResultIndex > 0) {
            this.selectResult(this.currentResultIndex - 1);
        }
    }
    
    updateResultPosition() {
        this.elements.resultPosition.textContent = 
            `${this.currentResultIndex + 1} / ${this.scanResults.length}`;
    }
    
    // ============================================
    // CHART INTERACTION
    // ============================================
    
    handleChartHover(index, data, indicators) {
        this.elements.infoOpen.textContent = `$${data.open.toFixed(2)}`;
        this.elements.infoHigh.textContent = `$${data.high.toFixed(2)}`;
        this.elements.infoLow.textContent = `$${data.low.toFixed(2)}`;
        this.elements.infoClose.textContent = `$${data.close.toFixed(2)}`;
        this.elements.infoVolume.textContent = this.formatVolume(data.volume);
        
        const sma20 = indicators.sma20[index];
        const sma50 = indicators.sma50[index];
        const sma200 = indicators.sma200[index];
        const rsi = indicators.rsi[index];
        
        this.elements.infoSma20.textContent = isNaN(sma20) ? '-' : `$${sma20.toFixed(2)}`;
        this.elements.infoSma50.textContent = isNaN(sma50) ? '-' : `$${sma50.toFixed(2)}`;
        this.elements.infoSma200.textContent = isNaN(sma200) ? '-' : `$${sma200.toFixed(2)}`;
        this.elements.infoRsi.textContent = isNaN(rsi) ? '-' : rsi.toFixed(1);
    }
    
    formatVolume(vol) {
        if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
        if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
        if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
        return vol.toString();
    }

    // ============================================
    // TIMEFRAME AGGREGATION
    // ============================================

    /**
     * Aggregate daily OHLCV data to a higher timeframe.
     * Uses caching to avoid recomputation.
     */
    getAggregatedData(ticker, timeframe) {
        // 1D is raw data, no aggregation needed
        if (timeframe === '1D') {
            return this.rawData[ticker] || [];
        }

        const cacheKey = `${ticker}:${timeframe}`;

        // Return cached if available
        if (this.aggregatedCache[cacheKey]) {
            return this.aggregatedCache[cacheKey];
        }

        const dailyData = this.rawData[ticker];
        if (!dailyData || dailyData.length === 0) {
            return [];
        }

        // Aggregate and cache
        const aggregated = this.aggregateOHLCV(dailyData, timeframe);
        this.aggregatedCache[cacheKey] = aggregated;

        return aggregated;
    }

    /**
     * Core aggregation logic. Groups daily candles into larger timeframes.
     * OHLCV rules: O=first, H=max, L=min, C=last, V=sum
     */
    aggregateOHLCV(dailyData, timeframe) {
        const grouper = this.getGroupingFunction(timeframe);
        const groups = new Map();

        // Group candles by their period key
        for (const candle of dailyData) {
            const key = grouper(candle.date);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(candle);
        }

        // Aggregate each group into a single candle
        const result = [];
        for (const [key, candles] of groups) {
            if (candles.length === 0) continue;

            result.push({
                date: candles[candles.length - 1].date, // Use last date in period
                open: candles[0].open,
                high: Math.max(...candles.map(c => c.high)),
                low: Math.min(...candles.map(c => c.low)),
                close: candles[candles.length - 1].close,
                volume: candles.reduce((sum, c) => sum + c.volume, 0)
            });
        }

        return result;
    }

    /**
     * Returns a function that maps a date string to a period key.
     * Dates within the same period get the same key.
     */
    getGroupingFunction(timeframe) {
        switch (timeframe) {
            case '1W':
                // ISO week: Mon-Sun
                return (dateStr) => {
                    const d = new Date(dateStr);
                    const year = d.getUTCFullYear();
                    const week = this.getISOWeek(d);
                    return `${year}-W${week}`;
                };
            case '1M':
                return (dateStr) => dateStr.substring(0, 7); // YYYY-MM
            case '3M':
                return (dateStr) => {
                    const d = new Date(dateStr);
                    const year = d.getUTCFullYear();
                    const quarter = Math.floor(d.getUTCMonth() / 3);
                    return `${year}-Q${quarter}`;
                };
            case '6M':
                return (dateStr) => {
                    const d = new Date(dateStr);
                    const year = d.getUTCFullYear();
                    const half = Math.floor(d.getUTCMonth() / 6);
                    return `${year}-H${half}`;
                };
            case '1Y':
                return (dateStr) => dateStr.substring(0, 4); // YYYY
            case 'ALL':
                // For ALL, we still use daily data (no grouping)
                return (dateStr) => dateStr;
            default:
                return (dateStr) => dateStr; // No grouping
        }
    }

    /**
     * Get ISO week number (1-53)
     */
    getISOWeek(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * Switch to a new timeframe and re-render chart
     */
    setTimeframe(timeframe) {
        if (timeframe === this.currentTimeframe) return;

        this.currentTimeframe = timeframe;

        // Update active class on buttons
        document.querySelectorAll('.tf-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tf === timeframe);
        });

        // Re-render chart with aggregated data
        if (this.currentTicker) {
            const data = this.getAggregatedData(this.currentTicker, timeframe);
            this.panelManager.setData(data);
        }
    }

    /**
     * Clear aggregation cache for a ticker (call when new data arrives)
     */
    invalidateCache(ticker) {
        const keysToDelete = Object.keys(this.aggregatedCache)
            .filter(key => key.startsWith(ticker + ':'));
        keysToDelete.forEach(key => delete this.aggregatedCache[key]);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
