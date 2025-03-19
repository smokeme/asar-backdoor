// Main application logic and event handlers

// Event handlers
async function connectToServer() {
    try {
        // Clear any existing refresh interval
        if (state.refreshInterval) {
            clearInterval(state.refreshInterval);
            state.refreshInterval = null;
        }
        
        const serverUrl = document.getElementById('server-url').value;
        saveServerUrl(serverUrl);
        
        // Show loading indicator
        showLoading();
        
        // Try to connect to the server
        const clients = await api.getClients();
        
        // Update state
        state.clients = clients || {};
        state.isConnected = true;
        state.lastRefresh = Date.now();
        
        // Hide loading indicator
        hideLoading();
        
        // Render the clients list
        renderClientsList();
        showNotification('Connected to server successfully', 'success');
        
        // Hide welcome screen, show status bar
        document.getElementById('welcome-screen').classList.add('d-none');
        document.getElementById('status-bar').classList.remove('d-none');
        
        // If no clients, show a message
        if (Object.keys(clients || {}).length === 0) {
            showNotification('No clients connected to the server', 'warning');
        }
        
        // Set up automatic refresh every 60 seconds (increased from 30 seconds)
        state.refreshInterval = setInterval(refreshClients, 60000);
    } catch (error) {
        hideLoading();
        showNotification('Error connecting to server: ' + error.message, 'danger');
        
        // Try HTTP instead of HTTPS if that might be the issue
        if (error.message.includes('SSL') || error.message.includes('certificate')) {
            const currentUrl = state.serverUrl;
            if (currentUrl.startsWith('https://')) {
                const httpUrl = currentUrl.replace('https://', 'http://');
                showNotification(`Try connecting with HTTP instead: ${httpUrl}`, 'warning');
            }
        }
    }
}

async function refreshClients() {
    if (!state.isConnected) {
        return; // Don't show warning on automatic refresh
    }
    
    // Throttle refreshes to avoid excessive updates
    const now = Date.now();
    if (state.lastRefresh && (now - state.lastRefresh) < 10000) {
        console.log('Skipping refresh - too soon since last refresh');
        return;
    }
    
    try {
        const clients = await api.getClients();
        
        // Update last refresh timestamp
        state.lastRefresh = now;
        
        // Check if there are any changes before updating UI
        const currentClientIds = Object.keys(state.clients || {}).sort().join(',');
        const newClientIds = Object.keys(clients || {}).sort().join(',');
        
        if (currentClientIds !== newClientIds) {
            state.clients = clients || {};
            renderClientsList();
            console.log('Client list updated');
            // Only show notification if there was an actual change
            if (newClientIds.length > currentClientIds.length) {
                showNotification('New client connected', 'info');
            } else if (newClientIds.length < currentClientIds.length) {
                showNotification('Client disconnected', 'warning');
            }
        } else {
            // Just silently update the state without notifications
            state.clients = clients || {};
        }
    } catch (error) {
        console.error('Error refreshing clients:', error);
        // Don't show notification on automatic refresh to avoid spamming the user
        if (error.message.includes('Maximum retry attempts')) {
            // Connection lost
            state.isConnected = false;
            showNotification('Connection to server lost. Please reconnect.', 'danger');
            
            // Clear refresh interval
            if (state.refreshInterval) {
                clearInterval(state.refreshInterval);
                state.refreshInterval = null;
            }
        }
    }
}

async function selectClient(clientId) {
    if (!state.isConnected) {
        showNotification('Not connected to a server', 'warning');
        return;
    }
    
    // Don't reselect the current client
    if (state.currentClient === clientId) {
        return;
    }
    
    try {
        showLoading();
        const clientInfo = await api.selectClient(clientId);
        hideLoading();
        
        if (!clientInfo) {
            showNotification(`Could not connect to client: ${clientId}`, 'danger');
            return;
        }
        
        // Clear any processed results to reset state for the new client
        if (terminal.clearProcessedResults) {
            terminal.clearProcessedResults();
        }
        
        // Show file explorer
        document.getElementById('explorer-panel').classList.remove('d-none');
        
        // Load root directory
        await explorer.navigateTo('/');
        
        // Show terminal
        terminal.show();
        
        // Initialize Monaco editor if not already initialized
        if (!editorInitialized) {
            initMonaco();
        }
        
        showNotification(`Connected to client: ${clientId.substring(0, 10)}...`, 'success');
    } catch (error) {
        hideLoading();
        showNotification('Error connecting to client: ' + error.message, 'danger');
    }
}

// Set up event listeners
function setupEventListeners() {
    // Connect button events
    document.getElementById('connect-btn').addEventListener('click', connectToServer);
    document.getElementById('welcome-connect-btn').addEventListener('click', connectToServer);
    document.getElementById('refresh-btn').addEventListener('click', () => {
        showLoading();
        // Force refresh by clearing the lastRefresh timestamp
        state.lastRefresh = 0;
        refreshClients().finally(() => hideLoading());
    });
    
    // Server URL input change
    document.getElementById('server-url').addEventListener('change', (e) => {
        saveServerUrl(e.target.value);
    });
    
    // Also listen for Enter key in the server URL input
    document.getElementById('server-url').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            connectToServer();
        }
    });
    
    // Command modal events
    const commandModal = new bootstrap.Modal(document.getElementById('command-modal'));
    state.commandModal = commandModal;
    
    document.getElementById('command-cancel').addEventListener('click', () => commandModal.hide());
    document.getElementById('command-execute').addEventListener('click', () => {
        const command = document.getElementById('command-input').value;
        const shell = document.getElementById('shell-select').value;
        if (command) {
            terminal.executeCommand(command, shell);
            commandModal.hide();
        }
    });
    
    // Context menu events
    document.getElementById('menu-open').addEventListener('click', () => {
        if (state.contextMenuTarget && (state.contextMenuTarget.type === 'directory' || state.contextMenuTarget.type === 'drive')) {
            explorer.navigateTo(state.contextMenuTarget.path);
        }
        hideContextMenu();
    });
    
    document.getElementById('menu-edit').addEventListener('click', () => {
        if (state.contextMenuTarget && state.contextMenuTarget.type === 'file') {
            openFile(state.contextMenuTarget.path);
        }
        hideContextMenu();
    });
    
    document.getElementById('menu-download').addEventListener('click', () => {
        // This would be implemented for file downloads
        showNotification('File download not implemented in this demo', 'warning');
        hideContextMenu();
    });
    
    document.getElementById('menu-terminal').addEventListener('click', () => {
        terminal.show();
        hideContextMenu();
    });
    
    document.getElementById('menu-refresh').addEventListener('click', () => {
        if (explorer.currentPath) {
            explorer.navigateTo(explorer.currentPath, false);
        }
        hideContextMenu();
    });
    
    // Editor save shortcut (Ctrl+S)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (state.currentFile) {
                saveFile(state.currentFile);
            }
        }
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});