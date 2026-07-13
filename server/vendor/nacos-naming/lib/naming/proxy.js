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
exports.NamingProxy = void 0;
const uuid = require('uuid/v4');
const Base = require('sdk-base');
const assert = require('assert');
const utility = require('utility');
const localIp = require('address').ip();
const sleep = require('mz-modules/sleep');
/* tslint:enable:no-var-requires */
const nacos_common_1 = require("nacos-common");
const aliyun_auth_1 = require("../aliyun_auth");
const const_1 = require("../const");
const DEFAULT_SERVER_PORT = 8848;
const defaultOptions = {
    namespace: 'public',
    httpclient: require('urllib'),
    ssl: false,
    ak: null,
    sk: null,
    appName: '',
    endpoint: null,
    vipSrvRefInterMillis: 30000,
};
class NamingProxy extends Base {
    constructor(options = {}) {
        assert(options.logger, '[NameProxy] options.logger is required');
        if (typeof options.serverList === 'string' && options.serverList) {
            options.serverList = options.serverList.split(',');
        }
        super(Object.assign({}, defaultOptions, options, { initMethod: '_init' }));
        const rawList = options.serverList || [];
        this.serverList = rawList.map((addr) => {
            const parsed = nacos_common_1.parseServerAddress(addr, DEFAULT_SERVER_PORT);
            return parsed.host + ':' + parsed.port;
        });
        // Single server treated as load-balancing domain
        this.nacosDomain = this.serverList.length === 1 ? this.serverList[0] : null;
        this.serversFromEndpoint = [];
        this.lastSrvRefTime = 0;
        this._closed = false;
    }
    get logger() {
        return this.options.logger;
    }
    get endpoint() {
        return this.options.endpoint;
    }
    get namespace() {
        return this.options.namespace;
    }
    get httpclient() {
        return this.options.httpclient;
    }
    async _getServerListFromEndpoint() {
        const urlString = 'http://' + this.endpoint + '/nacos/serverlist';
        const headers = this._builderHeaders();
        const result = await this.httpclient.request(urlString, {
            method: 'GET',
            headers,
            dataType: 'text',
        });
        if (result.status !== 200) {
            throw new Error('Error while requesting: ' + urlString + ', Server returned: ' + result.status);
        }
        const content = result.data;
        return content.split('\r\n');
    }
    async _refreshSrvIfNeed() {
        if (this.serverList.length !== 0) {
            return;
        }
        if (Date.now() - this.lastSrvRefTime < this.options.vipSrvRefInterMillis) {
            return;
        }
        try {
            const list = await this._getServerListFromEndpoint();
            if (!list || !list.length) {
                throw new Error('Can not acquire Nacos list');
            }
            this.serversFromEndpoint = list;
            this.lastSrvRefTime = Date.now();
        }
        catch (err) {
            this.logger.warn(err);
        }
    }
    async _init() {
        if (!this.endpoint)
            return;
        await this._refreshSrvIfNeed();
        this._refreshLoop();
    }
    async _refreshLoop() {
        while (!this._closed) {
            await sleep(this.options.vipSrvRefInterMillis);
            await this._refreshSrvIfNeed();
        }
    }
    _getSignData(serviceName) {
        return aliyun_auth_1.getNamingSignData(serviceName);
    }
    async _checkSignature(params) {
        const credentials = await aliyun_auth_1.resolveAliyunCredentialsAsync(this.options);
        const authParams = aliyun_auth_1.buildNamingAuthParams(params.serviceName, credentials);
        if (!authParams)
            return;
        Object.assign(params, authParams);
    }
    _builderHeaders() {
        return {
            'User-Agent': const_1.VERSION,
            'Client-Version': const_1.VERSION,
            'Accept-Encoding': 'gzip,deflate,sdch',
            'Request-Module': 'Naming',
            Connection: 'Keep-Alive',
            RequestId: uuid(),
        };
    }
    async _callServer(serverAddr, method, api, params = {}) {
        await this._checkSignature(params);
        params.namespaceId = this.namespace;
        const headers = this._builderHeaders();
        if (!serverAddr.includes(const_1.SERVER_ADDR_IP_SPLITER)) {
            serverAddr = serverAddr + const_1.SERVER_ADDR_IP_SPLITER + DEFAULT_SERVER_PORT;
        }
        const url = (this.options.ssl ? 'https://' : 'http://') + serverAddr + api;
        if (this.options.username && this.options.password) {
            params.username = this.options.username;
            params.password = this.options.password;
        }
        const result = await this.httpclient.request(url, {
            method,
            headers,
            data: params,
            dataType: 'text',
            dataAsQueryString: true,
        });
        if (result.status === 200) {
            return result.data;
        }
        if (result.status === 304) {
            return '';
        }
        const err = new Error('failed to req API: ' + url + '. code: ' + result.status + ' msg: ' + result.data);
        err.name = 'NacosException';
        err.status = result.status;
        throw err;
    }
    async _reqAPI(api, params, method) {
        const servers = this.serverList.length ? this.serverList : this.serversFromEndpoint;
        const size = servers.length;
        if (size === 0 && !this.nacosDomain) {
            throw new Error('[NameProxy] no server available');
        }
        if (size > 0) {
            let index = utility.random(size);
            for (let i = 0; i < size; i++) {
                const server = servers[index];
                try {
                    return await this._callServer(server, method, api, params);
                }
                catch (err) {
                    this.logger.warn(err);
                }
                index = (index + 1) % size;
            }
            throw new Error('failed to req API: ' + api + ' after all servers(' + servers.join(',') + ') tried');
        }
        for (let i = 0; i < const_1.REQUEST_DOMAIN_RETRY_COUNT; i++) {
            try {
                return await this._callServer(this.nacosDomain, method, api, params);
            }
            catch (err) {
                this.logger.warn(err);
            }
        }
        throw new Error('failed to req API: ' + api + ' after all servers(' + this.nacosDomain + ') tried');
    }
    async registerService(serviceName, groupName, instance) {
        this.logger.info('[NameProxy][REGISTER-SERVICE] %s registering service: %s with instance:%j', this.namespace, serviceName, instance);
        const params = {
            namespaceId: this.namespace,
            serviceName,
            groupName,
            clusterName: instance.clusterName,
            ip: instance.ip,
            port: instance.port + '',
            weight: instance.weight + '',
            enable: instance.enabled ? 'true' : 'false',
            healthy: instance.healthy ? 'true' : 'false',
            ephemeral: instance.ephemeral ? 'true' : 'false',
            metadata: JSON.stringify(instance.metadata),
        };
        return await this._reqAPI(const_1.NACOS_URL_INSTANCE, params, 'POST');
    }
    async deregisterService(serviceName, instance) {
        this.logger.info('[NameProxy][DEREGISTER-SERVICE] %s deregistering service: %s with instance:%j', this.namespace, serviceName, instance);
        const params = {
            namespaceId: this.namespace,
            serviceName,
            clusterName: instance.clusterName,
            ip: instance.ip,
            port: instance.port + '',
            ephemeral: instance.ephemeral !== false ? 'true' : 'false',
        };
        return await this._reqAPI(const_1.NACOS_URL_INSTANCE, params, 'DELETE');
    }
    async queryList(serviceName, clusters, udpPort, healthyOnly) {
        const params = {
            namespaceId: this.namespace,
            serviceName,
            clusters,
            udpPort: udpPort + '',
            clientIP: localIp,
            healthyOnly: healthyOnly ? 'true' : 'false',
        };
        return await this._reqAPI(const_1.NACOS_URL_BASE + '/instance/list', params, 'GET');
    }
    async serverHealthy() {
        try {
            const str = await this._reqAPI(const_1.NACOS_URL_BASE + '/operator/metrics', {}, 'GET');
            const result = JSON.parse(str);
            return result && result.status === 'UP';
        }
        catch (_) {
            return false;
        }
    }
    async sendBeat(beatInfo) {
        try {
            const params = {
                beat: JSON.stringify(beatInfo),
                namespaceId: this.namespace,
                serviceName: beatInfo.serviceName,
            };
            const jsonStr = await this._reqAPI(const_1.NACOS_URL_BASE + '/instance/beat', params, 'PUT');
            const result = JSON.parse(jsonStr);
            if (result && result.clientBeatInterval) {
                return Number(result.clientBeatInterval);
            }
        }
        catch (err) {
            err.message = `[CLIENT-BEAT] failed to send beat: ${JSON.stringify(beatInfo)}, caused by ${err.message}`;
            this.logger.error(err);
        }
        return const_1.DEFAULT_DELAY;
    }
    async getServiceList(pageNo, pageSize, groupName) {
        const params = {
            pageNo: pageNo + '',
            pageSize: pageSize + '',
            namespaceId: this.namespace,
            groupName: groupName || '',
        };
        // TODO: selector
        const result = await this._reqAPI(const_1.NACOS_URL_BASE + '/service/list', params, 'GET');
        const json = JSON.parse(result);
        return {
            count: Number(json.count),
            data: json.doms,
        };
    }
    async _close() {
        this._closed = true;
    }
}
exports.NamingProxy = NamingProxy;
//# sourceMappingURL=proxy.js.map