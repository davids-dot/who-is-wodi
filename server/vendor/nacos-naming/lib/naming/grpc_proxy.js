"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrpcNamingProxy = void 0;
const Base = require('sdk-base');
const assert = require('assert');
const const_1 = require("../const");
function splitGroupedName(nameWithGroup) {
    if (nameWithGroup.includes(const_1.SERVICE_INFO_SPLITER)) {
        const parts = nameWithGroup.split(const_1.SERVICE_INFO_SPLITER);
        return { groupName: parts[0], serviceName: parts[1] };
    }
    return { groupName: const_1.DEFAULT_GROUP, serviceName: nameWithGroup };
}
class GrpcNamingProxy extends Base {
    constructor(options) {
        assert(options.logger, '[GrpcNamingProxy] options.logger is required');
        assert(options.transportClient, '[GrpcNamingProxy] options.transportClient is required');
        super({ logger: options.logger });
        this._transportClient = options.transportClient;
        this._namespace = options.namespace || 'public';
        this._logger = options.logger;
        this._registeredInstances = new Map();
        this._activeSubscriptions = new Map();
        this._transportClient.onReconnect(() => this._onReconnect());
    }
    async _onReconnect() {
        this._logger.info('[GrpcNamingProxy] reconnected, recovering %d instances and %d subscriptions', this._registeredInstances.size, this._activeSubscriptions.size);
        for (const { serviceName, instance } of this._registeredInstances.values()) {
            try {
                const { serviceName: svc, groupName: grp } = splitGroupedName(serviceName);
                await this._transportClient.request({
                    namespace: this._namespace,
                    serviceName: svc,
                    groupName: grp,
                    type: 'registerInstance',
                    instance: {
                        instanceId: instance.instanceId || '',
                        ip: instance.ip,
                        port: instance.port,
                        weight: instance.weight != null ? instance.weight : 1.0,
                        healthy: instance.healthy !== false,
                        enabled: instance.enabled !== false,
                        ephemeral: instance.ephemeral !== false,
                        clusterName: instance.clusterName || 'DEFAULT',
                        serviceName: svc,
                        metadata: instance.metadata || {},
                    },
                }, 'InstanceRequest', 5000);
                this._logger.info('[GrpcNamingProxy] re-registered instance %s:%d for %s', instance.ip, instance.port, serviceName);
            }
            catch (err) {
                this._logger.warn('[GrpcNamingProxy] re-register failed for %s: %s', serviceName, err.message);
            }
        }
        for (const { serviceName, clusters } of this._activeSubscriptions.values()) {
            try {
                const { serviceName: svc, groupName: grp } = splitGroupedName(serviceName);
                await this._transportClient.request({
                    namespace: this._namespace,
                    serviceName: svc,
                    groupName: grp,
                    clusters,
                    subscribe: true,
                }, 'SubscribeServiceRequest', 5000);
                this._logger.info('[GrpcNamingProxy] re-subscribed %s', serviceName);
            }
            catch (err) {
                this._logger.warn('[GrpcNamingProxy] re-subscribe failed for %s: %s', serviceName, err.message);
            }
        }
    }
    get logger() {
        return this._logger;
    }
    async ready() {
        // Nothing to initialize for proxy itself; connection is managed externally.
    }
    async registerService(serviceName, groupName, instance) {
        this._logger.info('[GrpcNamingProxy][REGISTER-SERVICE] %s registering service: %s with instance:%j', this._namespace, serviceName, instance);
        const key = `${serviceName}@@${instance.ip}:${instance.port}`;
        this._registeredInstances.set(key, { serviceName, groupName, instance });
        const { serviceName: svc, groupName: grp } = splitGroupedName(serviceName);
        const request = {
            namespace: this._namespace,
            serviceName: svc,
            groupName: grp,
            type: 'registerInstance',
            instance: {
                instanceId: instance.instanceId || '',
                ip: instance.ip,
                port: instance.port,
                weight: instance.weight != null ? instance.weight : 1.0,
                healthy: instance.healthy !== false,
                enabled: instance.enabled !== false,
                ephemeral: instance.ephemeral !== false,
                clusterName: instance.clusterName || 'DEFAULT',
                serviceName,
                metadata: instance.metadata || {},
            },
        };
        const response = await this._transportClient.request(request, 'InstanceRequest');
        return response.resultCode === 200 ? 'ok' : JSON.stringify(response);
    }
    async deregisterService(serviceName, instance) {
        this._logger.info('[GrpcNamingProxy][DEREGISTER-SERVICE] %s deregistering service: %s with instance:%j', this._namespace, serviceName, instance);
        const key = `${serviceName}@@${instance.ip}:${instance.port}`;
        this._registeredInstances.delete(key);
        const { serviceName: svc, groupName: grp } = splitGroupedName(serviceName);
        const request = {
            namespace: this._namespace,
            serviceName: svc,
            groupName: grp,
            type: 'deregisterInstance',
            instance: {
                instanceId: instance.instanceId || '',
                ip: instance.ip,
                port: instance.port,
                weight: instance.weight != null ? instance.weight : 1.0,
                healthy: instance.healthy !== false,
                enabled: instance.enabled !== false,
                ephemeral: instance.ephemeral !== false,
                clusterName: instance.clusterName || 'DEFAULT',
                serviceName,
                metadata: instance.metadata || {},
            },
        };
        const response = await this._transportClient.request(request, 'InstanceRequest');
        return response.resultCode === 200 ? 'ok' : JSON.stringify(response);
    }
    async queryList(serviceName, clusters, udpPort, healthyOnly) {
        const { serviceName: svc, groupName: grp } = splitGroupedName(serviceName);
        const request = {
            namespace: this._namespace,
            serviceName: svc,
            groupName: grp,
            cluster: clusters,
            healthyOnly,
            udpPort,
        };
        const response = await this._transportClient.request(request, 'ServiceQueryRequest');
        // Extract serviceInfo from QueryServiceResponse and return as JSON string
        // HostReactor.processServiceJSON expects flat structure with hosts at top level
        const si = response.serviceInfo || {};
        return JSON.stringify({
            name: si.name || serviceName,
            dom: si.name || serviceName,
            groupName: si.groupName || '',
            clusters: si.clusters || clusters,
            cacheMillis: si.cacheMillis || 10000,
            hosts: si.hosts || [],
            lastRefTime: si.lastRefTime || Date.now(),
            checksum: si.checksum || '',
        });
    }
    /**
     * No-op in gRPC mode: heartbeats are managed by the persistent gRPC connection.
     */
    async sendBeat(_beatInfo) {
        return 0;
    }
    async serverHealthy() {
        try {
            const response = await this._transportClient.request({}, 'ServerCheckRequest');
            return !!(response && response.connectionId);
        }
        catch (_err) {
            return false;
        }
    }
    async getServiceList(pageNo, pageSize, groupName) {
        const request = {
            namespace: this._namespace,
            groupName: groupName || '',
            pageNo,
            pageSize,
        };
        const response = await this._transportClient.request(request, 'ServiceListRequest');
        return {
            count: Number(response.count || 0),
            data: response.serviceNames || [],
        };
    }
    async subscribe(serviceName, groupName, clusters) {
        const { serviceName: svc, groupName: grp } = splitGroupedName(serviceName);
        const request = {
            namespace: this._namespace,
            serviceName: svc,
            groupName: grp,
            clusters,
            subscribe: true,
        };
        const response = await this._transportClient.request(request, 'SubscribeServiceRequest');
        const key = `${serviceName}@@${clusters}`;
        this._activeSubscriptions.set(key, { serviceName, groupName: grp, clusters });
        const si = response.serviceInfo || {};
        return JSON.stringify({
            name: si.name || svc,
            dom: si.name || svc,
            groupName: si.groupName || grp,
            clusters: si.clusters || clusters,
            cacheMillis: si.cacheMillis || 10000,
            hosts: si.hosts || [],
            lastRefTime: si.lastRefTime || Date.now(),
            checksum: si.checksum || '',
        });
    }
    async unSubscribe(serviceName, groupName, clusters) {
        const { serviceName: svc, groupName: grp } = splitGroupedName(serviceName);
        const request = {
            namespace: this._namespace,
            serviceName: svc,
            groupName: grp,
            clusters,
            subscribe: false,
        };
        try {
            await this._transportClient.request(request, 'SubscribeServiceRequest');
        }
        catch (err) {
            this._logger.warn('[GrpcNamingProxy] unSubscribe failed: %s', err.message);
        }
        const key = `${serviceName}@@${clusters}`;
        this._activeSubscriptions.delete(key);
    }
    registerPushHandler(handler) {
        this._transportClient.registerServerPushHandler('NotifySubscriberRequest', (request) => {
            const si = request.serviceInfo || {};
            const json = JSON.stringify({
                name: si.name || '',
                dom: si.name || '',
                groupName: si.groupName || '',
                clusters: si.clusters || '',
                cacheMillis: si.cacheMillis || 10000,
                hosts: si.hosts || [],
                lastRefTime: si.lastRefTime || Date.now(),
                checksum: si.checksum || '',
            });
            handler(json);
            return { __type: 'NotifySubscriberResponse', resultCode: 200, message: 'success' };
        });
    }
    async close() {
        this._transportClient.removeServerPushHandler('NotifySubscriberRequest');
        this._registeredInstances.clear();
        this._activeSubscriptions.clear();
    }
    getRegisteredInstances() {
        return this._registeredInstances;
    }
    getActiveSubscriptions() {
        return this._activeSubscriptions;
    }
}
exports.GrpcNamingProxy = GrpcNamingProxy;
//# sourceMappingURL=grpc_proxy.js.map