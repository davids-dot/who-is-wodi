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
exports.NacosNamingClient = void 0;
const Base = require('sdk-base');
const assert = require('assert');
/* tslint:enable:no-var-requires */
const nacos_common_1 = require("nacos-common");
const instance_1 = require("./instance");
const proxy_1 = require("./proxy");
const grpc_proxy_1 = require("./grpc_proxy");
const beat_reactor_1 = require("./beat_reactor");
const host_reactor_1 = require("./host_reactor");
const utils_1 = require("../utils");
const const_1 = require("../const");
const defaultOptions = {
    namespace: 'public',
};
class NacosNamingClient extends Base {
    constructor(options = {}) {
        assert(options.logger, '');
        super(Object.assign({}, defaultOptions, options, { initMethod: '_init' }));
        // Default transport is 'grpc'
        this._transport = options.transport || 'grpc';
        this._beatReactor = null;
        this._connection = null;
        this._transportClient = null;
        if (this._transport === 'http') {
            // HTTP mode: existing behavior
            const proxy = new proxy_1.NamingProxy(this.options);
            this._serverProxy = proxy;
            this._beatReactor = new beat_reactor_1.BeatReactor({
                serverProxy: proxy,
                logger: this.logger,
            });
            this._hostReactor = new host_reactor_1.HostReactor({
                serverProxy: proxy,
                logger: this.logger,
            });
        }
        else {
            // gRPC mode: use GrpcConnection + GrpcTransportClient + GrpcNamingProxy
            const rawServerList = typeof options.serverList === 'string'
                ? options.serverList.split(',').map((s) => s.trim()).filter(Boolean)
                : options.serverList || [];
            this._connection = new nacos_common_1.GrpcConnection({
                serverList: rawServerList,
                namespace: options.namespace || 'public',
                ssl: options.ssl,
                logger: options.logger,
                username: options.username,
                password: options.password,
                labels: { source: 'sdk', module: 'naming' },
            });
            this._transportClient = new nacos_common_1.GrpcTransportClient(this._connection);
            const grpcProxy = new grpc_proxy_1.GrpcNamingProxy({
                transportClient: this._transportClient,
                namespace: options.namespace || 'public',
                logger: options.logger,
            });
            this._serverProxy = grpcProxy;
            // No BeatReactor or PushReceiver in gRPC mode
            this._hostReactor = new host_reactor_1.HostReactor({
                serverProxy: grpcProxy,
                logger: this.logger,
                transport: 'grpc',
            });
            // Wire gRPC server push to HostReactor
            grpcProxy.registerPushHandler((json) => {
                this._hostReactor.processServiceJSON(json);
            });
        }
    }
    async _init() {
        if (this._transport === 'grpc' && this._connection) {
            await this._connection.connect();
        }
        await this._hostReactor.ready();
    }
    get logger() {
        return this.options.logger;
    }
    async registerInstance(serviceName, instance, groupName = const_1.DEFAULT_GROUP) {
        if (!(instance instanceof instance_1.Instance)) {
            instance = new instance_1.Instance(instance);
        }
        const serviceNameWithGroup = utils_1.getGroupedName(serviceName, groupName);
        if (this._transport === 'http' && this._beatReactor && instance.ephemeral) {
            const beatInfo = {
                serviceName: serviceNameWithGroup,
                ip: instance.ip,
                port: instance.port,
                cluster: instance.clusterName,
                weight: instance.weight,
                metadata: instance.metadata,
                scheduled: false,
            };
            this._beatReactor.addBeatInfo(serviceNameWithGroup, beatInfo);
        }
        await this._serverProxy.registerService(serviceNameWithGroup, groupName, instance);
    }
    async deregisterInstance(serviceName, instance, groupName = const_1.DEFAULT_GROUP) {
        if (!(instance instanceof instance_1.Instance)) {
            instance = new instance_1.Instance(instance);
        }
        const serviceNameWithGroup = utils_1.getGroupedName(serviceName, groupName);
        if (this._beatReactor) {
            this._beatReactor.removeBeatInfo(serviceNameWithGroup, instance.ip, instance.port);
        }
        await this._serverProxy.deregisterService(serviceNameWithGroup, instance);
    }
    async getAllInstances(serviceName, groupName = const_1.DEFAULT_GROUP, clusters = '', subscribe = true) {
        let serviceInfo;
        const serviceNameWithGroup = utils_1.getGroupedName(serviceName, groupName);
        if (subscribe) {
            serviceInfo = await this._hostReactor.getServiceInfo(serviceNameWithGroup, clusters);
        }
        else {
            serviceInfo = await this._hostReactor.getServiceInfoDirectlyFromServer(serviceNameWithGroup, clusters);
        }
        if (!serviceInfo)
            return [];
        return serviceInfo.hosts;
    }
    async selectInstances(serviceName, groupName = const_1.DEFAULT_GROUP, clusters = '', healthy = true, subscribe = true) {
        let serviceInfo;
        const serviceNameWithGroup = utils_1.getGroupedName(serviceName, groupName);
        if (subscribe) {
            serviceInfo = await this._hostReactor.getServiceInfo(serviceNameWithGroup, clusters);
        }
        else {
            serviceInfo = await this._hostReactor.getServiceInfoDirectlyFromServer(serviceNameWithGroup, clusters);
        }
        if (!serviceInfo || !serviceInfo.hosts || !serviceInfo.hosts.length) {
            return [];
        }
        return serviceInfo.hosts.filter((host) => {
            return host.healthy === healthy && host.enabled && host.weight > 0;
        });
    }
    async getServerStatus() {
        const isHealthy = await this._serverProxy.serverHealthy();
        return isHealthy ? 'UP' : 'DOWN';
    }
    subscribe(info, listener) {
        if (typeof info === 'string') {
            info = {
                serviceName: info,
            };
        }
        const groupName = info.groupName || const_1.DEFAULT_GROUP;
        const serviceNameWithGroup = utils_1.getGroupedName(info.serviceName, groupName);
        this._hostReactor.subscribe({
            serviceName: serviceNameWithGroup,
            clusters: info.clusters || '',
        }, listener);
    }
    unSubscribe(info, listener) {
        if (typeof info === 'string') {
            info = {
                serviceName: info,
            };
        }
        const groupName = info.groupName || const_1.DEFAULT_GROUP;
        const serviceNameWithGroup = utils_1.getGroupedName(info.serviceName, groupName);
        this._hostReactor.unSubscribe({
            serviceName: serviceNameWithGroup,
            clusters: info.clusters || '',
        }, listener);
    }
    async _close() {
        if (this._beatReactor) {
            await this._beatReactor.close();
        }
        await this._hostReactor.close();
        if (this._connection) {
            this._connection.close();
        }
    }
}
exports.NacosNamingClient = NacosNamingClient;
//# sourceMappingURL=client.js.map