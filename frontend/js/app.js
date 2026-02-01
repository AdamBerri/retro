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
        
        // Chart
        this.chart = new CandlestickChart(document.getElementById('chart'));
        this.chart.onHover = this.handleChartHover.bind(this);
        
        // Initialize
        this.setupEventListeners();
        this.setDefaultDates();
        this.loadInitialData();
    }
    
    async loadInitialData() {
        try {
            // Load tickers
            const tickersRes = await fetch('/api/tickers');
            this.tickers = await tickersRes.json();
            this.elements.tickerCount.textContent = `${this.tickers.length} tickers loaded`;
            
            // Load scan types
            const scanTypesRes = await fetch('/api/scan-types');
            this.scanTypes = await scanTypesRes.json();
            this.populateScanTypes();
            
            // Load first ticker for demo
            if (this.tickers.length > 0) {
                this.loadTicker(this.tickers[0]);
            }
        } catch (err) {
            console.error('Failed to load initial data:', err);
            this.elements.tickerCount.textContent = 'Error loading data';
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
            }
            
            // Escape - close command bar
            if (e.key === 'Escape') {
                this.closeCommandBar();
            }
            
            // J/K - navigate results
            if (!this.elements.commandBar.classList.contains('hidden')) return;
            
            if (e.key === 'j') {
                this.nextResult();
            } else if (e.key === 'k') {
                this.prevResult();
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
            
            const res = await fetch(`/api/ticker/${ticker}`);
            const data = await res.json();
            
            this.chart.setData(data.data);
            
            // Update header
            if (data.data.length > 0) {
                const last = data.data[data.data.length - 1];
                const prev = data.data[data.data.length - 2];
                
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
            this.chart.scrollToDate(result.date);
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
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
