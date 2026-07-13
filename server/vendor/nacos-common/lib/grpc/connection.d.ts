/// <reference types="node" />
import { EventEmitter } from 'events';
import { Payload } from './payload_codec';
export interface GrpcConnectionOptions {
    serverList: string[];
    namespace?: string;
    ssl?: boolean;
    labels?: Record<string, string>;
    abilityTable?: Record<string, boolean>;
    logger: any;
    accessKey?: string;
    secretKey?: string;
    username?: string;
    password?: string;
}
export declare class GrpcConnection extends EventEmitter {
    private options;
    private codec;
    private connected;
    private closed;
    private currentServerIndex;
    private accessToken;
    private requestClient;
    private biStreamClient;
    private biStream;
    private heartbeatTimer;
    private reconnectBackoff;
    private serverPushHandlers;
    private pendingRequests;
    private grpcDefinition;
    constructor(options: GrpcConnectionOptions);
    private login;
    getAuthHeaders(): Record<string, string>;
    private loadProto;
    private getCurrentServer;
    private createClients;
    private sendUnary;
    private performHandshake;
    private handleIncomingPayload;
    private startHeartbeat;
    private stopHeartbeat;
    private scheduleReconnect;
    private rejectAllPending;
    connect(): Promise<void>;
    close(): void;
    isConnected(): boolean;
    request(payload: Payload): Promise<Payload>;
    streamWrite(payload: Payload): void;
    onServerPush(type: string, handler: (request: any) => any): void;
    removeServerPushHandler(type: string): void;
}
