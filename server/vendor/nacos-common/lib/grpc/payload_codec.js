"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayloadCodec = void 0;
const localIp = require('address').ip();
function loadSdkProto() {
    try {
        const common = require('@nacos-group/sdk-proto/src/common/common');
        const namingReq = require('@nacos-group/sdk-proto/src/naming/naming_request');
        const namingRes = require('@nacos-group/sdk-proto/src/naming/naming_response');
        const cfgReq = require('@nacos-group/sdk-proto/src/config/config_request');
        const cfgRes = require('@nacos-group/sdk-proto/src/config/config_response');
        return {
            // Common
            ConnectionSetupRequest: common.ConnectionSetupRequest,
            ServerCheckRequest: common.ServerCheckRequest,
            ServerCheckResponse: common.ServerCheckResponse,
            HealthCheckRequest: common.HealthCheckRequest,
            HealthCheckResponse: common.HealthCheckResponse,
            ConnectResetRequest: common.ConnectResetRequest,
            ConnectResetResponse: common.ConnectResetResponse,
            SetupAckRequest: common.SetupAckRequest,
            SetupAckResponse: common.SetupAckResponse,
            ClientDetectionRequest: common.ClientDetectionRequest,
            ClientDetectionResponse: common.ClientDetectionResponse,
            PushAckRequest: common.PushAckRequest,
            ErrorResponse: common.ErrorResponse,
            // Naming
            InstanceRequest: namingReq.InstanceRequest,
            InstanceResponse: namingRes.InstanceResponse,
            ServiceQueryRequest: namingReq.ServiceQueryRequest,
            QueryServiceResponse: namingRes.QueryServiceResponse,
            SubscribeServiceRequest: namingReq.SubscribeServiceRequest,
            SubscribeServiceResponse: namingRes.SubscribeServiceResponse,
            ServiceListRequest: namingReq.ServiceListRequest,
            ServiceListResponse: namingRes.ServiceListResponse,
            NotifySubscriberRequest: namingReq.NotifySubscriberRequest,
            // Config
            ConfigQueryRequest: cfgReq.ConfigQueryRequest,
            ConfigQueryResponse: cfgRes.ConfigQueryResponse,
            ConfigPublishRequest: cfgReq.ConfigPublishRequest,
            ConfigPublishResponse: cfgRes.ConfigPublishResponse,
            ConfigRemoveRequest: cfgReq.ConfigRemoveRequest,
            ConfigRemoveResponse: cfgRes.ConfigRemoveResponse,
            ConfigBatchListenRequest: cfgReq.ConfigBatchListenRequest,
            ConfigChangeBatchListenResponse: cfgRes.ConfigChangeBatchListenResponse,
            ConfigChangeNotifyRequest: cfgReq.ConfigChangeNotifyRequest,
            ConfigChangeNotifyResponse: cfgRes.ConfigChangeNotifyResponse,
        };
    }
    catch (e) {
        return {};
    }
}
class PayloadCodec {
    constructor() {
        this.registry = new Map();
        this.registerDefaults();
    }
    registerDefaults() {
        const types = loadSdkProto();
        for (const [name, fns] of Object.entries(types)) {
            if (fns) {
                this.registerType(name, fns);
            }
        }
    }
    registerType(name, fns) {
        this.registry.set(name, fns);
    }
    encode(message, type, headers) {
        const fns = this.registry.get(type);
        let jsonObj;
        if (fns) {
            jsonObj = fns.toJSON(message);
        }
        else {
            jsonObj = message;
        }
        const jsonStr = JSON.stringify(jsonObj);
        return {
            metadata: {
                type,
                clientIp: localIp,
                headers: headers || {},
            },
            body: {
                value: Buffer.from(jsonStr, 'utf8'),
                typeUrl: '',
            },
        };
    }
    decode(payload) {
        const type = payload.metadata.type;
        const raw = JSON.parse(payload.body.value.toString('utf8'));
        const fns = this.registry.get(type);
        if (fns) {
            return { type, body: fns.fromJSON(raw) };
        }
        return { type, body: raw };
    }
}
exports.PayloadCodec = PayloadCodec;
//# sourceMappingURL=payload_codec.js.map