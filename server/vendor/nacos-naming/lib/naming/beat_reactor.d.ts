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
import { BeatInfo } from '../interface';
export declare class BeatReactor extends Base {
    private _isClosed;
    private _dom2Beat;
    private _isRunning;
    private _clientBeatInterval;
    constructor(options?: any);
    get serverProxy(): any;
    addBeatInfo(serviceName: string, beatInfo: BeatInfo): void;
    removeBeatInfo(serviceName: string, ip: string, port: number): void;
    _buildKey(dom: string, ip: string, port: number): string;
    _beat(beatInfo: BeatInfo): Promise<void>;
    _startBeat(): Promise<void>;
    _close(): Promise<void>;
}
export {};
