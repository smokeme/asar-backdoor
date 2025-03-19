// Monaco Editor functionality
let editorInitialized = false;

// Initialize Monaco Editor
function initMonaco() {
    if (editorInitialized) return;
    
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.30.1/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        state.editor = monaco.editor.create(document.getElementById('editor-container'), {
            automaticLayout: true,
            theme: 'vs-dark',
            scrollBeyondLastLine: false,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            readOnly: false,
            tabSize: 4,
            insertSpaces: true
        });

        // Handler for editor content changes
        state.editor.onDidChangeModelContent(() => {
            if (state.currentFile && !state.openFiles[state.currentFile].isModified) {
                state.openFiles[state.currentFile].isModified = true;
                
                // Update tab to show "modified" indicator
                updateTabStatus(state.currentFile, true);
            }
        });
        
        editorInitialized = true;
    });
}

// File utility functions
function getFileName(path) {
    const parts = path.split(/[\\\/]/);
    return parts[parts.length - 1];
}

function getFileExtension(filename) {
    const parts = filename.split('.');
    if (parts.length === 1) {
        return '';
    }
    return parts[parts.length - 1].toLowerCase();
}

function getLanguageForFile(filePath) {
    const ext = getFileExtension(filePath);
    const languageMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'md': 'markdown',
        'py': 'python',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'php': 'php',
        'rb': 'ruby',
        'sh': 'shell',
        'bat': 'bat',
        'ps1': 'powershell',
        'sql': 'sql',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'txt': 'plaintext',
        'log': 'plaintext'
    };
    
    return languageMap[ext] || 'plaintext';
}

function getFileIconClass(extension) {
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
    } else {
        return 'far fa-file text-light';
    }
}

// Tab management
function updateTabStatus(filePath, isModified) {
    const tabs = document.querySelectorAll('#tabs .nav-link');
    const tabElement = Array.from(tabs).find(tab => tab.dataset.path === filePath);
    
    if (tabElement) {
        const fileNameEl = tabElement.querySelector('span');
        if (isModified) {
            if (!fileNameEl.textContent.startsWith('*')) {
                fileNameEl.textContent = '*' + fileNameEl.textContent;
            }
        } else {
            if (fileNameEl.textContent.startsWith('*')) {
                fileNameEl.textContent = fileNameEl.textContent.substring(1);
            }
        }
    }
}

async function openFile(filePath) {
    if (!state.currentClient) {
        showNotification('No client selected', 'warning');
        return;
    }
    
    try {
        // Check if file is already open
        if (state.openFiles[filePath]) {
            selectTab(filePath);
            return;
        }
        
        const result = await explorer.readFile(filePath);
        
        if (result.error) {
            showNotification('Error: ' + result.error, 'danger');
            return;
        }
        
        // Create new tab
        createTab(filePath, result.content);
        
        // Select the tab
        selectTab(filePath);
        
        showNotification(`Opened file: ${getFileName(filePath)}`, 'success');
    } catch (error) {
        showNotification('Error opening file: ' + error.message, 'danger');
    }
}

function createTab(filePath, content) {
    const filename = getFileName(filePath);
    const extension = getFileExtension(filename);
    const iconClass = getFileIconClass(extension);
    
    // Create tab element
    const tabElement = document.createElement('li');
    tabElement.className = 'nav-item';
    tabElement.innerHTML = `
        <a class="nav-link" data-bs-toggle="tab" role="tab" data-path="${filePath}">
            <i class="${iconClass} me-1"></i>
            <span>${filename}</span>
            <button type="button" class="btn-close btn-close-white btn-sm ms-2 close-tab" aria-label="Close"></button>
        </a>
    `;
    
    // Add tab to tabs container
    document.getElementById('tabs').appendChild(tabElement);
    
    // Show tabs container if it was hidden
    document.getElementById('tabs-container').classList.remove('d-none');
    
    // Store file in state
    state.openFiles[filePath] = {
        content: content,
        language: getLanguageForFile(filePath),
        isModified: false
    };
    
    // Add event listeners
    const tabLink = tabElement.querySelector('.nav-link');
    const closeBtn = tabElement.querySelector('.close-tab');
    
    tabLink.addEventListener('click', (e) => {
        if (!e.target.closest('.close-tab')) {
            selectTab(filePath);
        }
    });
    
    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeTab(filePath);
    });
}

function selectTab(filePath) {
    if (!state.openFiles[filePath]) {
        return;
    }
    
    // Update current file
    state.currentFile = filePath;
    
    // Update active tab styling
    document.querySelectorAll('#tabs .nav-link').forEach(tab => {
        if (tab.dataset.path === filePath) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Initialize Monaco if not already initialized
    if (!editorInitialized) {
        initMonaco();
        // Need to delay setting content until editor is initialized
        setTimeout(() => {
            setEditorContent(filePath);
        }, 500);
    } else {
        setEditorContent(filePath);
    }
}

function setEditorContent(filePath) {
    // Show editor container
    document.getElementById('editor-container').classList.remove('d-none');
    document.getElementById('welcome-screen').classList.add('d-none');
    
    // Set editor content and language
    const fileInfo = state.openFiles[filePath];
    state.editor.setValue(fileInfo.content || '');
    monaco.editor.setModelLanguage(state.editor.getModel(), fileInfo.language);
    
    // Set editor read-only for binary files
    const ext = getFileExtension(filePath);
    const binaryExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'exe', 'dll', 'so', 'dylib', 'pdf'];
    state.editor.updateOptions({ readOnly: binaryExtensions.includes(ext) });
}

function closeTab(filePath) {
    // Check if file is modified
    if (state.openFiles[filePath].isModified) {
        if (!confirm(`Save changes to ${getFileName(filePath)} before closing?`)) {
            return;
        }
        saveFile(filePath);
    }
    
    // Remove tab element
    const tabElement = Array.from(document.querySelectorAll('#tabs .nav-link')).find(tab => tab.dataset.path === filePath);
    if (tabElement) {
        tabElement.parentElement.remove();
    }
    
    // Remove file from state
    delete state.openFiles[filePath];
    
    // If this was the current file, select another tab or hide editor
    if (state.currentFile === filePath) {
        const remainingFiles = Object.keys(state.openFiles);
        if (remainingFiles.length > 0) {
            selectTab(remainingFiles[0]);
        } else {
            state.currentFile = null;
            document.getElementById('editor-container').classList.add('d-none');
            document.getElementById('tabs-container').classList.add('d-none');
            document.getElementById('welcome-screen').classList.remove('d-none');
        }
    }
}

async function saveFile(filePath) {
    if (!state.currentClient || !filePath || !state.editor) {
        return;
    }
    
    try {
        const content = state.editor.getValue();
        const result = await explorer.writeFile(filePath, content);
        
        if (result.error) {
            showNotification('Error saving file: ' + result.error, 'danger');
            return;
        }
        
        // Update file in state
        state.openFiles[filePath].content = content;
        state.openFiles[filePath].isModified = false;
        
        // Update tab to remove "modified" indicator if any
        updateTabStatus(filePath, false);
        
        showNotification(`Saved file: ${getFileName(filePath)}`, 'success');
    } catch (error) {
        showNotification('Error saving file: ' + error.message, 'danger');
    }
}