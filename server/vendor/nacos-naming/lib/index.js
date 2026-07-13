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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("./naming/client");
Object.defineProperty(exports, "NacosNamingClient", { enumerable: true, get: function () { return client_1.NacosNamingClient; } });
var instance_1 = require("./naming/instance");
Object.defineProperty(exports, "Instance", { enumerable: true, get: function () { return instance_1.Instance; } });
var proxy_1 = require("./naming/proxy");
Object.defineProperty(exports, "NamingProxy", { enumerable: true, get: function () { return proxy_1.NamingProxy; } });
var grpc_proxy_1 = require("./naming/grpc_proxy");
Object.defineProperty(exports, "GrpcNamingProxy", { enumerable: true, get: function () { return grpc_proxy_1.GrpcNamingProxy; } });
var host_reactor_1 = require("./naming/host_reactor");
Object.defineProperty(exports, "HostReactor", { enumerable: true, get: function () { return host_reactor_1.HostReactor; } });
var beat_reactor_1 = require("./naming/beat_reactor");
Object.defineProperty(exports, "BeatReactor", { enumerable: true, get: function () { return beat_reactor_1.BeatReactor; } });
var push_receiver_1 = require("./naming/push_receiver");
Object.defineProperty(exports, "PushReceiver", { enumerable: true, get: function () { return push_receiver_1.PushReceiver; } });
var service_info_1 = require("./naming/service_info");
Object.defineProperty(exports, "ServiceInfo", { enumerable: true, get: function () { return service_info_1.ServiceInfo; } });
__exportStar(require("./interface"), exports);
//# sourceMappingURL=index.js.map