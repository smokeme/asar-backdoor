// Terminal Module
const terminal = (() => {
    // Private properties
    const elements = {
        container: document.getElementById('terminal-container'),
        output: document.getElementById('terminal-output'),
        input: document.getElementById('terminal-input'),
        commandModal: document.getElementById('command-modal'),
        commandInput: document.getElementById('command-input'),
        shellSelect: document.getElementById('shell-select')
    };
    
    // Command history
    const commandHistory = [];
    let historyIndex = -1;
    
    // Track processed results to avoid duplicates
    const processedResults = new Set();
    
    // Command tracking
    const processingCommands = {};
    
    // Private methods
    function clearInput() {
        elements.input.value = '';
    }
    
    function scrollToBottom() {
        elements.output.scrollTop = elements.output.scrollHeight;
    }
    
    function addToHistory(command) {
        // Add command to history if it's not empty and not the same as the last command
        if (command && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command)) {
            commandHistory.push(command);
        }
        
        // Reset history index
        historyIndex = commandHistory.length;
    }
    
    function addOutput(content, isCommand = false) {
        const outputElement = document.createElement('div');
        
        if (isCommand) {
            outputElement.innerHTML = `<span class="text-success">$</span> <span class="text-light">${content}</span>`;
        } else {
            outputElement.className = 'text-light font-monospace small';
            outputElement.style.whiteSpace = 'pre-wrap';
            outputElement.textContent = content;
        }
        
        elements.output.appendChild(outputElement);
        scrollToBottom();
    }
    
    // Generate a unique command ID
    function generateCommandId() {
        return 'cmd_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
    
    // Determine if a result has already been processed
    function isResultProcessed(resultId, resultTimestamp) {
        if (!resultId && !resultTimestamp) return false;
        
        // Create a unique key for this result
        const key = resultId ? 
            (resultTimestamp ? `${resultId}_${resultTimestamp}` : `${resultId}`) : 
            `timestamp_${resultTimestamp}`;
            
        console.log(`Checking if result is processed: ${key}`);
        return processedResults.has(key);
    }
    
    // Mark a result as processed
    function markResultProcessed(resultId, resultTimestamp) {
        if (!resultId && !resultTimestamp) return;
        
        // Create a unique key for this result
        const key = resultId ? 
            (resultTimestamp ? `${resultId}_${resultTimestamp}` : `${resultId}`) : 
            `timestamp_${resultTimestamp}`;
            
        console.log(`Marking result as processed: ${key}`);
        processedResults.add(key);
        
        // Limit size of processedResults set to prevent memory issues
        if (processedResults.size > 100) {
            // Remove oldest entries when set gets too large
            const valuesIterator = processedResults.values();
            for (let i = 0; i < 20; i++) {
                processedResults.delete(valuesIterator.next().value);
            }
        }
    }
    
    // Public methods
    async function executeCommand(command, shell = 'cmd') {
        if (!state.currentClient) {
            showNotification('No client selected', 'warning');
            return;
        }
        
        try {
            // Add command to terminal output and history
            addOutput(command, true);
            addToHistory(command);
            
            // Clear input
            clearInput();
            
            // Generate a unique command ID
            const commandId = generateCommandId();
            console.log(`Executing command: "${command}" with ID: ${commandId}`);
            
            // Mark this command as in-progress
            processingCommands[commandId] = {
                type: 'exec',
                command: command,
                shell: shell,
                timestamp: Date.now()
            };
            
            // Prepare command for execution
            let finalCommand = command;
            if (shell === 'powershell') {
                finalCommand = 'ps:' + command;
            }
            
            // Send command to server - this is the critical change
            // We're using commandId differently than the server expects
            await api.sendCommand(state.currentClient, 'exec', finalCommand, commandId);
            
            // Poll for results
            let attempts = 0;
            const maxAttempts = 30; // Increased to give more time
            let foundResult = false;
            
            while (attempts < maxAttempts && !foundResult) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1 second
                
                console.log(`Polling for results (attempt ${attempts}/${maxAttempts})`);
                const results = await api.getResults(state.currentClient);
                console.log(`Got ${results ? results.length : 0} results`);
                
                if (results && results.length > 0) {
                    // Loop through results from newest to oldest
                    for (let i = results.length - 1; i >= 0; i--) {
                        const result = results[i];
                        console.log(`Checking result ${i}:`, result);
                        
                        // Skip results we've already processed
                        const resultKey = `${state.currentClient}_${result.id || i}`;
                        if (api.processedResults && api.processedResults.has(resultKey)) {
                            console.log(`Skipping already processed result ${i}`);
                            continue;
                        }
                        
                        // Check if this is an exec result that hasn't been processed yet
                        if (result.type === 'exec') {
                            console.log(`Found exec result ${i}:`, result);
                            
                            // Mark this result as processed
                            await api.markResultProcessed(state.currentClient, result.id || i);
                            
                            // Remove from processing commands
                            delete processingCommands[commandId];
                            
                            // Add result to terminal output
                            addOutput(result.output || result.error || 'Command executed with no output');
                            foundResult = true;
                            break;
                        }
                    }
                }
                
                if (foundResult) {
                    console.log('Found and processed result successfully');
                    return;
                }
            }
            
            // If we get here, we timed out waiting for a result
            delete processingCommands[commandId];
            console.error('Timeout waiting for command execution');
            addOutput('Error: Timeout waiting for command execution');
        } catch (error) {
            console.error('Command execution error:', error);
            addOutput(`Error executing command: ${error.message}`);
            showNotification('Error executing command: ' + error.message, 'danger');
        }
    }
    
    function show() {
        elements.container.classList.remove('d-none');
        elements.input.focus();
    }
    
    function hide() {
        elements.container.classList.add('d-none');
    }
    
    function toggle() {
        if (elements.container.classList.contains('d-none')) {
            show();
        } else {
            hide();
        }
    }
    
    function clear() {
        elements.output.innerHTML = '';
    }
    
    function showCommandModal() {
        // Reset input field
        elements.commandInput.value = '';
        
        // Show modal
        const modal = new bootstrap.Modal(elements.commandModal);
        modal.show();
        
        // Focus on input
        elements.commandInput.focus();
    }
    
    // Set up event listeners
    function init() {
        // Terminal input
        elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const command = elements.input.value.trim();
                if (command) {
                    executeCommand(command);
                }
            } else if (e.key === 'ArrowUp') {
                // Navigate up through command history
                if (historyIndex > 0) {
                    historyIndex--;
                    elements.input.value = commandHistory[historyIndex];
                    
                    // Move cursor to end of input
                    setTimeout(() => {
                        elements.input.selectionStart = elements.input.selectionEnd = elements.input.value.length;
                    }, 0);
                }
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                // Navigate down through command history
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    elements.input.value = commandHistory[historyIndex];
                } else {
                    historyIndex = commandHistory.length;
                    elements.input.value = '';
                }
                e.preventDefault();
            } else if (e.key === 'Escape') {
                clearInput();
            }
        });
    }
    
    // Initialize the module
    init();
    
    // Public API
    return {
        executeCommand,
        show,
        hide,
        toggle,
        clear,
        showCommandModal,
        clearProcessedResults: () => processedResults.clear() // Add method to clear processed results
    };
})();