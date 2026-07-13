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
exports.getGroupName = exports.getServiceName = exports.getGroupedName = exports.sign = exports.tryDecompress = exports.isGzipStream = void 0;
const zlib = require('zlib');
const crypto = require('crypto');
/* tslint:enable:no-var-requires */
const const_1 = require("./const");
const GZIP_MAGIC = 35615;
/* eslint-disable no-bitwise */
function isGzipStream(buf) {
    if (!buf || buf.length < 2) {
        return false;
    }
    return GZIP_MAGIC === ((buf[1] << 8 | buf[0]) & 0xFFFF);
}
exports.isGzipStream = isGzipStream;
/* eslint-enable no-bitwise */
function tryDecompress(buf) {
    if (!isGzipStream(buf)) {
        return buf;
    }
    return zlib.gunzipSync(buf);
}
exports.tryDecompress = tryDecompress;
function sign(data, key) {
    return crypto.createHmac('sha1', key).update(data).digest('base64');
}
exports.sign = sign;
function getGroupedName(serviceName, groupName) {
    return groupName + const_1.SERVICE_INFO_SPLITER + serviceName;
}
exports.getGroupedName = getGroupedName;
function getServiceName(serviceNameWithGroup) {
    if (!serviceNameWithGroup.includes(const_1.SERVICE_INFO_SPLITER)) {
        return serviceNameWithGroup;
    }
    return serviceNameWithGroup.split(const_1.SERVICE_INFO_SPLITER)[1];
}
exports.getServiceName = getServiceName;
function getGroupName(serviceNameWithGroup) {
    if (!serviceNameWithGroup.includes(const_1.SERVICE_INFO_SPLITER)) {
        return const_1.DEFAULT_GROUP;
    }
    return serviceNameWithGroup.split(const_1.SERVICE_INFO_SPLITER)[0];
}
exports.getGroupName = getGroupName;
//# sourceMappingURL=utils.js.map