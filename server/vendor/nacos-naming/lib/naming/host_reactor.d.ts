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
import { ServiceInfo } from './service_info';
import { Host } from '../interface';
export declare class HostReactor extends Base {
    private _serviceInfoMap;
    private _updatingSet;
    private _futureMap;
    private _pushReceiver;
    constructor(options?: any);
    get logger(): any;
    get serverProxy(): any;
    get getServiceInfoMap(): Record<string, ServiceInfo>;
    _init(): Promise<void>;
    processServiceJSON(json: string): ServiceInfo | undefined;
    _getKey(param: {
        serviceName: string;
        clusters?: string;
    }): string;
    subscribe(param: {
        serviceName: string;
        clusters?: string;
    }, listener: (hosts: Host[]) => void): void;
    unSubscribe(param: {
        serviceName: string;
        clusters?: string;
    }, listener?: (hosts: Host[]) => void): void;
    getServiceInfoDirectlyFromServer(serviceName: string, clusters?: string): Promise<ServiceInfo | null>;
    getServiceInfo(serviceName: string, clusters?: string): Promise<ServiceInfo | undefined>;
    updateServiceNow(serviceName: string, clusters: string): Promise<void>;
    refreshOnly(serviceName: string, clusters: string): Promise<void>;
    _scheduleUpdateIfAbsent(serviceName: string, clusters: string): void;
    _doUpdate(serviceName: string, clusters: string): Promise<void>;
    _close(): Promise<void>;
}
export {};
