/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
declare const Base: any;
import { GrpcTransportClient } from 'nacos-common';
import { BeatInfo, ServiceListResult, NamingTransport } from '../interface';
export declare class GrpcNamingProxy extends Base implements NamingTransport {
    private _transportClient;
    private _namespace;
    private _logger;
    private _registeredInstances;
    private _activeSubscriptions;
    constructor(options: {
        transportClient: GrpcTransportClient;
        namespace?: string;
        logger: any;
    });
    private _onReconnect;
    get logger(): any;
    ready(): Promise<void>;
    registerService(serviceName: string, groupName: string, instance: any): Promise<string>;
    deregisterService(serviceName: string, instance: any): Promise<string>;
    queryList(serviceName: string, clusters: string, udpPort: number, healthyOnly: boolean): Promise<string>;
    /**
     * No-op in gRPC mode: heartbeats are managed by the persistent gRPC connection.
     */
    sendBeat(_beatInfo: BeatInfo): Promise<number>;
    serverHealthy(): Promise<boolean>;
    getServiceList(pageNo: number, pageSize: number, groupName?: string): Promise<ServiceListResult>;
    subscribe(serviceName: string, groupName: string, clusters: string): Promise<string>;
    unSubscribe(serviceName: string, groupName: string, clusters: string): Promise<void>;
    registerPushHandler(handler: (serviceInfoJson: string) => void): void;
    close(): Promise<void>;
    getRegisteredInstances(): Map<string, {
        serviceName: string;
        groupName: string;
        instance: any;
    }>;
    getActiveSubscriptions(): Map<string, {
        serviceName: string;
        groupName: string;
        clusters: string;
    }>;
}
export {};
