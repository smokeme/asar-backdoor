// Global state management
const state = {
    serverUrl: 'https://localhost:8443',
    clients: {},
    currentClient: null,
    editor: null,
    isConnected: false,
    openFiles: {},
    currentFile: null,
    contextMenuTarget: null,
    commandModal: null,
    refreshInterval: null,
    retryCount: 0,
    maxRetries: 3,
    lastRefresh: 0,  // Track last refresh time to prevent excessive refreshes
    isRefreshing: false // Flag to prevent concurrent refreshes
};

// Initialize state from localStorage
function initState() {
    // Restore server URL from localStorage if available
    const storedUrl = localStorage.getItem('serverUrl');
    if (storedUrl) {
        state.serverUrl = storedUrl;
        document.getElementById('server-url').value = storedUrl;
    } else {
        // Default to a fallback URL if none is stored
        document.getElementById('server-url').value = state.serverUrl;
    }
}

// Save state properties to localStorage
function saveServerUrl(url) {
    localStorage.setItem('serverUrl', url);
    state.serverUrl = url;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initState);