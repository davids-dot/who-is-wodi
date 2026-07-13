import { GrpcConnection } from './connection';
export declare class GrpcTransportClient {
    private connection;
    private codec;
    private pending;
    constructor(connection: GrpcConnection);
    private handlePayload;
    request<Res = any>(message: any, requestType: string, timeoutMs?: number): Promise<Res>;
    streamRequest<Res = any>(message: any, requestType: string, timeoutMs?: number): Promise<Res>;
    registerServerPushHandler(type: string, handler: (request: any) => any): void;
    removeServerPushHandler(type: string): void;
    isConnected(): boolean;
    onReconnect(callback: () => void): void;
}
