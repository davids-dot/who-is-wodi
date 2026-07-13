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
import { NacosNamingClientOptions, Host, SubscribeInfo } from '../interface';
export declare class NacosNamingClient extends Base {
    private _serverProxy;
    private _beatReactor;
    private _hostReactor;
    private _transport;
    private _connection;
    private _transportClient;
    constructor(options?: NacosNamingClientOptions);
    _init(): Promise<void>;
    get logger(): any;
    registerInstance(serviceName: string, instance: any, groupName?: string): Promise<void>;
    deregisterInstance(serviceName: string, instance: any, groupName?: string): Promise<void>;
    getAllInstances(serviceName: string, groupName?: string, clusters?: string, subscribe?: boolean): Promise<Host[]>;
    selectInstances(serviceName: string, groupName?: string, clusters?: string, healthy?: boolean, subscribe?: boolean): Promise<Host[]>;
    getServerStatus(): Promise<string>;
    subscribe(info: string | SubscribeInfo, listener: (hosts: Host[]) => void): void;
    unSubscribe(info: string | SubscribeInfo, listener?: (hosts: Host[]) => void): void;
    _close(): Promise<void>;
}
export {};
