// File Explorer Module
const explorer = (() => {
    // Private properties
    const elements = {
        fileList: document.getElementById('file-list'),
        currentPath: document.getElementById('current-path'),
        backBtn: document.getElementById('back-btn'),
        homeBtn: document.getElementById('home-btn'),
        upBtn: document.getElementById('up-btn')
    };
    
    // Path history for navigation
    let pathHistory = ['/'];
    let currentPathIndex = 0;
    let currentPath = '/';
    
    // Command tracking
    let lastCommandId = null;
    let processingCommands = {};
    
    // Throttling
    let lastNavigationTime = 0;
    const NAVIGATION_THROTTLE = 500; // ms
    
    // Helper functions
    function getParentPath(path) {
        if (path === '/' || path === 'drives') {
            return '/';
        }
        
        // Handle Windows paths
        if (path.match(/^[A-Za-z]:[\\/]?$/)) {
            return 'drives';
        }
        
        // Handle normal paths
        const parts = path.split(/[\\\/]/);
        parts.pop(); // Remove last part
        
        if (parts.length === 1 && parts[0].match(/^[A-Za-z]:$/)) {
            // Handle root of a drive
            return parts[0] + '\\';
        }
        
        let parentPath = parts.join('/');
        if (!parentPath) {
            return '/';
        }
        
        // Keep Windows drive letter format
        if (parentPath.match(/^[A-Za-z]:$/)) {
            parentPath += '\\';
        }
        
        return parentPath;
    }
    
    function updateNavigationButtons() {
        // Back button
        elements.backBtn.classList.toggle('disabled', currentPathIndex === 0);
        
        // Up button
        elements.upBtn.classList.toggle('disabled', currentPath === '/' || currentPath === 'drives');
    }
    
    function getFolderIcon(item) {
        if (item.type === 'drive') {
            return 'fas fa-hdd text-info';
        } else {
            return 'fas fa-folder text-warning';
        }
    }
    
    function getFileIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        
        if (['js', 'ts', 'jsx', 'tsx'].includes(extension)) {
            return 'fab fa-js-square text-warning';
        } else if (['html', 'htm'].includes(extension)) {
            return 'fab fa-html5 text-danger';
        } else if (extension === 'css') {
            return 'fab fa-css3-alt text-primary';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(extension)) {
            return 'far fa-image text-info';
        } else if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) {
            return 'far fa-file-word text-primary';
        } else if (['xls', 'xlsx', 'ods', 'csv'].includes(extension)) {
            return 'far fa-file-excel text-success';
        } else if (['ppt', 'pptx', 'odp'].includes(extension)) {
            return 'far fa-file-powerpoint text-danger';
        } else if (['pdf'].includes(extension)) {
            return 'far fa-file-pdf text-danger';
        } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
            return 'far fa-file-archive text-warning';
        } else if (['txt', 'md'].includes(extension)) {
            return 'far fa-file-alt text-light';
        } else if (['py'].includes(extension)) {
            return 'fab fa-python text-info';
        } else if (['java'].includes(extension)) {
            return 'fab fa-java text-danger';
        } else if (['sh', 'bash', 'zsh'].includes(extension)) {
            return 'fas fa-terminal text-success';
        } else if (['exe', 'dll', 'bat', 'cmd'].includes(extension)) {
            return 'fas fa-cog text-secondary';
        } else {
            return 'far fa-file text-light';
        }
    }
    
    function formatSize(size) {
        if (size === undefined) return '';
        
        if (size < 1024) {
            return `${size} B`;
        } else if (size < 1024 * 1024) {
            return `${Math.round(size / 1024 * 10) / 10} KB`;
        } else if (size < 1024 * 1024 * 1024) {
            return `${Math.round(size / (1024 * 1024) * 10) / 10} MB`;
        } else {
            return `${Math.round(size / (1024 * 1024 * 1024) * 10) / 10} GB`;
        }
    }
    
    function formatDate(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        return date.toLocaleString();
    }
    
    // Generate a unique command ID
    function generateCommandId() {
        return 'cmd_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
    
    // Public methods
    async function listDirectory(path) {
        if (!state.currentClient) {
            throw new Error('No client selected');
        }
        
        console.log(`Attempting to list directory: ${path}`);
        
        // Throttle directory listing requests to prevent excessive API calls
        const now = Date.now();
        if (processingCommands[path] && (now - processingCommands[path]) < 2000) {
            console.log(`Skipping duplicate directory listing request for ${path} - one is already in progress`);
            throw new Error('Directory listing already in progress');
        }
        
        // Mark this path as being processed
        processingCommands[path] = now;
        
        try {
            // Generate a command ID for tracking
            const commandId = generateCommandId();
            console.log(`Generated command ID for listing: ${commandId}`);
            
            // Send the list command - use plain 'list' with path as string
            console.log(`Sending list command for path: ${path}`);
            await api.sendCommand(state.currentClient, 'list', path, commandId);
            
            // Poll for results
            let attempts = 0;
            const maxAttempts = 30; // Increased max attempts
            let foundResult = false;
            let directoryResult = null;
            
            console.log(`Polling for directory listing results`);
            while (attempts < maxAttempts && !foundResult) {
                attempts++;
                console.log(`Poll attempt ${attempts}/${maxAttempts}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1 second
                
                const results = await api.getResults(state.currentClient);
                console.log(`Got ${results ? results.length : 0} results`);
                
                if (results && results.length > 0) {
                    // Search from newest to oldest
                    for (let i = results.length - 1; i >= 0; i--) {
                        const result = results[i];
                        console.log(`Checking result ${i}:`, result);
                        
                        // Skip results we've already processed
                        const resultKey = `${state.currentClient}_${result.id || i}`;
                        if (api.processedResults && api.processedResults.has(resultKey)) {
                            console.log(`Skipping already processed result ${i}`);
                            continue;
                        }
                        
                        // Look for 'list' type results
                        if (result.type === 'list') {
                            console.log(`Found list result for path: ${result.path}`);
                            
                            // Only use this result if it matches our path
                            // (ignoring case on Windows)
                            const platform = state.clients[state.currentClient]?.platform;
                            const pathMatch = platform === 'win32' 
                                ? result.path?.toLowerCase() === path.toLowerCase()
                                : result.path === path;
                                
                            if (pathMatch) {
                                console.log(`Path matches, using this result`);
                                
                                // Mark this result as processed
                                await api.markResultProcessed(state.currentClient, result.id || i);
                                
                                directoryResult = {
                                    path: result.path,
                                    items: Array.isArray(result.items) ? result.items : [],
                                    error: result.error
                                };
                                
                                foundResult = true;
                                break;
                            } else {
                                console.log(`Path doesn't match, continuing search`);
                            }
                        }
                    }
                }
                
                if (foundResult) {
                    console.log(`Found directory listing result for ${path}`);
                    break;
                }
            }
            
            // Clean up processing state
            delete processingCommands[path];
            
            if (!foundResult) {
                console.error(`Timeout waiting for directory listing of ${path}`);
                throw new Error(`Timeout waiting for directory listing`);
            }
            
            return directoryResult;
        } catch (error) {
            // Clean up processing state
            delete processingCommands[path];
            console.error(`Error listing directory ${path}:`, error);
            throw error;
        }
    }
    
    async function readFile(path) {
        if (!state.currentClient) {
            showNotification('No client selected', 'warning');
            return null;
        }
        
        try {
            // Generate a unique command ID
            const commandId = generateCommandId();
            
            // Mark this command as in-progress
            processingCommands[commandId] = {
                type: 'read',
                path: path,
                timestamp: Date.now()
            };
            
            await api.sendCommand(state.currentClient, 'read', path, commandId);
            
            // Poll for results
            let attempts = 0;
            const maxAttempts = 20;
            
            while (attempts < maxAttempts) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const results = await api.getResults(state.currentClient);
                if (results && results.length > 0) {
                    // Find the result for our specific command
                    for (let i = results.length - 1; i >= 0; i--) {
                        const result = results[i];
                        if (result.type === 'read' && result.path === path && 
                            (result.commandId === commandId || !result.processed)) {
                            
                            // Mark this result as processed
                            await api.markResultProcessed(state.currentClient, result.id || i);
                            
                            // Remove from processing commands
                            delete processingCommands[commandId];
                            
                            return {
                                path: result.path,
                                content: result.content,
                                error: result.error
                            };
                        }
                    }
                }
            }
            
            // Cleanup if timed out
            delete processingCommands[commandId];
            throw new Error('Timeout waiting for file content');
        } catch (error) {
            showNotification('Error reading file: ' + error.message, 'danger');
            return null;
        }
    }
    
    async function writeFile(path, content) {
        if (!state.currentClient) {
            showNotification('No client selected', 'warning');
            return null;
        }
        
        try {
            // Generate a unique command ID
            const commandId = generateCommandId();
            
            // Mark this command as in-progress
            processingCommands[commandId] = {
                type: 'write',
                path: path,
                timestamp: Date.now()
            };
            
            await api.sendCommand(state.currentClient, 'write', {
                path: path,
                content: content
            }, commandId);
            
            // Poll for results
            let attempts = 0;
            const maxAttempts = 20;
            
            while (attempts < maxAttempts) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const results = await api.getResults(state.currentClient);
                if (results && results.length > 0) {
                    // Find the result for our specific command
                    for (let i = results.length - 1; i >= 0; i--) {
                        const result = results[i];
                        if (result.type === 'write' && result.path === path && 
                            (result.commandId === commandId || !result.processed)) {
                            
                            // Mark this result as processed
                            await api.markResultProcessed(state.currentClient, result.id || i);
                            
                            // Remove from processing commands
                            delete processingCommands[commandId];
                            
                            return {
                                path: result.path,
                                success: result.success,
                                error: result.error
                            };
                        }
                    }
                }
            }
            
            // Cleanup if timed out
            delete processingCommands[commandId];
            throw new Error('Timeout waiting for write confirmation');
        } catch (error) {
            showNotification('Error writing file: ' + error.message, 'danger');
            return null;
        }
    }
    
    function renderFileList(path, items) {
        elements.fileList.innerHTML = '';
        
        console.log('Rendering file list for path:', path);
        console.log('Items:', items);
        
        if (!items || items.length === 0) {
            elements.fileList.innerHTML = '<div class="p-2 text-secondary">Empty directory</div>';
            return;
        }
        
        // Group items by type (directories first)
        const directories = items.filter(item => item.type === 'directory' || item.type === 'drive');
        const files = items.filter(item => item.type === 'file');
        
        console.log('Directories:', directories);
        console.log('Files:', files);
        
        // Sort directories and files alphabetically
        directories.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));
        
        // Create elements for directories
        for (const item of directories) {
            createFileListItem(item);
        }
        
        // Create elements for files
        for (const item of files) {
            createFileListItem(item);
        }
    }
    
    function createFileListItem(item) {
        try {
            if (!item || !item.name) {
                console.error('Invalid item:', item);
                return;
            }
            
            console.log('Creating list item for:', item.name, 'Type:', item.type);
            
            const itemEl = document.createElement('div');
            itemEl.className = 'file-item d-flex align-items-center p-2';
            itemEl.dataset.path = item.path;
            itemEl.dataset.type = item.type;
            
            // Icon based on type
            const iconClass = item.type === 'file' ? getFileIcon(item.name) : getFolderIcon(item);
            
            // Format size and date
            const sizeDisplay = formatSize(item.size);
            const dateDisplay = formatDate(item.modified);
            
            itemEl.innerHTML = `
                <i class="${iconClass} me-2 fs-5"></i>
                <div class="flex-grow-1 text-truncate">${item.name}</div>
                <div class="small text-secondary text-end me-2" style="width:80px">${sizeDisplay}</div>
                <div class="small text-secondary text-end d-none d-md-block" style="width:150px">${dateDisplay}</div>
            `;
            
            // Add event listeners
            itemEl.addEventListener('dblclick', () => {
                if (item.type === 'directory' || item.type === 'drive') {
                    navigateTo(item.path);
                } else {
                    openFile(item.path);
                }
            });
            
            // Context menu
            itemEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e.pageX, e.pageY, item);
            });
            
            elements.fileList.appendChild(itemEl);
        } catch (error) {
            console.error('Error creating file list item:', error, item);
        }
    }
    
    async function navigateTo(path, addToHistory = true) {
        if (!state.currentClient) {
            showNotification('No client selected', 'warning');
            return;
        }
        
        // Throttle navigation to prevent excessive refreshes
        const now = Date.now();
        if (now - lastNavigationTime < NAVIGATION_THROTTLE) {
            console.log(`Throttling navigation to ${path} - too soon since last navigation`);
            return;
        }
        lastNavigationTime = now;
        
        // Don't navigate to the same path unless forced
        if (path === currentPath && addToHistory) {
            console.log(`Already at path ${path}, skipping navigation`);
            return;
        }
        
        try {
            console.log(`Navigating to path: ${path}`);
            
            // Check client platform
            const clientInfo = state.clients[state.currentClient];
            console.log(`Client platform: ${clientInfo ? clientInfo.platform : 'unknown'}`);
            
            let navigatePath = path;
            
            // Special case for Windows drives
            if (path === '/' && clientInfo && clientInfo.platform === 'win32') {
                console.log('Windows client detected, listing drives');
                navigatePath = 'drives';
            }
            
            // Show loading indicator
            showLoading();
            console.log(`Listing directory: ${navigatePath}`);
            
            // Get directory listing
            const result = await listDirectory(navigatePath);
            console.log('Directory listing result:', result);
            
            // Hide loading indicator
            hideLoading();
            
            if (!result) {
                console.error('Failed to get directory listing result');
                showNotification('Error: Failed to list directory', 'danger');
                return;
            }
            
            if (result.error) {
                console.error(`Directory listing error: ${result.error}`);
                showNotification(`Error: ${result.error}`, 'danger');
                return;
            }
            
            // Ensure result.items is an array
            if (!Array.isArray(result.items)) {
                console.error('Expected items array but got:', result.items);
                result.items = [];
            }
            
            console.log(`Rendering file list with ${result.items.length} items`);
            renderFileList(result.path, result.items);
            
            if (addToHistory) {
                // Add to history if navigating forward
                if (currentPathIndex < pathHistory.length - 1) {
                    // If we're not at the end of history, truncate the future history
                    pathHistory = pathHistory.slice(0, currentPathIndex + 1);
                }
                pathHistory.push(navigatePath);
                currentPathIndex = pathHistory.length - 1;
            }
            
            // Update current path display
            currentPath = navigatePath;
            elements.currentPath.textContent = navigatePath;
            
            // Update navigation buttons
            updateNavigationButtons();
            console.log(`Navigation to ${navigatePath} complete`);
        } catch (error) {
            // Hide loading indicator
            hideLoading();
            
            console.error('Navigation error:', error);
            
            // Don't show errors for throttled requests
            if (error.message !== 'Directory listing already in progress') {
                showNotification(`Error navigating to directory: ${error.message}`, 'danger');
            }
        }
    }
    
    async function navigateBack() {
        if (currentPathIndex > 0) {
            currentPathIndex--;
            await navigateTo(pathHistory[currentPathIndex], false);
        }
    }
    
    async function navigateForward() {
        if (currentPathIndex < pathHistory.length - 1) {
            currentPathIndex++;
            await navigateTo(pathHistory[currentPathIndex], false);
        }
    }
    
    async function navigateUp() {
        if (currentPath === '/' || currentPath === 'drives') {
            return;
        }
        
        // Get parent directory
        const parentPath = getParentPath(currentPath);
        await navigateTo(parentPath);
    }
    
    async function navigateHome() {
        await navigateTo('/');
    }
    
    // Set up event listeners
    function init() {
        elements.backBtn.addEventListener('click', navigateBack);
        elements.homeBtn.addEventListener('click', navigateHome);
        elements.upBtn.addEventListener('click', navigateUp);
    }
    
    // Initialize the module
    init();
    
    // Public API
    return {
        navigateTo,
        navigateBack,
        navigateForward,
        navigateUp,
        navigateHome,
        readFile,
        writeFile,
        listDirectory,
        get currentPath() { return currentPath; }
    };
})();