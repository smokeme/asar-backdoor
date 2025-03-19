// UI helper functions for the C2 interface

// UI Helper functions
function showLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('d-none');
    loadingOverlay.classList.add('d-flex');
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.add('d-none');
    loadingOverlay.classList.remove('d-flex');
}

function showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    
    // Create notification element
    const toastElement = document.createElement('div');
    toastElement.className = `toast align-items-center text-white bg-${type} border-0`;
    toastElement.setAttribute('role', 'alert');
    toastElement.setAttribute('aria-live', 'assertive');
    toastElement.setAttribute('aria-atomic', 'true');
    
    // Set toast content
    toastElement.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Add to notifications container
    notifications.appendChild(toastElement);
    
    // Create Bootstrap toast and show it
    const toast = new bootstrap.Toast(toastElement, {
        delay: 5000,
        autohide: true
    });
    toast.show();
    
    // Remove element after it's hidden
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

// Context menu handling
function showContextMenu(x, y, target) {
    const contextMenu = document.getElementById('context-menu');
    const menuOpen = document.getElementById('menu-open');
    const menuEdit = document.getElementById('menu-edit');
    const menuDownload = document.getElementById('menu-download');
    
    // Position context menu
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    
    // Show/hide appropriate menu items based on target type
    menuOpen.style.display = (target.type === 'directory' || target.type === 'drive') ? 'block' : 'none';
    menuEdit.style.display = target.type === 'file' ? 'block' : 'none';
    menuDownload.style.display = target.type === 'file' ? 'block' : 'none';
    
    // Store target item
    state.contextMenuTarget = target;
    
    // Show context menu
    contextMenu.classList.remove('d-none');
    
    // Add event listener to hide context menu when clicking elsewhere
    document.addEventListener('click', hideContextMenu);
}

function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    contextMenu.classList.add('d-none');
    document.removeEventListener('click', hideContextMenu);
}

// Client list rendering
function renderClientsList() {
    const clientsList = document.getElementById('clients-list');
    clientsList.innerHTML = '';
    
    if (Object.keys(state.clients).length === 0) {
        clientsList.innerHTML = '<div class="text-secondary p-2">No clients connected</div>';
        return;
    }
    
    for (const [clientId, client] of Object.entries(state.clients)) {
        const clientEl = document.createElement('div');
        clientEl.className = 'p-2 mb-2 rounded';
        
        if (state.currentClient === clientId) {
            clientEl.classList.add('bg-primary');
        } else {
            clientEl.classList.add('bg-secondary');
        }
        
        // Determine platform icon
        let platformIcon = 'fas fa-question-circle';
        if (client.platform === 'win32') {
            platformIcon = 'fab fa-windows';
        } else if (client.platform === 'darwin') {
            platformIcon = 'fab fa-apple';
        } else if (client.platform === 'linux') {
            platformIcon = 'fab fa-linux';
        }
        
        clientEl.innerHTML = `
            <div class="d-flex align-items-start">
                <i class="${platformIcon} mt-1 me-2"></i>
                <div class="flex-grow-1">
                    <div class="fw-bold">${client.hostname}</div>
                    <div class="small text-light">${client.username}@${client.ip_address || 'unknown'}</div>
                    <div class="small text-light text-truncate">${clientId}</div>
                </div>
            </div>
        `;
        
        clientEl.addEventListener('click', () => selectClient(clientId));
        clientsList.appendChild(clientEl);
    }
}