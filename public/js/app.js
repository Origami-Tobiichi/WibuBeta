class KnightBotApp {
    constructor() {
        this.socket = io();
        this.retryCount = 0;
        this.maxRetries = 5;
        this.isConnected = false;
        this.currentQR = null;
        
        this.init();
    }

    init() {
        this.setupSocketListeners();
        this.setupEventHandlers();
        this.startSystemUpdates();
        this.showNotification('🚀 Knight Bot Interface Loaded', 'info');
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.isConnected = true;
            this.updateConnectionBadge('connected');
            this.showNotification('Connected to bot server', 'success');
            this.socket.emit('get-qr');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Disconnected:', reason);
            this.isConnected = false;
            this.updateConnectionBadge('disconnected');
            this.attemptReconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('🚨 Connection error:', error);
            this.showNotification('Connection error: ' + error.message, 'error');
        });

        this.socket.on('bot-status', (status) => {
            this.updateBotStatus(status);
        });

        this.socket.on('qr-image', (qrImage) => {
            this.displayQRCode(qrImage);
        });

        this.socket.on('qr-update', (qrImage) => {
            this.displayQRCode(qrImage);
        });
    }

    setupEventHandlers() {
        // Pairing form
        const pairingForm = document.getElementById('pairingForm');
        if (pairingForm) {
            pairingForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.requestPairingCode();
            });
        }

        // Phone number input validation
        const phoneInput = document.getElementById('phoneNumber');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
        }
    }

    updateBotStatus(status) {
        // Update connection status
        this.updateConnectionBadge(status.connectionStatus);
        document.getElementById('connectionStatus').textContent = this.getStatusText(status.connectionStatus);
        
        // Update last update time
        if (status.lastUpdate) {
            document.getElementById('lastUpdate').textContent = new Date(status.lastUpdate).toLocaleString();
        }

        // Update user info
        const userInfoItem = document.getElementById('userInfoItem');
        const userInfo = document.getElementById('userInfo');
        if (status.user) {
            userInfoItem.style.display = 'flex';
            userInfo.textContent = status.user.name || status.user.id || 'Unknown';
        } else {
            userInfoItem.style.display = 'none';
        }

        // Show/hide panels based on status
        this.updatePanelVisibility(status);

        // Update stats
        if (status.stats) {
            document.getElementById('messagesCount').textContent = status.stats.messagesProcessed || 0;
            document.getElementById('usersCount').textContent = status.stats.usersCount || 0;
        }
    }

    updatePanelVisibility(status) {
        const qrPanel = document.getElementById('qrPanel');
        const pairingPanel = document.getElementById('pairingPanel');
        const pairingResult = document.getElementById('pairingResult');

        // Reset all panels
        qrPanel.style.display = 'none';
        pairingResult.style.display = 'none';

        // Show appropriate panels based on status
        switch (status.connectionStatus) {
            case 'scan_qr':
                qrPanel.style.display = 'block';
                break;
            case 'enter_pairing':
                pairingResult.style.display = 'block';
                document.getElementById('pairingCodeDisplay').textContent = status.pairingCode;
                break;
            case 'requesting_pairing':
                this.showNotification('Requesting pairing code...', 'info');
                break;
        }

        // Always show pairing panel for manual requests
        pairingPanel.style.display = 'block';
    }

    updateConnectionBadge(status) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        
        statusDot.className = 'status-dot';
        statusText.textContent = this.getStatusText(status);

        switch (status) {
            case 'connected':
                statusDot.classList.add('connected');
                break;
            case 'scan_qr':
            case 'requesting_pairing':
                statusDot.classList.add('scanning');
                break;
            case 'reconnecting':
                statusDot.classList.add('reconnecting');
                break;
            default:
                statusDot.classList.add('disconnected');
        }
    }

    getStatusText(status) {
        const statusMap = {
            'connected': 'Connected ✅',
            'disconnected': 'Disconnected ❌',
            'scan_qr': 'Scan QR Code 📱',
            'enter_pairing': 'Enter Pairing Code 🔢',
            'reconnecting': 'Reconnecting 🔄',
            'logged_out': 'Logged Out 🚪',
            'requesting_pairing': 'Requesting Pairing Code ⏳',
            'pairing_error': 'Pairing Error ❌'
        };
        return statusMap[status] || 'Unknown ❓';
    }

    async displayQRCode(qrImage) {
        const qrDisplay = document.getElementById('qrcodeDisplay');
        
        if (qrImage) {
            qrDisplay.innerHTML = `<img src="${qrImage}" alt="QR Code" style="max-width: 100%;">`;
            this.showNotification('QR Code generated - Ready to scan!', 'success');
        } else {
            qrDisplay.innerHTML = `
                <div class="qr-placeholder">
                    <div class="qr-loading">
                        <div class="loading-spinner"></div>
                        Waiting for QR code...
                    </div>
                </div>
            `;
        }
    }

    async requestPairingCode() {
        const phoneNumber = document.getElementById('phoneNumber').value;
        const submitBtn = document.querySelector('#pairingForm button[type="submit"]');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');

        if (!phoneNumber) {
            this.showNotification('Please enter phone number', 'error');
            return;
        }

        if (phoneNumber.length < 10) {
            this.showNotification('Please enter a valid phone number', 'error');
            return;
        }

        // Show loading state
        btnText.style.display = 'none';
        btnLoading.style.display = 'block';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/pairing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Pairing code requested! Check your WhatsApp', 'success');
                document.getElementById('phoneNumber').value = '';
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Pairing request error:', error);
            this.showNotification('Failed to request pairing code', 'error');
        } finally {
            // Restore button state
            btnText.style.display = 'block';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    startSystemUpdates() {
        // Update time every second
        setInterval(() => {
            document.getElementById('currentTime').textContent = new Date().toLocaleString();
        }, 1000);

        // Update system info every 5 seconds
        setInterval(() => {
            this.updateSystemInfo();
        }, 5000);

        // Initial update
        this.updateSystemInfo();
    }

    async updateSystemInfo() {
        try {
            const response = await fetch('/api/system-info');
            const systemInfo = await response.json();
            
            document.getElementById('systemUptime').textContent = systemInfo.uptime;
            document.getElementById('memoryUsage').textContent = systemInfo.memory.free + ' / ' + systemInfo.memory.total;
            document.getElementById('platformInfo').textContent = systemInfo.platform + ' ' + systemInfo.arch;
        } catch (error) {
            console.error('Error fetching system info:', error);
        }
    }

    attemptReconnect() {
        if (this.retryCount < this.maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
            this.showNotification(`Attempting to reconnect... (${this.retryCount + 1}/${this.maxRetries})`, 'warning');
            
            setTimeout(() => {
                this.retryCount++;
                this.socket.connect();
            }, delay);
        } else {
            this.showNotification('Max reconnection attempts reached. Please refresh the page.', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.botApp = new KnightBotApp();
});