// Overrides for fetch API to handle SSL certificate issues and CORS
(function() {
    // Store the original fetch function
    const originalFetch = window.fetch;
    
    // Override fetch to handle SSL certificate issues
    window.fetch = async function(url, options = {}) {
        // Add CORS mode to all requests
        options.mode = 'cors';
        
        try {
            return await originalFetch(url, options);
        } catch (error) {
            // Handle certificate errors by showing a more friendly message
            if (error.message.includes('SSL') || error.message.includes('certificate')) {
                console.error('SSL Certificate Error:', error);
                showNotification('SSL Certificate Error: Please add an exception for this certificate in your browser or use HTTP instead.', 'warning');
            }
            
            // Continue to throw the error for other handlers
            throw error;
        }
    };
    
    // Helper function to show notification if not defined yet
    function showNotification(message, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.warn(message);
        }
    }
})(); 