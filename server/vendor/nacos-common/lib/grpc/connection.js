"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrpcConnection = void 0;
const events_1 = require("events");
const path = require("path");
const http = require("http");
const https = require("https");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const crypto = require("crypto");
const interface_1 = require("../interface");
const payload_codec_1 = require("./payload_codec");
const PROTO_PATH = path.join(__dirname, '../../proto/nacos_grpc_service.proto');
const GRPC_PORT_OFFSET = 1000;
const HEARTBEAT_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 3000;
const MAX_BACKOFF_MS = 60000;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function generateRequestId() {
    const bytes = crypto.randomBytes(16);
    // Format as UUID v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
class GrpcConnection extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.connected = false;
        this.closed = false;
        this.currentServerIndex = 0;
        this.accessToken = '';
        this.requestClient = null;
        this.biStreamClient = null;
        this.biStream = null;
        this.heartbeatTimer = null;
        this.reconnectBackoff = 1000;
        this.serverPushHandlers = new Map();
        this.pendingRequests = new Map();
        this.grpcDefinition = null;
        this.options = options;
        this.codec = new payload_codec_1.PayloadCodec();
    }
    async login() {
        const { username, password } = this.options;
        if (!username || !password)
            return;
        const serverAddr = this.options.serverList[this.currentServerIndex % this.options.serverList.length];
        const { host, port } = interface_1.parseServerAddress(serverAddr);
        const postData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const protocol = this.options.ssl ? https : http;
        return new Promise((resolve, reject) => {
            const req = protocol.request({
                hostname: host,
                port,
                path: '/nacos/v1/auth/login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                },
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        this.accessToken = json.accessToken || '';
                        this.options.logger.info('[GrpcConnection] Login succeeded, got accessToken');
                        resolve();
                    }
                    catch (e) {
                        this.options.logger.warn('[GrpcConnection] Login response parse failed: %s', data);
                        resolve();
                    }
                });
            });
            req.on('error', (e) => {
                this.options.logger.warn('[GrpcConnection] Login request failed: %s', e.message);
                resolve();
            });
            req.write(postData);
            req.end();
        });
    }
    getAuthHeaders() {
        if (this.accessToken) {
            return { accessToken: this.accessToken };
        }
        return {};
    }
    loadProto() {
        if (this.grpcDefinition)
            return this.grpcDefinition;
        const packageDef = protoLoader.loadSync(PROTO_PATH, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
        });
        this.grpcDefinition = grpc.loadPackageDefinition(packageDef);
        return this.grpcDefinition;
    }
    getCurrentServer() {
        const serverAddr = this.options.serverList[this.currentServerIndex % this.options.serverList.length];
        const { host, port } = interface_1.parseServerAddress(serverAddr);
        return { host, port: port + GRPC_PORT_OFFSET };
    }
    createClients(host, port) {
        const def = this.loadProto();
        const RequestService = def.Request;
        const BiRequestStreamService = def.BiRequestStream;
        const target = `${host}:${port}`;
        const credentials = this.options.ssl
            ? grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();
        // Create Request client first, then share its channel with BiRequestStream.
        // This ensures both services use the same HTTP/2 connection,
        // which is required for the server to match the connectionId.
        this.requestClient = new RequestService(target, credentials);
        this.biStreamClient = new BiRequestStreamService(target, credentials, {
            channelOverride: this.requestClient.getChannel(),
        });
    }
    sendUnary(payload) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`gRPC unary request timed out after ${REQUEST_TIMEOUT_MS}ms`));
            }, REQUEST_TIMEOUT_MS);
            this.requestClient.request(payload, (err, response) => {
                clearTimeout(timer);
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            });
        });
    }
    async performHandshake() {
        const logger = this.options.logger;
        await this.login();
        const { host, port } = this.getCurrentServer();
        logger.info('[GrpcConnection] Connecting to %s:%d', host, port);
        this.createClients(host, port);
        // Step 1: ServerCheck
        const serverCheckReq = this.codec.encode({ requestId: generateRequestId() }, 'ServerCheckRequest', this.getAuthHeaders());
        const serverCheckResp = await this.sendUnary(serverCheckReq);
        const { type: respType, body: respBody } = this.codec.decode(serverCheckResp);
        if (respType === 'ErrorResponse') {
            throw new Error(`ServerCheck failed: errorCode=${respBody.errorCode}, resultCode=${respBody.resultCode}`);
        }
        const connectionId = respBody.connectionId || '';
        logger.info('[GrpcConnection] ServerCheck passed, connectionId=%s', connectionId);
        // Step 2: Open BiRequestStream
        this.biStream = this.biStreamClient.requestBiStream();
        // Step 3: Send ConnectionSetupRequest through BiStream
        const setupReq = this.codec.encode({
            requestId: generateRequestId(),
            clientVersion: '2.0.0',
            tenant: this.options.namespace || 'public',
            labels: this.options.labels || {},
            clientAbilities: {
                remoteAbility: {
                    supportRemoteConnection: true,
                },
                configAbility: {
                    supportRemoteMetrics: false,
                },
                namingAbility: {
                    supportDeltaPush: false,
                    supportRemoteMetric: false,
                },
            },
            abilityTable: this.options.abilityTable || {},
        }, 'ConnectionSetupRequest', this.getAuthHeaders());
        this.biStream.write(setupReq);
        // Listen for incoming server push messages
        this.biStream.on('data', (payload) => {
            this.handleIncomingPayload(payload);
        });
        this.biStream.on('error', (err) => {
            logger.error('[GrpcConnection] BiStream error: %s', err.message);
            if (this.connected) {
                this.connected = false;
                this.emit('disconnected', err);
                if (!this.closed) {
                    this.scheduleReconnect();
                }
            }
        });
        this.biStream.on('end', () => {
            logger.warn('[GrpcConnection] BiStream ended');
            if (this.connected) {
                this.connected = false;
                this.emit('disconnected');
                if (!this.closed) {
                    this.scheduleReconnect();
                }
            }
        });
        // Wait for server to process ConnectionSetupRequest
        await sleep(500);
        this.connected = true;
        this.reconnectBackoff = 1000;
        logger.info('[GrpcConnection] Connected to %s:%d', host, port);
        this.emit('connected');
        // Start heartbeat
        this.startHeartbeat();
    }
    handleIncomingPayload(payload) {
        let decoded;
        try {
            decoded = this.codec.decode(payload);
        }
        catch (e) {
            this.options.logger.error('[GrpcConnection] Failed to decode incoming payload: %s', e);
            return;
        }
        const { type, body } = decoded;
        // Handle ConnectResetRequest
        if (type === 'ConnectResetRequest') {
            this.options.logger.info('[GrpcConnection] Received ConnectResetRequest, reconnecting...');
            const resetResp = this.codec.encode({ requestId: body.requestId || generateRequestId() }, 'ConnectResetResponse');
            try {
                this.biStream.write(resetResp);
            }
            catch (_e) {
                // ignore write error during reset
            }
            this.connected = false;
            this.emit('disconnected');
            if (!this.closed) {
                // Switch to next server if hint given
                if (body.serverIp) {
                    // Try to find the server in the list, otherwise cycle
                    this.currentServerIndex = (this.currentServerIndex + 1) % this.options.serverList.length;
                }
                this.scheduleReconnect();
            }
            return;
        }
        // Handle ClientDetectionRequest
        if (type === 'ClientDetectionRequest') {
            const detectionResp = this.codec.encode({ requestId: body.requestId || generateRequestId() }, 'ClientDetectionResponse');
            try {
                this.biStream.write(detectionResp);
            }
            catch (_e) {
                // ignore
            }
            return;
        }
        // Handle PushAckRequest (server push that needs ACK)
        if (type === 'PushAckRequest') {
            // Pass to registered handlers first
        }
        // Route to server push handlers
        const handler = this.serverPushHandlers.get(type);
        if (handler) {
            Promise.resolve()
                .then(() => handler(body))
                .then(response => {
                if (response && body.requestId) {
                    const respPayload = this.codec.encode(response, response.__type || `${type}Response`);
                    try {
                        this.biStream.write(respPayload);
                    }
                    catch (_e) {
                        // ignore
                    }
                }
            })
                .catch(e => {
                this.options.logger.error('[GrpcConnection] Handler error for %s: %s', type, e.message);
            });
        }
        else {
            // Emit as payload event for transport client to handle (response correlation)
            this.emit('payload', decoded);
        }
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(async () => {
            if (!this.connected || this.closed)
                return;
            try {
                const hbPayload = this.codec.encode({ requestId: generateRequestId() }, 'HealthCheckRequest');
                this.biStream.write(hbPayload);
            }
            catch (e) {
                this.options.logger.warn('[GrpcConnection] Heartbeat write failed: %s', e.message);
            }
        }, HEARTBEAT_INTERVAL_MS);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    async scheduleReconnect() {
        this.stopHeartbeat();
        this.rejectAllPending(new Error('Connection lost'));
        const backoff = Math.min(this.reconnectBackoff, MAX_BACKOFF_MS);
        this.reconnectBackoff = Math.min(this.reconnectBackoff * 2, MAX_BACKOFF_MS);
        this.options.logger.info('[GrpcConnection] Reconnecting in %dms...', backoff);
        this.emit('reconnecting', backoff);
        await sleep(backoff);
        if (this.closed)
            return;
        try {
            await this.performHandshake();
            this.emit('reconnected');
        }
        catch (e) {
            this.options.logger.error('[GrpcConnection] Reconnect failed: %s', e.message);
            if (!this.closed) {
                this.scheduleReconnect();
            }
        }
    }
    rejectAllPending(err) {
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(err);
        }
        this.pendingRequests.clear();
    }
    async connect() {
        this.closed = false;
        await this.performHandshake();
    }
    close() {
        this.closed = true;
        this.connected = false;
        this.stopHeartbeat();
        this.rejectAllPending(new Error('Connection closed'));
        if (this.biStream) {
            try {
                this.biStream.end();
            }
            catch (_e) {
                // ignore
            }
            this.biStream = null;
        }
        if (this.requestClient) {
            try {
                this.requestClient.close();
            }
            catch (_e) {
                // ignore
            }
            this.requestClient = null;
        }
        if (this.biStreamClient) {
            try {
                this.biStreamClient.close();
            }
            catch (_e) {
                // ignore
            }
            this.biStreamClient = null;
        }
        this.emit('disconnected');
    }
    isConnected() {
        return this.connected;
    }
    async request(payload) {
        if (!this.connected) {
            throw new Error('GrpcConnection is not connected');
        }
        return this.sendUnary(payload);
    }
    streamWrite(payload) {
        if (!this.connected || !this.biStream) {
            throw new Error('GrpcConnection is not connected');
        }
        this.biStream.write(payload);
    }
    onServerPush(type, handler) {
        this.serverPushHandlers.set(type, handler);
    }
    removeServerPushHandler(type) {
        this.serverPushHandlers.delete(type);
    }
}
exports.GrpcConnection = GrpcConnection;
//# sourceMappingURL=connection.js.map