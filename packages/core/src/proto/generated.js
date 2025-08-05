/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const lorachain = $root.lorachain = (() => {

    /**
     * Namespace lorachain.
     * @exports lorachain
     * @namespace
     */
    const lorachain = {};

    lorachain.UTXOInput = (function() {

        /**
         * Properties of a UTXOInput.
         * @memberof lorachain
         * @interface IUTXOInput
         * @property {Uint8Array|null} [txHash] UTXOInput txHash
         * @property {number|null} [outputIndex] UTXOInput outputIndex
         * @property {Uint8Array|null} [scriptSig] UTXOInput scriptSig
         */

        /**
         * Constructs a new UTXOInput.
         * @memberof lorachain
         * @classdesc Represents a UTXOInput.
         * @implements IUTXOInput
         * @constructor
         * @param {lorachain.IUTXOInput=} [properties] Properties to set
         */
        function UTXOInput(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * UTXOInput txHash.
         * @member {Uint8Array} txHash
         * @memberof lorachain.UTXOInput
         * @instance
         */
        UTXOInput.prototype.txHash = $util.newBuffer([]);

        /**
         * UTXOInput outputIndex.
         * @member {number} outputIndex
         * @memberof lorachain.UTXOInput
         * @instance
         */
        UTXOInput.prototype.outputIndex = 0;

        /**
         * UTXOInput scriptSig.
         * @member {Uint8Array} scriptSig
         * @memberof lorachain.UTXOInput
         * @instance
         */
        UTXOInput.prototype.scriptSig = $util.newBuffer([]);

        /**
         * Creates a new UTXOInput instance using the specified properties.
         * @function create
         * @memberof lorachain.UTXOInput
         * @static
         * @param {lorachain.IUTXOInput=} [properties] Properties to set
         * @returns {lorachain.UTXOInput} UTXOInput instance
         */
        UTXOInput.create = function create(properties) {
            return new UTXOInput(properties);
        };

        /**
         * Encodes the specified UTXOInput message. Does not implicitly {@link lorachain.UTXOInput.verify|verify} messages.
         * @function encode
         * @memberof lorachain.UTXOInput
         * @static
         * @param {lorachain.IUTXOInput} message UTXOInput message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        UTXOInput.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.txHash != null && Object.hasOwnProperty.call(message, "txHash"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.txHash);
            if (message.outputIndex != null && Object.hasOwnProperty.call(message, "outputIndex"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.outputIndex);
            if (message.scriptSig != null && Object.hasOwnProperty.call(message, "scriptSig"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.scriptSig);
            return writer;
        };

        /**
         * Encodes the specified UTXOInput message, length delimited. Does not implicitly {@link lorachain.UTXOInput.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.UTXOInput
         * @static
         * @param {lorachain.IUTXOInput} message UTXOInput message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        UTXOInput.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a UTXOInput message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.UTXOInput
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.UTXOInput} UTXOInput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        UTXOInput.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.UTXOInput();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.txHash = reader.bytes();
                        break;
                    }
                case 2: {
                        message.outputIndex = reader.uint32();
                        break;
                    }
                case 3: {
                        message.scriptSig = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a UTXOInput message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.UTXOInput
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.UTXOInput} UTXOInput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        UTXOInput.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a UTXOInput message.
         * @function verify
         * @memberof lorachain.UTXOInput
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        UTXOInput.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.txHash != null && message.hasOwnProperty("txHash"))
                if (!(message.txHash && typeof message.txHash.length === "number" || $util.isString(message.txHash)))
                    return "txHash: buffer expected";
            if (message.outputIndex != null && message.hasOwnProperty("outputIndex"))
                if (!$util.isInteger(message.outputIndex))
                    return "outputIndex: integer expected";
            if (message.scriptSig != null && message.hasOwnProperty("scriptSig"))
                if (!(message.scriptSig && typeof message.scriptSig.length === "number" || $util.isString(message.scriptSig)))
                    return "scriptSig: buffer expected";
            return null;
        };

        /**
         * Creates a UTXOInput message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.UTXOInput
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.UTXOInput} UTXOInput
         */
        UTXOInput.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.UTXOInput)
                return object;
            let message = new $root.lorachain.UTXOInput();
            if (object.txHash != null)
                if (typeof object.txHash === "string")
                    $util.base64.decode(object.txHash, message.txHash = $util.newBuffer($util.base64.length(object.txHash)), 0);
                else if (object.txHash.length >= 0)
                    message.txHash = object.txHash;
            if (object.outputIndex != null)
                message.outputIndex = object.outputIndex >>> 0;
            if (object.scriptSig != null)
                if (typeof object.scriptSig === "string")
                    $util.base64.decode(object.scriptSig, message.scriptSig = $util.newBuffer($util.base64.length(object.scriptSig)), 0);
                else if (object.scriptSig.length >= 0)
                    message.scriptSig = object.scriptSig;
            return message;
        };

        /**
         * Creates a plain object from a UTXOInput message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.UTXOInput
         * @static
         * @param {lorachain.UTXOInput} message UTXOInput
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        UTXOInput.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults) {
                if (options.bytes === String)
                    object.txHash = "";
                else {
                    object.txHash = [];
                    if (options.bytes !== Array)
                        object.txHash = $util.newBuffer(object.txHash);
                }
                object.outputIndex = 0;
                if (options.bytes === String)
                    object.scriptSig = "";
                else {
                    object.scriptSig = [];
                    if (options.bytes !== Array)
                        object.scriptSig = $util.newBuffer(object.scriptSig);
                }
            }
            if (message.txHash != null && message.hasOwnProperty("txHash"))
                object.txHash = options.bytes === String ? $util.base64.encode(message.txHash, 0, message.txHash.length) : options.bytes === Array ? Array.prototype.slice.call(message.txHash) : message.txHash;
            if (message.outputIndex != null && message.hasOwnProperty("outputIndex"))
                object.outputIndex = message.outputIndex;
            if (message.scriptSig != null && message.hasOwnProperty("scriptSig"))
                object.scriptSig = options.bytes === String ? $util.base64.encode(message.scriptSig, 0, message.scriptSig.length) : options.bytes === Array ? Array.prototype.slice.call(message.scriptSig) : message.scriptSig;
            return object;
        };

        /**
         * Converts this UTXOInput to JSON.
         * @function toJSON
         * @memberof lorachain.UTXOInput
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        UTXOInput.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for UTXOInput
         * @function getTypeUrl
         * @memberof lorachain.UTXOInput
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        UTXOInput.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.UTXOInput";
        };

        return UTXOInput;
    })();

    lorachain.UTXOOutput = (function() {

        /**
         * Properties of a UTXOOutput.
         * @memberof lorachain
         * @interface IUTXOOutput
         * @property {number|Long|null} [amount] UTXOOutput amount
         * @property {number|null} [addressId] UTXOOutput addressId
         * @property {Uint8Array|null} [scriptPubkey] UTXOOutput scriptPubkey
         */

        /**
         * Constructs a new UTXOOutput.
         * @memberof lorachain
         * @classdesc Represents a UTXOOutput.
         * @implements IUTXOOutput
         * @constructor
         * @param {lorachain.IUTXOOutput=} [properties] Properties to set
         */
        function UTXOOutput(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * UTXOOutput amount.
         * @member {number|Long} amount
         * @memberof lorachain.UTXOOutput
         * @instance
         */
        UTXOOutput.prototype.amount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * UTXOOutput addressId.
         * @member {number} addressId
         * @memberof lorachain.UTXOOutput
         * @instance
         */
        UTXOOutput.prototype.addressId = 0;

        /**
         * UTXOOutput scriptPubkey.
         * @member {Uint8Array} scriptPubkey
         * @memberof lorachain.UTXOOutput
         * @instance
         */
        UTXOOutput.prototype.scriptPubkey = $util.newBuffer([]);

        /**
         * Creates a new UTXOOutput instance using the specified properties.
         * @function create
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {lorachain.IUTXOOutput=} [properties] Properties to set
         * @returns {lorachain.UTXOOutput} UTXOOutput instance
         */
        UTXOOutput.create = function create(properties) {
            return new UTXOOutput(properties);
        };

        /**
         * Encodes the specified UTXOOutput message. Does not implicitly {@link lorachain.UTXOOutput.verify|verify} messages.
         * @function encode
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {lorachain.IUTXOOutput} message UTXOOutput message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        UTXOOutput.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.amount);
            if (message.addressId != null && Object.hasOwnProperty.call(message, "addressId"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.addressId);
            if (message.scriptPubkey != null && Object.hasOwnProperty.call(message, "scriptPubkey"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.scriptPubkey);
            return writer;
        };

        /**
         * Encodes the specified UTXOOutput message, length delimited. Does not implicitly {@link lorachain.UTXOOutput.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {lorachain.IUTXOOutput} message UTXOOutput message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        UTXOOutput.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a UTXOOutput message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.UTXOOutput} UTXOOutput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        UTXOOutput.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.UTXOOutput();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.amount = reader.uint64();
                        break;
                    }
                case 2: {
                        message.addressId = reader.uint32();
                        break;
                    }
                case 3: {
                        message.scriptPubkey = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a UTXOOutput message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.UTXOOutput} UTXOOutput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        UTXOOutput.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a UTXOOutput message.
         * @function verify
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        UTXOOutput.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.amount != null && message.hasOwnProperty("amount"))
                if (!$util.isInteger(message.amount) && !(message.amount && $util.isInteger(message.amount.low) && $util.isInteger(message.amount.high)))
                    return "amount: integer|Long expected";
            if (message.addressId != null && message.hasOwnProperty("addressId"))
                if (!$util.isInteger(message.addressId))
                    return "addressId: integer expected";
            if (message.scriptPubkey != null && message.hasOwnProperty("scriptPubkey"))
                if (!(message.scriptPubkey && typeof message.scriptPubkey.length === "number" || $util.isString(message.scriptPubkey)))
                    return "scriptPubkey: buffer expected";
            return null;
        };

        /**
         * Creates a UTXOOutput message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.UTXOOutput} UTXOOutput
         */
        UTXOOutput.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.UTXOOutput)
                return object;
            let message = new $root.lorachain.UTXOOutput();
            if (object.amount != null)
                if ($util.Long)
                    (message.amount = $util.Long.fromValue(object.amount)).unsigned = true;
                else if (typeof object.amount === "string")
                    message.amount = parseInt(object.amount, 10);
                else if (typeof object.amount === "number")
                    message.amount = object.amount;
                else if (typeof object.amount === "object")
                    message.amount = new $util.LongBits(object.amount.low >>> 0, object.amount.high >>> 0).toNumber(true);
            if (object.addressId != null)
                message.addressId = object.addressId >>> 0;
            if (object.scriptPubkey != null)
                if (typeof object.scriptPubkey === "string")
                    $util.base64.decode(object.scriptPubkey, message.scriptPubkey = $util.newBuffer($util.base64.length(object.scriptPubkey)), 0);
                else if (object.scriptPubkey.length >= 0)
                    message.scriptPubkey = object.scriptPubkey;
            return message;
        };

        /**
         * Creates a plain object from a UTXOOutput message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {lorachain.UTXOOutput} message UTXOOutput
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        UTXOOutput.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults) {
                if ($util.Long) {
                    let long = new $util.Long(0, 0, true);
                    object.amount = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.amount = options.longs === String ? "0" : 0;
                object.addressId = 0;
                if (options.bytes === String)
                    object.scriptPubkey = "";
                else {
                    object.scriptPubkey = [];
                    if (options.bytes !== Array)
                        object.scriptPubkey = $util.newBuffer(object.scriptPubkey);
                }
            }
            if (message.amount != null && message.hasOwnProperty("amount"))
                if (typeof message.amount === "number")
                    object.amount = options.longs === String ? String(message.amount) : message.amount;
                else
                    object.amount = options.longs === String ? $util.Long.prototype.toString.call(message.amount) : options.longs === Number ? new $util.LongBits(message.amount.low >>> 0, message.amount.high >>> 0).toNumber(true) : message.amount;
            if (message.addressId != null && message.hasOwnProperty("addressId"))
                object.addressId = message.addressId;
            if (message.scriptPubkey != null && message.hasOwnProperty("scriptPubkey"))
                object.scriptPubkey = options.bytes === String ? $util.base64.encode(message.scriptPubkey, 0, message.scriptPubkey.length) : options.bytes === Array ? Array.prototype.slice.call(message.scriptPubkey) : message.scriptPubkey;
            return object;
        };

        /**
         * Converts this UTXOOutput to JSON.
         * @function toJSON
         * @memberof lorachain.UTXOOutput
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        UTXOOutput.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for UTXOOutput
         * @function getTypeUrl
         * @memberof lorachain.UTXOOutput
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        UTXOOutput.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.UTXOOutput";
        };

        return UTXOOutput;
    })();

    lorachain.CompressedUTXOTransaction = (function() {

        /**
         * Properties of a CompressedUTXOTransaction.
         * @memberof lorachain
         * @interface ICompressedUTXOTransaction
         * @property {Uint8Array|null} [id] CompressedUTXOTransaction id
         * @property {Array.<lorachain.IUTXOInput>|null} [inputs] CompressedUTXOTransaction inputs
         * @property {Array.<lorachain.IUTXOOutput>|null} [outputs] CompressedUTXOTransaction outputs
         * @property {number|null} [fee] CompressedUTXOTransaction fee
         * @property {number|null} [timestamp] CompressedUTXOTransaction timestamp
         * @property {Uint8Array|null} [signature] CompressedUTXOTransaction signature
         * @property {number|null} [nonce] CompressedUTXOTransaction nonce
         */

        /**
         * Constructs a new CompressedUTXOTransaction.
         * @memberof lorachain
         * @classdesc Represents a CompressedUTXOTransaction.
         * @implements ICompressedUTXOTransaction
         * @constructor
         * @param {lorachain.ICompressedUTXOTransaction=} [properties] Properties to set
         */
        function CompressedUTXOTransaction(properties) {
            this.inputs = [];
            this.outputs = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CompressedUTXOTransaction id.
         * @member {Uint8Array} id
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         */
        CompressedUTXOTransaction.prototype.id = $util.newBuffer([]);

        /**
         * CompressedUTXOTransaction inputs.
         * @member {Array.<lorachain.IUTXOInput>} inputs
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         */
        CompressedUTXOTransaction.prototype.inputs = $util.emptyArray;

        /**
         * CompressedUTXOTransaction outputs.
         * @member {Array.<lorachain.IUTXOOutput>} outputs
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         */
        CompressedUTXOTransaction.prototype.outputs = $util.emptyArray;

        /**
         * CompressedUTXOTransaction fee.
         * @member {number} fee
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         */
        CompressedUTXOTransaction.prototype.fee = 0;

        /**
         * CompressedUTXOTransaction timestamp.
         * @member {number} timestamp
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         */
        CompressedUTXOTransaction.prototype.timestamp = 0;

        /**
         * CompressedUTXOTransaction signature.
         * @member {Uint8Array} signature
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         */
        CompressedUTXOTransaction.prototype.signature = $util.newBuffer([]);

        /**
         * CompressedUTXOTransaction nonce.
         * @member {number} nonce
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         */
        CompressedUTXOTransaction.prototype.nonce = 0;

        /**
         * Creates a new CompressedUTXOTransaction instance using the specified properties.
         * @function create
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {lorachain.ICompressedUTXOTransaction=} [properties] Properties to set
         * @returns {lorachain.CompressedUTXOTransaction} CompressedUTXOTransaction instance
         */
        CompressedUTXOTransaction.create = function create(properties) {
            return new CompressedUTXOTransaction(properties);
        };

        /**
         * Encodes the specified CompressedUTXOTransaction message. Does not implicitly {@link lorachain.CompressedUTXOTransaction.verify|verify} messages.
         * @function encode
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {lorachain.ICompressedUTXOTransaction} message CompressedUTXOTransaction message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedUTXOTransaction.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.id);
            if (message.inputs != null && message.inputs.length)
                for (let i = 0; i < message.inputs.length; ++i)
                    $root.lorachain.UTXOInput.encode(message.inputs[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.outputs != null && message.outputs.length)
                for (let i = 0; i < message.outputs.length; ++i)
                    $root.lorachain.UTXOOutput.encode(message.outputs[i], writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.fee != null && Object.hasOwnProperty.call(message, "fee"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.fee);
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.timestamp);
            if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.signature);
            if (message.nonce != null && Object.hasOwnProperty.call(message, "nonce"))
                writer.uint32(/* id 7, wireType 0 =*/56).uint32(message.nonce);
            return writer;
        };

        /**
         * Encodes the specified CompressedUTXOTransaction message, length delimited. Does not implicitly {@link lorachain.CompressedUTXOTransaction.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {lorachain.ICompressedUTXOTransaction} message CompressedUTXOTransaction message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedUTXOTransaction.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CompressedUTXOTransaction message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.CompressedUTXOTransaction} CompressedUTXOTransaction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedUTXOTransaction.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.CompressedUTXOTransaction();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.id = reader.bytes();
                        break;
                    }
                case 2: {
                        if (!(message.inputs && message.inputs.length))
                            message.inputs = [];
                        message.inputs.push($root.lorachain.UTXOInput.decode(reader, reader.uint32()));
                        break;
                    }
                case 3: {
                        if (!(message.outputs && message.outputs.length))
                            message.outputs = [];
                        message.outputs.push($root.lorachain.UTXOOutput.decode(reader, reader.uint32()));
                        break;
                    }
                case 4: {
                        message.fee = reader.uint32();
                        break;
                    }
                case 5: {
                        message.timestamp = reader.uint32();
                        break;
                    }
                case 6: {
                        message.signature = reader.bytes();
                        break;
                    }
                case 7: {
                        message.nonce = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a CompressedUTXOTransaction message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.CompressedUTXOTransaction} CompressedUTXOTransaction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedUTXOTransaction.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a CompressedUTXOTransaction message.
         * @function verify
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        CompressedUTXOTransaction.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.id != null && message.hasOwnProperty("id"))
                if (!(message.id && typeof message.id.length === "number" || $util.isString(message.id)))
                    return "id: buffer expected";
            if (message.inputs != null && message.hasOwnProperty("inputs")) {
                if (!Array.isArray(message.inputs))
                    return "inputs: array expected";
                for (let i = 0; i < message.inputs.length; ++i) {
                    let error = $root.lorachain.UTXOInput.verify(message.inputs[i]);
                    if (error)
                        return "inputs." + error;
                }
            }
            if (message.outputs != null && message.hasOwnProperty("outputs")) {
                if (!Array.isArray(message.outputs))
                    return "outputs: array expected";
                for (let i = 0; i < message.outputs.length; ++i) {
                    let error = $root.lorachain.UTXOOutput.verify(message.outputs[i]);
                    if (error)
                        return "outputs." + error;
                }
            }
            if (message.fee != null && message.hasOwnProperty("fee"))
                if (!$util.isInteger(message.fee))
                    return "fee: integer expected";
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (!$util.isInteger(message.timestamp))
                    return "timestamp: integer expected";
            if (message.signature != null && message.hasOwnProperty("signature"))
                if (!(message.signature && typeof message.signature.length === "number" || $util.isString(message.signature)))
                    return "signature: buffer expected";
            if (message.nonce != null && message.hasOwnProperty("nonce"))
                if (!$util.isInteger(message.nonce))
                    return "nonce: integer expected";
            return null;
        };

        /**
         * Creates a CompressedUTXOTransaction message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.CompressedUTXOTransaction} CompressedUTXOTransaction
         */
        CompressedUTXOTransaction.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.CompressedUTXOTransaction)
                return object;
            let message = new $root.lorachain.CompressedUTXOTransaction();
            if (object.id != null)
                if (typeof object.id === "string")
                    $util.base64.decode(object.id, message.id = $util.newBuffer($util.base64.length(object.id)), 0);
                else if (object.id.length >= 0)
                    message.id = object.id;
            if (object.inputs) {
                if (!Array.isArray(object.inputs))
                    throw TypeError(".lorachain.CompressedUTXOTransaction.inputs: array expected");
                message.inputs = [];
                for (let i = 0; i < object.inputs.length; ++i) {
                    if (typeof object.inputs[i] !== "object")
                        throw TypeError(".lorachain.CompressedUTXOTransaction.inputs: object expected");
                    message.inputs[i] = $root.lorachain.UTXOInput.fromObject(object.inputs[i]);
                }
            }
            if (object.outputs) {
                if (!Array.isArray(object.outputs))
                    throw TypeError(".lorachain.CompressedUTXOTransaction.outputs: array expected");
                message.outputs = [];
                for (let i = 0; i < object.outputs.length; ++i) {
                    if (typeof object.outputs[i] !== "object")
                        throw TypeError(".lorachain.CompressedUTXOTransaction.outputs: object expected");
                    message.outputs[i] = $root.lorachain.UTXOOutput.fromObject(object.outputs[i]);
                }
            }
            if (object.fee != null)
                message.fee = object.fee >>> 0;
            if (object.timestamp != null)
                message.timestamp = object.timestamp >>> 0;
            if (object.signature != null)
                if (typeof object.signature === "string")
                    $util.base64.decode(object.signature, message.signature = $util.newBuffer($util.base64.length(object.signature)), 0);
                else if (object.signature.length >= 0)
                    message.signature = object.signature;
            if (object.nonce != null)
                message.nonce = object.nonce >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a CompressedUTXOTransaction message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {lorachain.CompressedUTXOTransaction} message CompressedUTXOTransaction
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        CompressedUTXOTransaction.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.arrays || options.defaults) {
                object.inputs = [];
                object.outputs = [];
            }
            if (options.defaults) {
                if (options.bytes === String)
                    object.id = "";
                else {
                    object.id = [];
                    if (options.bytes !== Array)
                        object.id = $util.newBuffer(object.id);
                }
                object.fee = 0;
                object.timestamp = 0;
                if (options.bytes === String)
                    object.signature = "";
                else {
                    object.signature = [];
                    if (options.bytes !== Array)
                        object.signature = $util.newBuffer(object.signature);
                }
                object.nonce = 0;
            }
            if (message.id != null && message.hasOwnProperty("id"))
                object.id = options.bytes === String ? $util.base64.encode(message.id, 0, message.id.length) : options.bytes === Array ? Array.prototype.slice.call(message.id) : message.id;
            if (message.inputs && message.inputs.length) {
                object.inputs = [];
                for (let j = 0; j < message.inputs.length; ++j)
                    object.inputs[j] = $root.lorachain.UTXOInput.toObject(message.inputs[j], options);
            }
            if (message.outputs && message.outputs.length) {
                object.outputs = [];
                for (let j = 0; j < message.outputs.length; ++j)
                    object.outputs[j] = $root.lorachain.UTXOOutput.toObject(message.outputs[j], options);
            }
            if (message.fee != null && message.hasOwnProperty("fee"))
                object.fee = message.fee;
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                object.timestamp = message.timestamp;
            if (message.signature != null && message.hasOwnProperty("signature"))
                object.signature = options.bytes === String ? $util.base64.encode(message.signature, 0, message.signature.length) : options.bytes === Array ? Array.prototype.slice.call(message.signature) : message.signature;
            if (message.nonce != null && message.hasOwnProperty("nonce"))
                object.nonce = message.nonce;
            return object;
        };

        /**
         * Converts this CompressedUTXOTransaction to JSON.
         * @function toJSON
         * @memberof lorachain.CompressedUTXOTransaction
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        CompressedUTXOTransaction.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for CompressedUTXOTransaction
         * @function getTypeUrl
         * @memberof lorachain.CompressedUTXOTransaction
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CompressedUTXOTransaction.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.CompressedUTXOTransaction";
        };

        return CompressedUTXOTransaction;
    })();

    lorachain.CompressedUTXOBlock = (function() {

        /**
         * Properties of a CompressedUTXOBlock.
         * @memberof lorachain
         * @interface ICompressedUTXOBlock
         * @property {number|null} [index] CompressedUTXOBlock index
         * @property {number|null} [timestamp] CompressedUTXOBlock timestamp
         * @property {Array.<lorachain.ICompressedUTXOTransaction>|null} [transactions] CompressedUTXOBlock transactions
         * @property {Uint8Array|null} [previousHash] CompressedUTXOBlock previousHash
         * @property {Uint8Array|null} [hash] CompressedUTXOBlock hash
         * @property {number|null} [nonce] CompressedUTXOBlock nonce
         * @property {Uint8Array|null} [merkleRoot] CompressedUTXOBlock merkleRoot
         * @property {number|null} [difficulty] CompressedUTXOBlock difficulty
         */

        /**
         * Constructs a new CompressedUTXOBlock.
         * @memberof lorachain
         * @classdesc Represents a CompressedUTXOBlock.
         * @implements ICompressedUTXOBlock
         * @constructor
         * @param {lorachain.ICompressedUTXOBlock=} [properties] Properties to set
         */
        function CompressedUTXOBlock(properties) {
            this.transactions = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CompressedUTXOBlock index.
         * @member {number} index
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.index = 0;

        /**
         * CompressedUTXOBlock timestamp.
         * @member {number} timestamp
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.timestamp = 0;

        /**
         * CompressedUTXOBlock transactions.
         * @member {Array.<lorachain.ICompressedUTXOTransaction>} transactions
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.transactions = $util.emptyArray;

        /**
         * CompressedUTXOBlock previousHash.
         * @member {Uint8Array} previousHash
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.previousHash = $util.newBuffer([]);

        /**
         * CompressedUTXOBlock hash.
         * @member {Uint8Array} hash
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.hash = $util.newBuffer([]);

        /**
         * CompressedUTXOBlock nonce.
         * @member {number} nonce
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.nonce = 0;

        /**
         * CompressedUTXOBlock merkleRoot.
         * @member {Uint8Array} merkleRoot
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.merkleRoot = $util.newBuffer([]);

        /**
         * CompressedUTXOBlock difficulty.
         * @member {number} difficulty
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         */
        CompressedUTXOBlock.prototype.difficulty = 0;

        /**
         * Creates a new CompressedUTXOBlock instance using the specified properties.
         * @function create
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {lorachain.ICompressedUTXOBlock=} [properties] Properties to set
         * @returns {lorachain.CompressedUTXOBlock} CompressedUTXOBlock instance
         */
        CompressedUTXOBlock.create = function create(properties) {
            return new CompressedUTXOBlock(properties);
        };

        /**
         * Encodes the specified CompressedUTXOBlock message. Does not implicitly {@link lorachain.CompressedUTXOBlock.verify|verify} messages.
         * @function encode
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {lorachain.ICompressedUTXOBlock} message CompressedUTXOBlock message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedUTXOBlock.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.index != null && Object.hasOwnProperty.call(message, "index"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.index);
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.timestamp);
            if (message.transactions != null && message.transactions.length)
                for (let i = 0; i < message.transactions.length; ++i)
                    $root.lorachain.CompressedUTXOTransaction.encode(message.transactions[i], writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.previousHash != null && Object.hasOwnProperty.call(message, "previousHash"))
                writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.previousHash);
            if (message.hash != null && Object.hasOwnProperty.call(message, "hash"))
                writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.hash);
            if (message.nonce != null && Object.hasOwnProperty.call(message, "nonce"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint32(message.nonce);
            if (message.merkleRoot != null && Object.hasOwnProperty.call(message, "merkleRoot"))
                writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.merkleRoot);
            if (message.difficulty != null && Object.hasOwnProperty.call(message, "difficulty"))
                writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.difficulty);
            return writer;
        };

        /**
         * Encodes the specified CompressedUTXOBlock message, length delimited. Does not implicitly {@link lorachain.CompressedUTXOBlock.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {lorachain.ICompressedUTXOBlock} message CompressedUTXOBlock message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedUTXOBlock.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CompressedUTXOBlock message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.CompressedUTXOBlock} CompressedUTXOBlock
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedUTXOBlock.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.CompressedUTXOBlock();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.index = reader.uint32();
                        break;
                    }
                case 2: {
                        message.timestamp = reader.uint32();
                        break;
                    }
                case 3: {
                        if (!(message.transactions && message.transactions.length))
                            message.transactions = [];
                        message.transactions.push($root.lorachain.CompressedUTXOTransaction.decode(reader, reader.uint32()));
                        break;
                    }
                case 4: {
                        message.previousHash = reader.bytes();
                        break;
                    }
                case 5: {
                        message.hash = reader.bytes();
                        break;
                    }
                case 6: {
                        message.nonce = reader.uint32();
                        break;
                    }
                case 7: {
                        message.merkleRoot = reader.bytes();
                        break;
                    }
                case 8: {
                        message.difficulty = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a CompressedUTXOBlock message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.CompressedUTXOBlock} CompressedUTXOBlock
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedUTXOBlock.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a CompressedUTXOBlock message.
         * @function verify
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        CompressedUTXOBlock.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.index != null && message.hasOwnProperty("index"))
                if (!$util.isInteger(message.index))
                    return "index: integer expected";
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (!$util.isInteger(message.timestamp))
                    return "timestamp: integer expected";
            if (message.transactions != null && message.hasOwnProperty("transactions")) {
                if (!Array.isArray(message.transactions))
                    return "transactions: array expected";
                for (let i = 0; i < message.transactions.length; ++i) {
                    let error = $root.lorachain.CompressedUTXOTransaction.verify(message.transactions[i]);
                    if (error)
                        return "transactions." + error;
                }
            }
            if (message.previousHash != null && message.hasOwnProperty("previousHash"))
                if (!(message.previousHash && typeof message.previousHash.length === "number" || $util.isString(message.previousHash)))
                    return "previousHash: buffer expected";
            if (message.hash != null && message.hasOwnProperty("hash"))
                if (!(message.hash && typeof message.hash.length === "number" || $util.isString(message.hash)))
                    return "hash: buffer expected";
            if (message.nonce != null && message.hasOwnProperty("nonce"))
                if (!$util.isInteger(message.nonce))
                    return "nonce: integer expected";
            if (message.merkleRoot != null && message.hasOwnProperty("merkleRoot"))
                if (!(message.merkleRoot && typeof message.merkleRoot.length === "number" || $util.isString(message.merkleRoot)))
                    return "merkleRoot: buffer expected";
            if (message.difficulty != null && message.hasOwnProperty("difficulty"))
                if (!$util.isInteger(message.difficulty))
                    return "difficulty: integer expected";
            return null;
        };

        /**
         * Creates a CompressedUTXOBlock message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.CompressedUTXOBlock} CompressedUTXOBlock
         */
        CompressedUTXOBlock.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.CompressedUTXOBlock)
                return object;
            let message = new $root.lorachain.CompressedUTXOBlock();
            if (object.index != null)
                message.index = object.index >>> 0;
            if (object.timestamp != null)
                message.timestamp = object.timestamp >>> 0;
            if (object.transactions) {
                if (!Array.isArray(object.transactions))
                    throw TypeError(".lorachain.CompressedUTXOBlock.transactions: array expected");
                message.transactions = [];
                for (let i = 0; i < object.transactions.length; ++i) {
                    if (typeof object.transactions[i] !== "object")
                        throw TypeError(".lorachain.CompressedUTXOBlock.transactions: object expected");
                    message.transactions[i] = $root.lorachain.CompressedUTXOTransaction.fromObject(object.transactions[i]);
                }
            }
            if (object.previousHash != null)
                if (typeof object.previousHash === "string")
                    $util.base64.decode(object.previousHash, message.previousHash = $util.newBuffer($util.base64.length(object.previousHash)), 0);
                else if (object.previousHash.length >= 0)
                    message.previousHash = object.previousHash;
            if (object.hash != null)
                if (typeof object.hash === "string")
                    $util.base64.decode(object.hash, message.hash = $util.newBuffer($util.base64.length(object.hash)), 0);
                else if (object.hash.length >= 0)
                    message.hash = object.hash;
            if (object.nonce != null)
                message.nonce = object.nonce >>> 0;
            if (object.merkleRoot != null)
                if (typeof object.merkleRoot === "string")
                    $util.base64.decode(object.merkleRoot, message.merkleRoot = $util.newBuffer($util.base64.length(object.merkleRoot)), 0);
                else if (object.merkleRoot.length >= 0)
                    message.merkleRoot = object.merkleRoot;
            if (object.difficulty != null)
                message.difficulty = object.difficulty >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a CompressedUTXOBlock message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {lorachain.CompressedUTXOBlock} message CompressedUTXOBlock
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        CompressedUTXOBlock.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.arrays || options.defaults)
                object.transactions = [];
            if (options.defaults) {
                object.index = 0;
                object.timestamp = 0;
                if (options.bytes === String)
                    object.previousHash = "";
                else {
                    object.previousHash = [];
                    if (options.bytes !== Array)
                        object.previousHash = $util.newBuffer(object.previousHash);
                }
                if (options.bytes === String)
                    object.hash = "";
                else {
                    object.hash = [];
                    if (options.bytes !== Array)
                        object.hash = $util.newBuffer(object.hash);
                }
                object.nonce = 0;
                if (options.bytes === String)
                    object.merkleRoot = "";
                else {
                    object.merkleRoot = [];
                    if (options.bytes !== Array)
                        object.merkleRoot = $util.newBuffer(object.merkleRoot);
                }
                object.difficulty = 0;
            }
            if (message.index != null && message.hasOwnProperty("index"))
                object.index = message.index;
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                object.timestamp = message.timestamp;
            if (message.transactions && message.transactions.length) {
                object.transactions = [];
                for (let j = 0; j < message.transactions.length; ++j)
                    object.transactions[j] = $root.lorachain.CompressedUTXOTransaction.toObject(message.transactions[j], options);
            }
            if (message.previousHash != null && message.hasOwnProperty("previousHash"))
                object.previousHash = options.bytes === String ? $util.base64.encode(message.previousHash, 0, message.previousHash.length) : options.bytes === Array ? Array.prototype.slice.call(message.previousHash) : message.previousHash;
            if (message.hash != null && message.hasOwnProperty("hash"))
                object.hash = options.bytes === String ? $util.base64.encode(message.hash, 0, message.hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.hash) : message.hash;
            if (message.nonce != null && message.hasOwnProperty("nonce"))
                object.nonce = message.nonce;
            if (message.merkleRoot != null && message.hasOwnProperty("merkleRoot"))
                object.merkleRoot = options.bytes === String ? $util.base64.encode(message.merkleRoot, 0, message.merkleRoot.length) : options.bytes === Array ? Array.prototype.slice.call(message.merkleRoot) : message.merkleRoot;
            if (message.difficulty != null && message.hasOwnProperty("difficulty"))
                object.difficulty = message.difficulty;
            return object;
        };

        /**
         * Converts this CompressedUTXOBlock to JSON.
         * @function toJSON
         * @memberof lorachain.CompressedUTXOBlock
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        CompressedUTXOBlock.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for CompressedUTXOBlock
         * @function getTypeUrl
         * @memberof lorachain.CompressedUTXOBlock
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CompressedUTXOBlock.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.CompressedUTXOBlock";
        };

        return CompressedUTXOBlock;
    })();

    /**
     * CompressionType enum.
     * @name lorachain.CompressionType
     * @enum {number}
     * @property {number} NONE=0 NONE value
     * @property {number} PROTOBUF=1 PROTOBUF value
     * @property {number} GZIP=2 GZIP value
     * @property {number} LZ4=3 LZ4 value
     * @property {number} UTXO_CUSTOM=4 UTXO_CUSTOM value
     * @property {number} UTXO_DICTIONARY=5 UTXO_DICTIONARY value
     */
    lorachain.CompressionType = (function() {
        const valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "NONE"] = 0;
        values[valuesById[1] = "PROTOBUF"] = 1;
        values[valuesById[2] = "GZIP"] = 2;
        values[valuesById[3] = "LZ4"] = 3;
        values[valuesById[4] = "UTXO_CUSTOM"] = 4;
        values[valuesById[5] = "UTXO_DICTIONARY"] = 5;
        return values;
    })();

    /**
     * MessageType enum.
     * @name lorachain.MessageType
     * @enum {number}
     * @property {number} UTXO_TRANSACTION=0 UTXO_TRANSACTION value
     * @property {number} UTXO_BLOCK=1 UTXO_BLOCK value
     * @property {number} BLOCKCHAIN_SYNC=2 BLOCKCHAIN_SYNC value
     * @property {number} NODE_DISCOVERY=3 NODE_DISCOVERY value
     * @property {number} ROUTE_REQUEST=4 ROUTE_REQUEST value
     * @property {number} ROUTE_REPLY=5 ROUTE_REPLY value
     * @property {number} ROUTE_ERROR=6 ROUTE_ERROR value
     * @property {number} HELLO=7 HELLO value
     * @property {number} FRAGMENT=8 FRAGMENT value
     * @property {number} FRAGMENT_ACK=9 FRAGMENT_ACK value
     */
    lorachain.MessageType = (function() {
        const valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "UTXO_TRANSACTION"] = 0;
        values[valuesById[1] = "UTXO_BLOCK"] = 1;
        values[valuesById[2] = "BLOCKCHAIN_SYNC"] = 2;
        values[valuesById[3] = "NODE_DISCOVERY"] = 3;
        values[valuesById[4] = "ROUTE_REQUEST"] = 4;
        values[valuesById[5] = "ROUTE_REPLY"] = 5;
        values[valuesById[6] = "ROUTE_ERROR"] = 6;
        values[valuesById[7] = "HELLO"] = 7;
        values[valuesById[8] = "FRAGMENT"] = 8;
        values[valuesById[9] = "FRAGMENT_ACK"] = 9;
        return values;
    })();

    lorachain.CompressedUTXOMeshMessage = (function() {

        /**
         * Properties of a CompressedUTXOMeshMessage.
         * @memberof lorachain
         * @interface ICompressedUTXOMeshMessage
         * @property {lorachain.MessageType|null} [type] CompressedUTXOMeshMessage type
         * @property {Uint8Array|null} [payload] CompressedUTXOMeshMessage payload
         * @property {number|null} [timestamp] CompressedUTXOMeshMessage timestamp
         * @property {number|null} [fromId] CompressedUTXOMeshMessage fromId
         * @property {number|null} [toId] CompressedUTXOMeshMessage toId
         * @property {Uint8Array|null} [signature] CompressedUTXOMeshMessage signature
         * @property {lorachain.CompressionType|null} [compression] CompressedUTXOMeshMessage compression
         * @property {number|null} [originalSize] CompressedUTXOMeshMessage originalSize
         * @property {Uint8Array|null} [compressionDictId] CompressedUTXOMeshMessage compressionDictId
         * @property {number|null} [fragmentId] CompressedUTXOMeshMessage fragmentId
         * @property {number|null} [totalFragments] CompressedUTXOMeshMessage totalFragments
         */

        /**
         * Constructs a new CompressedUTXOMeshMessage.
         * @memberof lorachain
         * @classdesc Represents a CompressedUTXOMeshMessage.
         * @implements ICompressedUTXOMeshMessage
         * @constructor
         * @param {lorachain.ICompressedUTXOMeshMessage=} [properties] Properties to set
         */
        function CompressedUTXOMeshMessage(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CompressedUTXOMeshMessage type.
         * @member {lorachain.MessageType} type
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.type = 0;

        /**
         * CompressedUTXOMeshMessage payload.
         * @member {Uint8Array} payload
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.payload = $util.newBuffer([]);

        /**
         * CompressedUTXOMeshMessage timestamp.
         * @member {number} timestamp
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.timestamp = 0;

        /**
         * CompressedUTXOMeshMessage fromId.
         * @member {number} fromId
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.fromId = 0;

        /**
         * CompressedUTXOMeshMessage toId.
         * @member {number} toId
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.toId = 0;

        /**
         * CompressedUTXOMeshMessage signature.
         * @member {Uint8Array} signature
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.signature = $util.newBuffer([]);

        /**
         * CompressedUTXOMeshMessage compression.
         * @member {lorachain.CompressionType} compression
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.compression = 0;

        /**
         * CompressedUTXOMeshMessage originalSize.
         * @member {number} originalSize
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.originalSize = 0;

        /**
         * CompressedUTXOMeshMessage compressionDictId.
         * @member {Uint8Array} compressionDictId
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.compressionDictId = $util.newBuffer([]);

        /**
         * CompressedUTXOMeshMessage fragmentId.
         * @member {number} fragmentId
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.fragmentId = 0;

        /**
         * CompressedUTXOMeshMessage totalFragments.
         * @member {number} totalFragments
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         */
        CompressedUTXOMeshMessage.prototype.totalFragments = 0;

        /**
         * Creates a new CompressedUTXOMeshMessage instance using the specified properties.
         * @function create
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {lorachain.ICompressedUTXOMeshMessage=} [properties] Properties to set
         * @returns {lorachain.CompressedUTXOMeshMessage} CompressedUTXOMeshMessage instance
         */
        CompressedUTXOMeshMessage.create = function create(properties) {
            return new CompressedUTXOMeshMessage(properties);
        };

        /**
         * Encodes the specified CompressedUTXOMeshMessage message. Does not implicitly {@link lorachain.CompressedUTXOMeshMessage.verify|verify} messages.
         * @function encode
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {lorachain.ICompressedUTXOMeshMessage} message CompressedUTXOMeshMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedUTXOMeshMessage.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.type);
            if (message.payload != null && Object.hasOwnProperty.call(message, "payload"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.payload);
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.timestamp);
            if (message.fromId != null && Object.hasOwnProperty.call(message, "fromId"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.fromId);
            if (message.toId != null && Object.hasOwnProperty.call(message, "toId"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.toId);
            if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.signature);
            if (message.compression != null && Object.hasOwnProperty.call(message, "compression"))
                writer.uint32(/* id 7, wireType 0 =*/56).int32(message.compression);
            if (message.originalSize != null && Object.hasOwnProperty.call(message, "originalSize"))
                writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.originalSize);
            if (message.compressionDictId != null && Object.hasOwnProperty.call(message, "compressionDictId"))
                writer.uint32(/* id 9, wireType 2 =*/74).bytes(message.compressionDictId);
            if (message.fragmentId != null && Object.hasOwnProperty.call(message, "fragmentId"))
                writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.fragmentId);
            if (message.totalFragments != null && Object.hasOwnProperty.call(message, "totalFragments"))
                writer.uint32(/* id 11, wireType 0 =*/88).uint32(message.totalFragments);
            return writer;
        };

        /**
         * Encodes the specified CompressedUTXOMeshMessage message, length delimited. Does not implicitly {@link lorachain.CompressedUTXOMeshMessage.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {lorachain.ICompressedUTXOMeshMessage} message CompressedUTXOMeshMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedUTXOMeshMessage.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CompressedUTXOMeshMessage message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.CompressedUTXOMeshMessage} CompressedUTXOMeshMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedUTXOMeshMessage.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.CompressedUTXOMeshMessage();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.type = reader.int32();
                        break;
                    }
                case 2: {
                        message.payload = reader.bytes();
                        break;
                    }
                case 3: {
                        message.timestamp = reader.uint32();
                        break;
                    }
                case 4: {
                        message.fromId = reader.uint32();
                        break;
                    }
                case 5: {
                        message.toId = reader.uint32();
                        break;
                    }
                case 6: {
                        message.signature = reader.bytes();
                        break;
                    }
                case 7: {
                        message.compression = reader.int32();
                        break;
                    }
                case 8: {
                        message.originalSize = reader.uint32();
                        break;
                    }
                case 9: {
                        message.compressionDictId = reader.bytes();
                        break;
                    }
                case 10: {
                        message.fragmentId = reader.uint32();
                        break;
                    }
                case 11: {
                        message.totalFragments = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a CompressedUTXOMeshMessage message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.CompressedUTXOMeshMessage} CompressedUTXOMeshMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedUTXOMeshMessage.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a CompressedUTXOMeshMessage message.
         * @function verify
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        CompressedUTXOMeshMessage.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.type != null && message.hasOwnProperty("type"))
                switch (message.type) {
                default:
                    return "type: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                case 9:
                    break;
                }
            if (message.payload != null && message.hasOwnProperty("payload"))
                if (!(message.payload && typeof message.payload.length === "number" || $util.isString(message.payload)))
                    return "payload: buffer expected";
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (!$util.isInteger(message.timestamp))
                    return "timestamp: integer expected";
            if (message.fromId != null && message.hasOwnProperty("fromId"))
                if (!$util.isInteger(message.fromId))
                    return "fromId: integer expected";
            if (message.toId != null && message.hasOwnProperty("toId"))
                if (!$util.isInteger(message.toId))
                    return "toId: integer expected";
            if (message.signature != null && message.hasOwnProperty("signature"))
                if (!(message.signature && typeof message.signature.length === "number" || $util.isString(message.signature)))
                    return "signature: buffer expected";
            if (message.compression != null && message.hasOwnProperty("compression"))
                switch (message.compression) {
                default:
                    return "compression: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                    break;
                }
            if (message.originalSize != null && message.hasOwnProperty("originalSize"))
                if (!$util.isInteger(message.originalSize))
                    return "originalSize: integer expected";
            if (message.compressionDictId != null && message.hasOwnProperty("compressionDictId"))
                if (!(message.compressionDictId && typeof message.compressionDictId.length === "number" || $util.isString(message.compressionDictId)))
                    return "compressionDictId: buffer expected";
            if (message.fragmentId != null && message.hasOwnProperty("fragmentId"))
                if (!$util.isInteger(message.fragmentId))
                    return "fragmentId: integer expected";
            if (message.totalFragments != null && message.hasOwnProperty("totalFragments"))
                if (!$util.isInteger(message.totalFragments))
                    return "totalFragments: integer expected";
            return null;
        };

        /**
         * Creates a CompressedUTXOMeshMessage message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.CompressedUTXOMeshMessage} CompressedUTXOMeshMessage
         */
        CompressedUTXOMeshMessage.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.CompressedUTXOMeshMessage)
                return object;
            let message = new $root.lorachain.CompressedUTXOMeshMessage();
            switch (object.type) {
            default:
                if (typeof object.type === "number") {
                    message.type = object.type;
                    break;
                }
                break;
            case "UTXO_TRANSACTION":
            case 0:
                message.type = 0;
                break;
            case "UTXO_BLOCK":
            case 1:
                message.type = 1;
                break;
            case "BLOCKCHAIN_SYNC":
            case 2:
                message.type = 2;
                break;
            case "NODE_DISCOVERY":
            case 3:
                message.type = 3;
                break;
            case "ROUTE_REQUEST":
            case 4:
                message.type = 4;
                break;
            case "ROUTE_REPLY":
            case 5:
                message.type = 5;
                break;
            case "ROUTE_ERROR":
            case 6:
                message.type = 6;
                break;
            case "HELLO":
            case 7:
                message.type = 7;
                break;
            case "FRAGMENT":
            case 8:
                message.type = 8;
                break;
            case "FRAGMENT_ACK":
            case 9:
                message.type = 9;
                break;
            }
            if (object.payload != null)
                if (typeof object.payload === "string")
                    $util.base64.decode(object.payload, message.payload = $util.newBuffer($util.base64.length(object.payload)), 0);
                else if (object.payload.length >= 0)
                    message.payload = object.payload;
            if (object.timestamp != null)
                message.timestamp = object.timestamp >>> 0;
            if (object.fromId != null)
                message.fromId = object.fromId >>> 0;
            if (object.toId != null)
                message.toId = object.toId >>> 0;
            if (object.signature != null)
                if (typeof object.signature === "string")
                    $util.base64.decode(object.signature, message.signature = $util.newBuffer($util.base64.length(object.signature)), 0);
                else if (object.signature.length >= 0)
                    message.signature = object.signature;
            switch (object.compression) {
            default:
                if (typeof object.compression === "number") {
                    message.compression = object.compression;
                    break;
                }
                break;
            case "NONE":
            case 0:
                message.compression = 0;
                break;
            case "PROTOBUF":
            case 1:
                message.compression = 1;
                break;
            case "GZIP":
            case 2:
                message.compression = 2;
                break;
            case "LZ4":
            case 3:
                message.compression = 3;
                break;
            case "UTXO_CUSTOM":
            case 4:
                message.compression = 4;
                break;
            case "UTXO_DICTIONARY":
            case 5:
                message.compression = 5;
                break;
            }
            if (object.originalSize != null)
                message.originalSize = object.originalSize >>> 0;
            if (object.compressionDictId != null)
                if (typeof object.compressionDictId === "string")
                    $util.base64.decode(object.compressionDictId, message.compressionDictId = $util.newBuffer($util.base64.length(object.compressionDictId)), 0);
                else if (object.compressionDictId.length >= 0)
                    message.compressionDictId = object.compressionDictId;
            if (object.fragmentId != null)
                message.fragmentId = object.fragmentId >>> 0;
            if (object.totalFragments != null)
                message.totalFragments = object.totalFragments >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a CompressedUTXOMeshMessage message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {lorachain.CompressedUTXOMeshMessage} message CompressedUTXOMeshMessage
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        CompressedUTXOMeshMessage.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults) {
                object.type = options.enums === String ? "UTXO_TRANSACTION" : 0;
                if (options.bytes === String)
                    object.payload = "";
                else {
                    object.payload = [];
                    if (options.bytes !== Array)
                        object.payload = $util.newBuffer(object.payload);
                }
                object.timestamp = 0;
                object.fromId = 0;
                object.toId = 0;
                if (options.bytes === String)
                    object.signature = "";
                else {
                    object.signature = [];
                    if (options.bytes !== Array)
                        object.signature = $util.newBuffer(object.signature);
                }
                object.compression = options.enums === String ? "NONE" : 0;
                object.originalSize = 0;
                if (options.bytes === String)
                    object.compressionDictId = "";
                else {
                    object.compressionDictId = [];
                    if (options.bytes !== Array)
                        object.compressionDictId = $util.newBuffer(object.compressionDictId);
                }
                object.fragmentId = 0;
                object.totalFragments = 0;
            }
            if (message.type != null && message.hasOwnProperty("type"))
                object.type = options.enums === String ? $root.lorachain.MessageType[message.type] === undefined ? message.type : $root.lorachain.MessageType[message.type] : message.type;
            if (message.payload != null && message.hasOwnProperty("payload"))
                object.payload = options.bytes === String ? $util.base64.encode(message.payload, 0, message.payload.length) : options.bytes === Array ? Array.prototype.slice.call(message.payload) : message.payload;
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                object.timestamp = message.timestamp;
            if (message.fromId != null && message.hasOwnProperty("fromId"))
                object.fromId = message.fromId;
            if (message.toId != null && message.hasOwnProperty("toId"))
                object.toId = message.toId;
            if (message.signature != null && message.hasOwnProperty("signature"))
                object.signature = options.bytes === String ? $util.base64.encode(message.signature, 0, message.signature.length) : options.bytes === Array ? Array.prototype.slice.call(message.signature) : message.signature;
            if (message.compression != null && message.hasOwnProperty("compression"))
                object.compression = options.enums === String ? $root.lorachain.CompressionType[message.compression] === undefined ? message.compression : $root.lorachain.CompressionType[message.compression] : message.compression;
            if (message.originalSize != null && message.hasOwnProperty("originalSize"))
                object.originalSize = message.originalSize;
            if (message.compressionDictId != null && message.hasOwnProperty("compressionDictId"))
                object.compressionDictId = options.bytes === String ? $util.base64.encode(message.compressionDictId, 0, message.compressionDictId.length) : options.bytes === Array ? Array.prototype.slice.call(message.compressionDictId) : message.compressionDictId;
            if (message.fragmentId != null && message.hasOwnProperty("fragmentId"))
                object.fragmentId = message.fragmentId;
            if (message.totalFragments != null && message.hasOwnProperty("totalFragments"))
                object.totalFragments = message.totalFragments;
            return object;
        };

        /**
         * Converts this CompressedUTXOMeshMessage to JSON.
         * @function toJSON
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        CompressedUTXOMeshMessage.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for CompressedUTXOMeshMessage
         * @function getTypeUrl
         * @memberof lorachain.CompressedUTXOMeshMessage
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CompressedUTXOMeshMessage.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.CompressedUTXOMeshMessage";
        };

        return CompressedUTXOMeshMessage;
    })();

    lorachain.CompressionMetadata = (function() {

        /**
         * Properties of a CompressionMetadata.
         * @memberof lorachain
         * @interface ICompressionMetadata
         * @property {number|null} [version] CompressionMetadata version
         * @property {lorachain.CompressionType|null} [algorithm] CompressionMetadata algorithm
         * @property {number|null} [originalSize] CompressionMetadata originalSize
         * @property {number|null} [compressedSize] CompressionMetadata compressedSize
         * @property {Uint8Array|null} [checksum] CompressionMetadata checksum
         * @property {number|Long|null} [timestamp] CompressionMetadata timestamp
         * @property {string|null} [dictionaryId] CompressionMetadata dictionaryId
         */

        /**
         * Constructs a new CompressionMetadata.
         * @memberof lorachain
         * @classdesc Represents a CompressionMetadata.
         * @implements ICompressionMetadata
         * @constructor
         * @param {lorachain.ICompressionMetadata=} [properties] Properties to set
         */
        function CompressionMetadata(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CompressionMetadata version.
         * @member {number} version
         * @memberof lorachain.CompressionMetadata
         * @instance
         */
        CompressionMetadata.prototype.version = 0;

        /**
         * CompressionMetadata algorithm.
         * @member {lorachain.CompressionType} algorithm
         * @memberof lorachain.CompressionMetadata
         * @instance
         */
        CompressionMetadata.prototype.algorithm = 0;

        /**
         * CompressionMetadata originalSize.
         * @member {number} originalSize
         * @memberof lorachain.CompressionMetadata
         * @instance
         */
        CompressionMetadata.prototype.originalSize = 0;

        /**
         * CompressionMetadata compressedSize.
         * @member {number} compressedSize
         * @memberof lorachain.CompressionMetadata
         * @instance
         */
        CompressionMetadata.prototype.compressedSize = 0;

        /**
         * CompressionMetadata checksum.
         * @member {Uint8Array} checksum
         * @memberof lorachain.CompressionMetadata
         * @instance
         */
        CompressionMetadata.prototype.checksum = $util.newBuffer([]);

        /**
         * CompressionMetadata timestamp.
         * @member {number|Long} timestamp
         * @memberof lorachain.CompressionMetadata
         * @instance
         */
        CompressionMetadata.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * CompressionMetadata dictionaryId.
         * @member {string} dictionaryId
         * @memberof lorachain.CompressionMetadata
         * @instance
         */
        CompressionMetadata.prototype.dictionaryId = "";

        /**
         * Creates a new CompressionMetadata instance using the specified properties.
         * @function create
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {lorachain.ICompressionMetadata=} [properties] Properties to set
         * @returns {lorachain.CompressionMetadata} CompressionMetadata instance
         */
        CompressionMetadata.create = function create(properties) {
            return new CompressionMetadata(properties);
        };

        /**
         * Encodes the specified CompressionMetadata message. Does not implicitly {@link lorachain.CompressionMetadata.verify|verify} messages.
         * @function encode
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {lorachain.ICompressionMetadata} message CompressionMetadata message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressionMetadata.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.version != null && Object.hasOwnProperty.call(message, "version"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.version);
            if (message.algorithm != null && Object.hasOwnProperty.call(message, "algorithm"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.algorithm);
            if (message.originalSize != null && Object.hasOwnProperty.call(message, "originalSize"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.originalSize);
            if (message.compressedSize != null && Object.hasOwnProperty.call(message, "compressedSize"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.compressedSize);
            if (message.checksum != null && Object.hasOwnProperty.call(message, "checksum"))
                writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.checksum);
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint64(message.timestamp);
            if (message.dictionaryId != null && Object.hasOwnProperty.call(message, "dictionaryId"))
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.dictionaryId);
            return writer;
        };

        /**
         * Encodes the specified CompressionMetadata message, length delimited. Does not implicitly {@link lorachain.CompressionMetadata.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {lorachain.ICompressionMetadata} message CompressionMetadata message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressionMetadata.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CompressionMetadata message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.CompressionMetadata} CompressionMetadata
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressionMetadata.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.CompressionMetadata();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.version = reader.uint32();
                        break;
                    }
                case 2: {
                        message.algorithm = reader.int32();
                        break;
                    }
                case 3: {
                        message.originalSize = reader.uint32();
                        break;
                    }
                case 4: {
                        message.compressedSize = reader.uint32();
                        break;
                    }
                case 5: {
                        message.checksum = reader.bytes();
                        break;
                    }
                case 6: {
                        message.timestamp = reader.uint64();
                        break;
                    }
                case 7: {
                        message.dictionaryId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a CompressionMetadata message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.CompressionMetadata} CompressionMetadata
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressionMetadata.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a CompressionMetadata message.
         * @function verify
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        CompressionMetadata.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.version != null && message.hasOwnProperty("version"))
                if (!$util.isInteger(message.version))
                    return "version: integer expected";
            if (message.algorithm != null && message.hasOwnProperty("algorithm"))
                switch (message.algorithm) {
                default:
                    return "algorithm: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                    break;
                }
            if (message.originalSize != null && message.hasOwnProperty("originalSize"))
                if (!$util.isInteger(message.originalSize))
                    return "originalSize: integer expected";
            if (message.compressedSize != null && message.hasOwnProperty("compressedSize"))
                if (!$util.isInteger(message.compressedSize))
                    return "compressedSize: integer expected";
            if (message.checksum != null && message.hasOwnProperty("checksum"))
                if (!(message.checksum && typeof message.checksum.length === "number" || $util.isString(message.checksum)))
                    return "checksum: buffer expected";
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (!$util.isInteger(message.timestamp) && !(message.timestamp && $util.isInteger(message.timestamp.low) && $util.isInteger(message.timestamp.high)))
                    return "timestamp: integer|Long expected";
            if (message.dictionaryId != null && message.hasOwnProperty("dictionaryId"))
                if (!$util.isString(message.dictionaryId))
                    return "dictionaryId: string expected";
            return null;
        };

        /**
         * Creates a CompressionMetadata message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.CompressionMetadata} CompressionMetadata
         */
        CompressionMetadata.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.CompressionMetadata)
                return object;
            let message = new $root.lorachain.CompressionMetadata();
            if (object.version != null)
                message.version = object.version >>> 0;
            switch (object.algorithm) {
            default:
                if (typeof object.algorithm === "number") {
                    message.algorithm = object.algorithm;
                    break;
                }
                break;
            case "NONE":
            case 0:
                message.algorithm = 0;
                break;
            case "PROTOBUF":
            case 1:
                message.algorithm = 1;
                break;
            case "GZIP":
            case 2:
                message.algorithm = 2;
                break;
            case "LZ4":
            case 3:
                message.algorithm = 3;
                break;
            case "UTXO_CUSTOM":
            case 4:
                message.algorithm = 4;
                break;
            case "UTXO_DICTIONARY":
            case 5:
                message.algorithm = 5;
                break;
            }
            if (object.originalSize != null)
                message.originalSize = object.originalSize >>> 0;
            if (object.compressedSize != null)
                message.compressedSize = object.compressedSize >>> 0;
            if (object.checksum != null)
                if (typeof object.checksum === "string")
                    $util.base64.decode(object.checksum, message.checksum = $util.newBuffer($util.base64.length(object.checksum)), 0);
                else if (object.checksum.length >= 0)
                    message.checksum = object.checksum;
            if (object.timestamp != null)
                if ($util.Long)
                    (message.timestamp = $util.Long.fromValue(object.timestamp)).unsigned = true;
                else if (typeof object.timestamp === "string")
                    message.timestamp = parseInt(object.timestamp, 10);
                else if (typeof object.timestamp === "number")
                    message.timestamp = object.timestamp;
                else if (typeof object.timestamp === "object")
                    message.timestamp = new $util.LongBits(object.timestamp.low >>> 0, object.timestamp.high >>> 0).toNumber(true);
            if (object.dictionaryId != null)
                message.dictionaryId = String(object.dictionaryId);
            return message;
        };

        /**
         * Creates a plain object from a CompressionMetadata message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {lorachain.CompressionMetadata} message CompressionMetadata
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        CompressionMetadata.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults) {
                object.version = 0;
                object.algorithm = options.enums === String ? "NONE" : 0;
                object.originalSize = 0;
                object.compressedSize = 0;
                if (options.bytes === String)
                    object.checksum = "";
                else {
                    object.checksum = [];
                    if (options.bytes !== Array)
                        object.checksum = $util.newBuffer(object.checksum);
                }
                if ($util.Long) {
                    let long = new $util.Long(0, 0, true);
                    object.timestamp = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.timestamp = options.longs === String ? "0" : 0;
                object.dictionaryId = "";
            }
            if (message.version != null && message.hasOwnProperty("version"))
                object.version = message.version;
            if (message.algorithm != null && message.hasOwnProperty("algorithm"))
                object.algorithm = options.enums === String ? $root.lorachain.CompressionType[message.algorithm] === undefined ? message.algorithm : $root.lorachain.CompressionType[message.algorithm] : message.algorithm;
            if (message.originalSize != null && message.hasOwnProperty("originalSize"))
                object.originalSize = message.originalSize;
            if (message.compressedSize != null && message.hasOwnProperty("compressedSize"))
                object.compressedSize = message.compressedSize;
            if (message.checksum != null && message.hasOwnProperty("checksum"))
                object.checksum = options.bytes === String ? $util.base64.encode(message.checksum, 0, message.checksum.length) : options.bytes === Array ? Array.prototype.slice.call(message.checksum) : message.checksum;
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (typeof message.timestamp === "number")
                    object.timestamp = options.longs === String ? String(message.timestamp) : message.timestamp;
                else
                    object.timestamp = options.longs === String ? $util.Long.prototype.toString.call(message.timestamp) : options.longs === Number ? new $util.LongBits(message.timestamp.low >>> 0, message.timestamp.high >>> 0).toNumber(true) : message.timestamp;
            if (message.dictionaryId != null && message.hasOwnProperty("dictionaryId"))
                object.dictionaryId = message.dictionaryId;
            return object;
        };

        /**
         * Converts this CompressionMetadata to JSON.
         * @function toJSON
         * @memberof lorachain.CompressionMetadata
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        CompressionMetadata.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for CompressionMetadata
         * @function getTypeUrl
         * @memberof lorachain.CompressionMetadata
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CompressionMetadata.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.CompressionMetadata";
        };

        return CompressionMetadata;
    })();

    lorachain.CompressedData = (function() {

        /**
         * Properties of a CompressedData.
         * @memberof lorachain
         * @interface ICompressedData
         * @property {Uint8Array|null} [data] CompressedData data
         * @property {lorachain.ICompressionMetadata|null} [metadata] CompressedData metadata
         */

        /**
         * Constructs a new CompressedData.
         * @memberof lorachain
         * @classdesc Represents a CompressedData.
         * @implements ICompressedData
         * @constructor
         * @param {lorachain.ICompressedData=} [properties] Properties to set
         */
        function CompressedData(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CompressedData data.
         * @member {Uint8Array} data
         * @memberof lorachain.CompressedData
         * @instance
         */
        CompressedData.prototype.data = $util.newBuffer([]);

        /**
         * CompressedData metadata.
         * @member {lorachain.ICompressionMetadata|null|undefined} metadata
         * @memberof lorachain.CompressedData
         * @instance
         */
        CompressedData.prototype.metadata = null;

        /**
         * Creates a new CompressedData instance using the specified properties.
         * @function create
         * @memberof lorachain.CompressedData
         * @static
         * @param {lorachain.ICompressedData=} [properties] Properties to set
         * @returns {lorachain.CompressedData} CompressedData instance
         */
        CompressedData.create = function create(properties) {
            return new CompressedData(properties);
        };

        /**
         * Encodes the specified CompressedData message. Does not implicitly {@link lorachain.CompressedData.verify|verify} messages.
         * @function encode
         * @memberof lorachain.CompressedData
         * @static
         * @param {lorachain.ICompressedData} message CompressedData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedData.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.data != null && Object.hasOwnProperty.call(message, "data"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.data);
            if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                $root.lorachain.CompressionMetadata.encode(message.metadata, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified CompressedData message, length delimited. Does not implicitly {@link lorachain.CompressedData.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.CompressedData
         * @static
         * @param {lorachain.ICompressedData} message CompressedData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressedData.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CompressedData message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.CompressedData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.CompressedData} CompressedData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedData.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.CompressedData();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.data = reader.bytes();
                        break;
                    }
                case 2: {
                        message.metadata = $root.lorachain.CompressionMetadata.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a CompressedData message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.CompressedData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.CompressedData} CompressedData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressedData.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a CompressedData message.
         * @function verify
         * @memberof lorachain.CompressedData
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        CompressedData.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.data != null && message.hasOwnProperty("data"))
                if (!(message.data && typeof message.data.length === "number" || $util.isString(message.data)))
                    return "data: buffer expected";
            if (message.metadata != null && message.hasOwnProperty("metadata")) {
                let error = $root.lorachain.CompressionMetadata.verify(message.metadata);
                if (error)
                    return "metadata." + error;
            }
            return null;
        };

        /**
         * Creates a CompressedData message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.CompressedData
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.CompressedData} CompressedData
         */
        CompressedData.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.CompressedData)
                return object;
            let message = new $root.lorachain.CompressedData();
            if (object.data != null)
                if (typeof object.data === "string")
                    $util.base64.decode(object.data, message.data = $util.newBuffer($util.base64.length(object.data)), 0);
                else if (object.data.length >= 0)
                    message.data = object.data;
            if (object.metadata != null) {
                if (typeof object.metadata !== "object")
                    throw TypeError(".lorachain.CompressedData.metadata: object expected");
                message.metadata = $root.lorachain.CompressionMetadata.fromObject(object.metadata);
            }
            return message;
        };

        /**
         * Creates a plain object from a CompressedData message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.CompressedData
         * @static
         * @param {lorachain.CompressedData} message CompressedData
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        CompressedData.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults) {
                if (options.bytes === String)
                    object.data = "";
                else {
                    object.data = [];
                    if (options.bytes !== Array)
                        object.data = $util.newBuffer(object.data);
                }
                object.metadata = null;
            }
            if (message.data != null && message.hasOwnProperty("data"))
                object.data = options.bytes === String ? $util.base64.encode(message.data, 0, message.data.length) : options.bytes === Array ? Array.prototype.slice.call(message.data) : message.data;
            if (message.metadata != null && message.hasOwnProperty("metadata"))
                object.metadata = $root.lorachain.CompressionMetadata.toObject(message.metadata, options);
            return object;
        };

        /**
         * Converts this CompressedData to JSON.
         * @function toJSON
         * @memberof lorachain.CompressedData
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        CompressedData.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for CompressedData
         * @function getTypeUrl
         * @memberof lorachain.CompressedData
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CompressedData.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.CompressedData";
        };

        return CompressedData;
    })();

    lorachain.DictionaryEntry = (function() {

        /**
         * Properties of a DictionaryEntry.
         * @memberof lorachain
         * @interface IDictionaryEntry
         * @property {string|null} [pattern] DictionaryEntry pattern
         * @property {number|null} [frequency] DictionaryEntry frequency
         * @property {number|null} [id] DictionaryEntry id
         */

        /**
         * Constructs a new DictionaryEntry.
         * @memberof lorachain
         * @classdesc Represents a DictionaryEntry.
         * @implements IDictionaryEntry
         * @constructor
         * @param {lorachain.IDictionaryEntry=} [properties] Properties to set
         */
        function DictionaryEntry(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * DictionaryEntry pattern.
         * @member {string} pattern
         * @memberof lorachain.DictionaryEntry
         * @instance
         */
        DictionaryEntry.prototype.pattern = "";

        /**
         * DictionaryEntry frequency.
         * @member {number} frequency
         * @memberof lorachain.DictionaryEntry
         * @instance
         */
        DictionaryEntry.prototype.frequency = 0;

        /**
         * DictionaryEntry id.
         * @member {number} id
         * @memberof lorachain.DictionaryEntry
         * @instance
         */
        DictionaryEntry.prototype.id = 0;

        /**
         * Creates a new DictionaryEntry instance using the specified properties.
         * @function create
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {lorachain.IDictionaryEntry=} [properties] Properties to set
         * @returns {lorachain.DictionaryEntry} DictionaryEntry instance
         */
        DictionaryEntry.create = function create(properties) {
            return new DictionaryEntry(properties);
        };

        /**
         * Encodes the specified DictionaryEntry message. Does not implicitly {@link lorachain.DictionaryEntry.verify|verify} messages.
         * @function encode
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {lorachain.IDictionaryEntry} message DictionaryEntry message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DictionaryEntry.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.pattern != null && Object.hasOwnProperty.call(message, "pattern"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.pattern);
            if (message.frequency != null && Object.hasOwnProperty.call(message, "frequency"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.frequency);
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.id);
            return writer;
        };

        /**
         * Encodes the specified DictionaryEntry message, length delimited. Does not implicitly {@link lorachain.DictionaryEntry.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {lorachain.IDictionaryEntry} message DictionaryEntry message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DictionaryEntry.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a DictionaryEntry message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.DictionaryEntry} DictionaryEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DictionaryEntry.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.DictionaryEntry();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.pattern = reader.string();
                        break;
                    }
                case 2: {
                        message.frequency = reader.uint32();
                        break;
                    }
                case 3: {
                        message.id = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a DictionaryEntry message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.DictionaryEntry} DictionaryEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DictionaryEntry.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a DictionaryEntry message.
         * @function verify
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        DictionaryEntry.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.pattern != null && message.hasOwnProperty("pattern"))
                if (!$util.isString(message.pattern))
                    return "pattern: string expected";
            if (message.frequency != null && message.hasOwnProperty("frequency"))
                if (!$util.isInteger(message.frequency))
                    return "frequency: integer expected";
            if (message.id != null && message.hasOwnProperty("id"))
                if (!$util.isInteger(message.id))
                    return "id: integer expected";
            return null;
        };

        /**
         * Creates a DictionaryEntry message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.DictionaryEntry} DictionaryEntry
         */
        DictionaryEntry.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.DictionaryEntry)
                return object;
            let message = new $root.lorachain.DictionaryEntry();
            if (object.pattern != null)
                message.pattern = String(object.pattern);
            if (object.frequency != null)
                message.frequency = object.frequency >>> 0;
            if (object.id != null)
                message.id = object.id >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a DictionaryEntry message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {lorachain.DictionaryEntry} message DictionaryEntry
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        DictionaryEntry.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults) {
                object.pattern = "";
                object.frequency = 0;
                object.id = 0;
            }
            if (message.pattern != null && message.hasOwnProperty("pattern"))
                object.pattern = message.pattern;
            if (message.frequency != null && message.hasOwnProperty("frequency"))
                object.frequency = message.frequency;
            if (message.id != null && message.hasOwnProperty("id"))
                object.id = message.id;
            return object;
        };

        /**
         * Converts this DictionaryEntry to JSON.
         * @function toJSON
         * @memberof lorachain.DictionaryEntry
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        DictionaryEntry.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for DictionaryEntry
         * @function getTypeUrl
         * @memberof lorachain.DictionaryEntry
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        DictionaryEntry.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.DictionaryEntry";
        };

        return DictionaryEntry;
    })();

    lorachain.CompressionDictionary = (function() {

        /**
         * Properties of a CompressionDictionary.
         * @memberof lorachain
         * @interface ICompressionDictionary
         * @property {string|null} [id] CompressionDictionary id
         * @property {number|null} [version] CompressionDictionary version
         * @property {Array.<lorachain.IDictionaryEntry>|null} [entries] CompressionDictionary entries
         * @property {number|Long|null} [createdAt] CompressionDictionary createdAt
         * @property {number|Long|null} [lastUpdated] CompressionDictionary lastUpdated
         * @property {number|null} [compressionRatio] CompressionDictionary compressionRatio
         * @property {Uint8Array|null} [signature] CompressionDictionary signature
         */

        /**
         * Constructs a new CompressionDictionary.
         * @memberof lorachain
         * @classdesc Represents a CompressionDictionary.
         * @implements ICompressionDictionary
         * @constructor
         * @param {lorachain.ICompressionDictionary=} [properties] Properties to set
         */
        function CompressionDictionary(properties) {
            this.entries = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CompressionDictionary id.
         * @member {string} id
         * @memberof lorachain.CompressionDictionary
         * @instance
         */
        CompressionDictionary.prototype.id = "";

        /**
         * CompressionDictionary version.
         * @member {number} version
         * @memberof lorachain.CompressionDictionary
         * @instance
         */
        CompressionDictionary.prototype.version = 0;

        /**
         * CompressionDictionary entries.
         * @member {Array.<lorachain.IDictionaryEntry>} entries
         * @memberof lorachain.CompressionDictionary
         * @instance
         */
        CompressionDictionary.prototype.entries = $util.emptyArray;

        /**
         * CompressionDictionary createdAt.
         * @member {number|Long} createdAt
         * @memberof lorachain.CompressionDictionary
         * @instance
         */
        CompressionDictionary.prototype.createdAt = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * CompressionDictionary lastUpdated.
         * @member {number|Long} lastUpdated
         * @memberof lorachain.CompressionDictionary
         * @instance
         */
        CompressionDictionary.prototype.lastUpdated = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * CompressionDictionary compressionRatio.
         * @member {number} compressionRatio
         * @memberof lorachain.CompressionDictionary
         * @instance
         */
        CompressionDictionary.prototype.compressionRatio = 0;

        /**
         * CompressionDictionary signature.
         * @member {Uint8Array} signature
         * @memberof lorachain.CompressionDictionary
         * @instance
         */
        CompressionDictionary.prototype.signature = $util.newBuffer([]);

        /**
         * Creates a new CompressionDictionary instance using the specified properties.
         * @function create
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {lorachain.ICompressionDictionary=} [properties] Properties to set
         * @returns {lorachain.CompressionDictionary} CompressionDictionary instance
         */
        CompressionDictionary.create = function create(properties) {
            return new CompressionDictionary(properties);
        };

        /**
         * Encodes the specified CompressionDictionary message. Does not implicitly {@link lorachain.CompressionDictionary.verify|verify} messages.
         * @function encode
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {lorachain.ICompressionDictionary} message CompressionDictionary message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressionDictionary.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.version != null && Object.hasOwnProperty.call(message, "version"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.version);
            if (message.entries != null && message.entries.length)
                for (let i = 0; i < message.entries.length; ++i)
                    $root.lorachain.DictionaryEntry.encode(message.entries[i], writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.createdAt != null && Object.hasOwnProperty.call(message, "createdAt"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint64(message.createdAt);
            if (message.lastUpdated != null && Object.hasOwnProperty.call(message, "lastUpdated"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint64(message.lastUpdated);
            if (message.compressionRatio != null && Object.hasOwnProperty.call(message, "compressionRatio"))
                writer.uint32(/* id 6, wireType 1 =*/49).double(message.compressionRatio);
            if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.signature);
            return writer;
        };

        /**
         * Encodes the specified CompressionDictionary message, length delimited. Does not implicitly {@link lorachain.CompressionDictionary.verify|verify} messages.
         * @function encodeDelimited
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {lorachain.ICompressionDictionary} message CompressionDictionary message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CompressionDictionary.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CompressionDictionary message from the specified reader or buffer.
         * @function decode
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {lorachain.CompressionDictionary} CompressionDictionary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressionDictionary.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.lorachain.CompressionDictionary();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.id = reader.string();
                        break;
                    }
                case 2: {
                        message.version = reader.uint32();
                        break;
                    }
                case 3: {
                        if (!(message.entries && message.entries.length))
                            message.entries = [];
                        message.entries.push($root.lorachain.DictionaryEntry.decode(reader, reader.uint32()));
                        break;
                    }
                case 4: {
                        message.createdAt = reader.uint64();
                        break;
                    }
                case 5: {
                        message.lastUpdated = reader.uint64();
                        break;
                    }
                case 6: {
                        message.compressionRatio = reader.double();
                        break;
                    }
                case 7: {
                        message.signature = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a CompressionDictionary message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {lorachain.CompressionDictionary} CompressionDictionary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CompressionDictionary.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a CompressionDictionary message.
         * @function verify
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        CompressionDictionary.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.id != null && message.hasOwnProperty("id"))
                if (!$util.isString(message.id))
                    return "id: string expected";
            if (message.version != null && message.hasOwnProperty("version"))
                if (!$util.isInteger(message.version))
                    return "version: integer expected";
            if (message.entries != null && message.hasOwnProperty("entries")) {
                if (!Array.isArray(message.entries))
                    return "entries: array expected";
                for (let i = 0; i < message.entries.length; ++i) {
                    let error = $root.lorachain.DictionaryEntry.verify(message.entries[i]);
                    if (error)
                        return "entries." + error;
                }
            }
            if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                if (!$util.isInteger(message.createdAt) && !(message.createdAt && $util.isInteger(message.createdAt.low) && $util.isInteger(message.createdAt.high)))
                    return "createdAt: integer|Long expected";
            if (message.lastUpdated != null && message.hasOwnProperty("lastUpdated"))
                if (!$util.isInteger(message.lastUpdated) && !(message.lastUpdated && $util.isInteger(message.lastUpdated.low) && $util.isInteger(message.lastUpdated.high)))
                    return "lastUpdated: integer|Long expected";
            if (message.compressionRatio != null && message.hasOwnProperty("compressionRatio"))
                if (typeof message.compressionRatio !== "number")
                    return "compressionRatio: number expected";
            if (message.signature != null && message.hasOwnProperty("signature"))
                if (!(message.signature && typeof message.signature.length === "number" || $util.isString(message.signature)))
                    return "signature: buffer expected";
            return null;
        };

        /**
         * Creates a CompressionDictionary message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {lorachain.CompressionDictionary} CompressionDictionary
         */
        CompressionDictionary.fromObject = function fromObject(object) {
            if (object instanceof $root.lorachain.CompressionDictionary)
                return object;
            let message = new $root.lorachain.CompressionDictionary();
            if (object.id != null)
                message.id = String(object.id);
            if (object.version != null)
                message.version = object.version >>> 0;
            if (object.entries) {
                if (!Array.isArray(object.entries))
                    throw TypeError(".lorachain.CompressionDictionary.entries: array expected");
                message.entries = [];
                for (let i = 0; i < object.entries.length; ++i) {
                    if (typeof object.entries[i] !== "object")
                        throw TypeError(".lorachain.CompressionDictionary.entries: object expected");
                    message.entries[i] = $root.lorachain.DictionaryEntry.fromObject(object.entries[i]);
                }
            }
            if (object.createdAt != null)
                if ($util.Long)
                    (message.createdAt = $util.Long.fromValue(object.createdAt)).unsigned = true;
                else if (typeof object.createdAt === "string")
                    message.createdAt = parseInt(object.createdAt, 10);
                else if (typeof object.createdAt === "number")
                    message.createdAt = object.createdAt;
                else if (typeof object.createdAt === "object")
                    message.createdAt = new $util.LongBits(object.createdAt.low >>> 0, object.createdAt.high >>> 0).toNumber(true);
            if (object.lastUpdated != null)
                if ($util.Long)
                    (message.lastUpdated = $util.Long.fromValue(object.lastUpdated)).unsigned = true;
                else if (typeof object.lastUpdated === "string")
                    message.lastUpdated = parseInt(object.lastUpdated, 10);
                else if (typeof object.lastUpdated === "number")
                    message.lastUpdated = object.lastUpdated;
                else if (typeof object.lastUpdated === "object")
                    message.lastUpdated = new $util.LongBits(object.lastUpdated.low >>> 0, object.lastUpdated.high >>> 0).toNumber(true);
            if (object.compressionRatio != null)
                message.compressionRatio = Number(object.compressionRatio);
            if (object.signature != null)
                if (typeof object.signature === "string")
                    $util.base64.decode(object.signature, message.signature = $util.newBuffer($util.base64.length(object.signature)), 0);
                else if (object.signature.length >= 0)
                    message.signature = object.signature;
            return message;
        };

        /**
         * Creates a plain object from a CompressionDictionary message. Also converts values to other types if specified.
         * @function toObject
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {lorachain.CompressionDictionary} message CompressionDictionary
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        CompressionDictionary.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.arrays || options.defaults)
                object.entries = [];
            if (options.defaults) {
                object.id = "";
                object.version = 0;
                if ($util.Long) {
                    let long = new $util.Long(0, 0, true);
                    object.createdAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.createdAt = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    let long = new $util.Long(0, 0, true);
                    object.lastUpdated = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.lastUpdated = options.longs === String ? "0" : 0;
                object.compressionRatio = 0;
                if (options.bytes === String)
                    object.signature = "";
                else {
                    object.signature = [];
                    if (options.bytes !== Array)
                        object.signature = $util.newBuffer(object.signature);
                }
            }
            if (message.id != null && message.hasOwnProperty("id"))
                object.id = message.id;
            if (message.version != null && message.hasOwnProperty("version"))
                object.version = message.version;
            if (message.entries && message.entries.length) {
                object.entries = [];
                for (let j = 0; j < message.entries.length; ++j)
                    object.entries[j] = $root.lorachain.DictionaryEntry.toObject(message.entries[j], options);
            }
            if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                if (typeof message.createdAt === "number")
                    object.createdAt = options.longs === String ? String(message.createdAt) : message.createdAt;
                else
                    object.createdAt = options.longs === String ? $util.Long.prototype.toString.call(message.createdAt) : options.longs === Number ? new $util.LongBits(message.createdAt.low >>> 0, message.createdAt.high >>> 0).toNumber(true) : message.createdAt;
            if (message.lastUpdated != null && message.hasOwnProperty("lastUpdated"))
                if (typeof message.lastUpdated === "number")
                    object.lastUpdated = options.longs === String ? String(message.lastUpdated) : message.lastUpdated;
                else
                    object.lastUpdated = options.longs === String ? $util.Long.prototype.toString.call(message.lastUpdated) : options.longs === Number ? new $util.LongBits(message.lastUpdated.low >>> 0, message.lastUpdated.high >>> 0).toNumber(true) : message.lastUpdated;
            if (message.compressionRatio != null && message.hasOwnProperty("compressionRatio"))
                object.compressionRatio = options.json && !isFinite(message.compressionRatio) ? String(message.compressionRatio) : message.compressionRatio;
            if (message.signature != null && message.hasOwnProperty("signature"))
                object.signature = options.bytes === String ? $util.base64.encode(message.signature, 0, message.signature.length) : options.bytes === Array ? Array.prototype.slice.call(message.signature) : message.signature;
            return object;
        };

        /**
         * Converts this CompressionDictionary to JSON.
         * @function toJSON
         * @memberof lorachain.CompressionDictionary
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        CompressionDictionary.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for CompressionDictionary
         * @function getTypeUrl
         * @memberof lorachain.CompressionDictionary
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CompressionDictionary.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/lorachain.CompressionDictionary";
        };

        return CompressionDictionary;
    })();

    return lorachain;
})();

export { $root as default };
