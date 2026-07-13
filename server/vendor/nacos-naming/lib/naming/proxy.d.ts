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
import { BeatInfo, ServiceListResult, NacosNamingClientOptions } from '../interface';
export declare class NamingProxy extends Base {
    serverList: string[];
    nacosDomain: string | null;
    serversFromEndpoint: string[];
    lastSrvRefTime: number;
    private _closed;
    constructor(options?: NacosNamingClientOptions);
    get logger(): any;
    get endpoint(): string | null;
    get namespace(): string;
    get httpclient(): any;
    _getServerListFromEndpoint(): Promise<string[]>;
    _refreshSrvIfNeed(): Promise<void>;
    _init(): Promise<void>;
    _refreshLoop(): Promise<void>;
    _getSignData(serviceName?: string): string;
    _checkSignature(params: Record<string, any>): Promise<void>;
    _builderHeaders(): Record<string, string>;
    _callServer(serverAddr: string, method: string, api: string, params?: Record<string, any>): Promise<string>;
    _reqAPI(api: string, params: Record<string, any>, method: string): Promise<string>;
    registerService(serviceName: string, groupName: string, instance: any): Promise<string>;
    deregisterService(serviceName: string, instance: any): Promise<string>;
    queryList(serviceName: string, clusters: string, udpPort: number, healthyOnly: boolean): Promise<string>;
    serverHealthy(): Promise<boolean>;
    sendBeat(beatInfo: BeatInfo): Promise<number>;
    getServiceList(pageNo: number, pageSize: number, groupName?: string): Promise<ServiceListResult>;
    _close(): Promise<void>;
}
export {};
