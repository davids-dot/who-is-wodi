/**
 * Parsed server address with host and port.
 */
export interface ServerAddress {
    host: string;
    port: number;
}
/**
 * Authentication options for Nacos server connections.
 */
export interface AuthOptions {
    accessKey?: string;
    secretKey?: string;
    username?: string;
    password?: string;
}
/**
 * Parse a server address string into host and port.
 * Supports formats: "host:port", "host", "http://host:port", "https://host:port"
 */
export declare function parseServerAddress(addr: string, defaultPort?: number): ServerAddress;
