/// <reference types="node" />
export interface Payload {
    metadata: {
        type: string;
        clientIp: string;
        headers: {
            [key: string]: string;
        };
    };
    body: {
        value: Buffer;
        typeUrl: string;
    };
}
export interface MessageFns<T> {
    fromJSON(object: any): T;
    toJSON(message: T): unknown;
}
export declare class PayloadCodec {
    private registry;
    constructor();
    private registerDefaults;
    registerType(name: string, fns: MessageFns<any>): void;
    encode(message: any, type: string, headers?: {
        [key: string]: string;
    }): Payload;
    decode(payload: Payload): {
        type: string;
        body: any;
    };
}
