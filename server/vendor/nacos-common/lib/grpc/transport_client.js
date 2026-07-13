"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrpcTransportClient = void 0;
const crypto = require("crypto");
const payload_codec_1 = require("./payload_codec");
const DEFAULT_TIMEOUT_MS = 3000;
function generateRequestId() {
    const bytes = crypto.randomBytes(16);
    // Format as UUID v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
class GrpcTransportClient {
    constructor(connection) {
        this.pending = new Map();
        this.connection = connection;
        this.codec = new payload_codec_1.PayloadCodec();
        // Listen for bi-stream responses (those not handled by server push handlers)
        this.connection.on('payload', (decoded) => {
            this.handlePayload(decoded);
        });
    }
    handlePayload(decoded) {
        const { body } = decoded;
        const requestId = body && body.requestId;
        if (!requestId)
            return;
        const pending = this.pending.get(requestId);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        if (decoded.type === 'ErrorResponse') {
            pending.reject(new Error(`ErrorResponse: errorCode=${body.errorCode}, resultCode=${body.resultCode}, message=${body.message || ''}`));
        }
        else {
            pending.resolve(body);
        }
    }
    async request(message, requestType, timeoutMs = DEFAULT_TIMEOUT_MS) {
        const requestId = generateRequestId();
        const payload = this.codec.encode(Object.assign(Object.assign({}, message), { requestId }), requestType, this.connection.getAuthHeaders());
        const responsePayload = await this.connection.request(payload);
        const decoded = this.codec.decode(responsePayload);
        if (decoded.type === 'ErrorResponse') {
            throw new Error(`ErrorResponse: errorCode=${decoded.body.errorCode}, resultCode=${decoded.body.resultCode}, message=${decoded.body.message || ''}`);
        }
        return decoded.body;
    }
    async streamRequest(message, requestType, timeoutMs = DEFAULT_TIMEOUT_MS) {
        const requestId = generateRequestId();
        const payload = this.codec.encode(Object.assign(Object.assign({}, message), { requestId }), requestType, this.connection.getAuthHeaders());
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error(`streamRequest timed out after ${timeoutMs}ms for type=${requestType}, requestId=${requestId}`));
            }, timeoutMs);
            this.pending.set(requestId, { resolve, reject, timer });
            try {
                this.connection.streamWrite(payload);
            }
            catch (e) {
                clearTimeout(timer);
                this.pending.delete(requestId);
                reject(e);
            }
        });
    }
    registerServerPushHandler(type, handler) {
        this.connection.onServerPush(type, handler);
    }
    removeServerPushHandler(type) {
        this.connection.removeServerPushHandler(type);
    }
    isConnected() {
        return this.connection.isConnected();
    }
    onReconnect(callback) {
        this.connection.on('reconnected', callback);
    }
}
exports.GrpcTransportClient = GrpcTransportClient;
//# sourceMappingURL=transport_client.js.map