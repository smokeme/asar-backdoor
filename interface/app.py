from flask import Flask, render_template, request, jsonify, Response
from flask_cors import CORS
import os
import logging
import requests
from urllib.parse import urljoin

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("web_server.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("web_server")

# Create Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)

# Enable CORS for all routes
CORS(app)

# Default C2 server URL
DEFAULT_C2_SERVER = "https://localhost:8443"

# Routes
@app.route('/')
def index():
    """Serve the main web interface"""
    return render_template('base.html')

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

@app.route('/proxy/<path:endpoint>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def proxy_request(endpoint):
    """Proxy requests to the C2 server to avoid CORS issues"""
    # Get the C2 server URL from request headers, or use default
    c2_server = request.headers.get('X-C2-Server', DEFAULT_C2_SERVER)
    
    # Log the proxy request
    logger.info(f"Proxying request to {c2_server}/{endpoint}")
    
    try:
        # Get the request data
        method = request.method
        headers = {key: value for key, value in request.headers.items() 
                  if key.lower() not in ['host', 'content-length']}
        data = request.get_data()
        
        # Log the request data if it's a POST command
        if method == 'POST' and 'command' in endpoint:
            try:
                import json
                data_str = data.decode('utf-8')
                data_json = json.loads(data_str)
                logger.info(f"Command request: {json.dumps(data_json)}")
            except Exception as e:
                logger.warning(f"Could not parse command data: {e}")
        
        # Make the request to the C2 server
        url = urljoin(c2_server, endpoint)
        logger.info(f"Making request to: {url}, Method: {method}")
        
        # Handle SSL verification
        verify_ssl = True
        if 'localhost' in c2_server or '127.0.0.1' in c2_server:
            verify_ssl = False  # Don't verify SSL for localhost
            
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            data=data,
            verify=verify_ssl,
            allow_redirects=False,
            timeout=30  # Add timeout
        )
        
        # Log the response
        logger.info(f"Response status: {response.status_code}")
        
        # Try to log response data for debugging
        try:
            if endpoint.startswith('results/') or endpoint.startswith('clients'):
                content_type = response.headers.get('content-type', '')
                if 'json' in content_type.lower():
                    response_data = response.json()
                    if isinstance(response_data, list) and len(response_data) > 10:
                        logger.info(f"Response contains {len(response_data)} items (truncated)")
                    else:
                        logger.info(f"Response data: {response_data}")
        except Exception as e:
            logger.warning(f"Could not parse response data: {e}")
        
        # Add CORS headers to the response
        proxy_headers = {key: value for key, value in response.headers.items()
                        if key.lower() not in ['transfer-encoding']}
        
        # Ensure content-type is preserved
        if 'content-type' in response.headers:
            proxy_headers['Content-Type'] = response.headers['content-type']
            
        # Return the response from the C2 server
        return Response(
            response.content,
            status=response.status_code,
            headers=proxy_headers
        )
    except Exception as e:
        logger.error(f"Error proxying request: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Create static and templates directories if they don't exist
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates'), exist_ok=True)
    
    # Run the web server
    logger.info("Starting web interface server on http://0.0.0.0:8080")
    app.run(host="0.0.0.0", port=8080, debug=False, use_reloader=False)