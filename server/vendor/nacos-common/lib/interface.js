"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseServerAddress = void 0;
/**
 * Parse a server address string into host and port.
 * Supports formats: "host:port", "host", "http://host:port", "https://host:port"
 */
function parseServerAddress(addr, defaultPort = 8848) {
    let cleaned = addr.trim();
    if (cleaned.startsWith('http://')) {
        cleaned = cleaned.slice(7);
    }
    else if (cleaned.startsWith('https://')) {
        cleaned = cleaned.slice(8);
    }
    // Remove trailing path if any
    const slashIndex = cleaned.indexOf('/');
    if (slashIndex !== -1) {
        cleaned = cleaned.slice(0, slashIndex);
    }
    const colonIndex = cleaned.lastIndexOf(':');
    if (colonIndex !== -1) {
        const host = cleaned.slice(0, colonIndex);
        const port = parseInt(cleaned.slice(colonIndex + 1), 10);
        if (!isNaN(port)) {
            return { host, port };
        }
    }
    return { host: cleaned, port: defaultPort };
}
exports.parseServerAddress = parseServerAddress;
//# sourceMappingURL=interface.js.map