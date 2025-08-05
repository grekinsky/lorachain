import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace lorachain. */
export namespace lorachain {

    /** Properties of a UTXOInput. */
    interface IUTXOInput {

        /** UTXOInput txHash */
        txHash?: (Uint8Array|null);

        /** UTXOInput outputIndex */
        outputIndex?: (number|null);

        /** UTXOInput scriptSig */
        scriptSig?: (Uint8Array|null);
    }

    /** Represents a UTXOInput. */
    class UTXOInput implements IUTXOInput {

        /**
         * Constructs a new UTXOInput.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.IUTXOInput);

        /** UTXOInput txHash. */
        public txHash: Uint8Array;

        /** UTXOInput outputIndex. */
        public outputIndex: number;

        /** UTXOInput scriptSig. */
        public scriptSig: Uint8Array;

        /**
         * Creates a new UTXOInput instance using the specified properties.
         * @param [properties] Properties to set
         * @returns UTXOInput instance
         */
        public static create(properties?: lorachain.IUTXOInput): lorachain.UTXOInput;

        /**
         * Encodes the specified UTXOInput message. Does not implicitly {@link lorachain.UTXOInput.verify|verify} messages.
         * @param message UTXOInput message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.IUTXOInput, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified UTXOInput message, length delimited. Does not implicitly {@link lorachain.UTXOInput.verify|verify} messages.
         * @param message UTXOInput message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.IUTXOInput, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a UTXOInput message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns UTXOInput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.UTXOInput;

        /**
         * Decodes a UTXOInput message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns UTXOInput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.UTXOInput;

        /**
         * Verifies a UTXOInput message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a UTXOInput message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns UTXOInput
         */
        public static fromObject(object: { [k: string]: any }): lorachain.UTXOInput;

        /**
         * Creates a plain object from a UTXOInput message. Also converts values to other types if specified.
         * @param message UTXOInput
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.UTXOInput, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this UTXOInput to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for UTXOInput
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a UTXOOutput. */
    interface IUTXOOutput {

        /** UTXOOutput amount */
        amount?: (number|Long|null);

        /** UTXOOutput addressId */
        addressId?: (number|null);

        /** UTXOOutput scriptPubkey */
        scriptPubkey?: (Uint8Array|null);
    }

    /** Represents a UTXOOutput. */
    class UTXOOutput implements IUTXOOutput {

        /**
         * Constructs a new UTXOOutput.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.IUTXOOutput);

        /** UTXOOutput amount. */
        public amount: (number|Long);

        /** UTXOOutput addressId. */
        public addressId: number;

        /** UTXOOutput scriptPubkey. */
        public scriptPubkey: Uint8Array;

        /**
         * Creates a new UTXOOutput instance using the specified properties.
         * @param [properties] Properties to set
         * @returns UTXOOutput instance
         */
        public static create(properties?: lorachain.IUTXOOutput): lorachain.UTXOOutput;

        /**
         * Encodes the specified UTXOOutput message. Does not implicitly {@link lorachain.UTXOOutput.verify|verify} messages.
         * @param message UTXOOutput message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.IUTXOOutput, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified UTXOOutput message, length delimited. Does not implicitly {@link lorachain.UTXOOutput.verify|verify} messages.
         * @param message UTXOOutput message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.IUTXOOutput, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a UTXOOutput message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns UTXOOutput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.UTXOOutput;

        /**
         * Decodes a UTXOOutput message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns UTXOOutput
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.UTXOOutput;

        /**
         * Verifies a UTXOOutput message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a UTXOOutput message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns UTXOOutput
         */
        public static fromObject(object: { [k: string]: any }): lorachain.UTXOOutput;

        /**
         * Creates a plain object from a UTXOOutput message. Also converts values to other types if specified.
         * @param message UTXOOutput
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.UTXOOutput, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this UTXOOutput to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for UTXOOutput
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a CompressedUTXOTransaction. */
    interface ICompressedUTXOTransaction {

        /** CompressedUTXOTransaction id */
        id?: (Uint8Array|null);

        /** CompressedUTXOTransaction inputs */
        inputs?: (lorachain.IUTXOInput[]|null);

        /** CompressedUTXOTransaction outputs */
        outputs?: (lorachain.IUTXOOutput[]|null);

        /** CompressedUTXOTransaction fee */
        fee?: (number|null);

        /** CompressedUTXOTransaction timestamp */
        timestamp?: (number|null);

        /** CompressedUTXOTransaction signature */
        signature?: (Uint8Array|null);

        /** CompressedUTXOTransaction nonce */
        nonce?: (number|null);
    }

    /** Represents a CompressedUTXOTransaction. */
    class CompressedUTXOTransaction implements ICompressedUTXOTransaction {

        /**
         * Constructs a new CompressedUTXOTransaction.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.ICompressedUTXOTransaction);

        /** CompressedUTXOTransaction id. */
        public id: Uint8Array;

        /** CompressedUTXOTransaction inputs. */
        public inputs: lorachain.IUTXOInput[];

        /** CompressedUTXOTransaction outputs. */
        public outputs: lorachain.IUTXOOutput[];

        /** CompressedUTXOTransaction fee. */
        public fee: number;

        /** CompressedUTXOTransaction timestamp. */
        public timestamp: number;

        /** CompressedUTXOTransaction signature. */
        public signature: Uint8Array;

        /** CompressedUTXOTransaction nonce. */
        public nonce: number;

        /**
         * Creates a new CompressedUTXOTransaction instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CompressedUTXOTransaction instance
         */
        public static create(properties?: lorachain.ICompressedUTXOTransaction): lorachain.CompressedUTXOTransaction;

        /**
         * Encodes the specified CompressedUTXOTransaction message. Does not implicitly {@link lorachain.CompressedUTXOTransaction.verify|verify} messages.
         * @param message CompressedUTXOTransaction message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.ICompressedUTXOTransaction, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CompressedUTXOTransaction message, length delimited. Does not implicitly {@link lorachain.CompressedUTXOTransaction.verify|verify} messages.
         * @param message CompressedUTXOTransaction message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.ICompressedUTXOTransaction, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CompressedUTXOTransaction message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CompressedUTXOTransaction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.CompressedUTXOTransaction;

        /**
         * Decodes a CompressedUTXOTransaction message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CompressedUTXOTransaction
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.CompressedUTXOTransaction;

        /**
         * Verifies a CompressedUTXOTransaction message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CompressedUTXOTransaction message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CompressedUTXOTransaction
         */
        public static fromObject(object: { [k: string]: any }): lorachain.CompressedUTXOTransaction;

        /**
         * Creates a plain object from a CompressedUTXOTransaction message. Also converts values to other types if specified.
         * @param message CompressedUTXOTransaction
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.CompressedUTXOTransaction, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CompressedUTXOTransaction to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for CompressedUTXOTransaction
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a CompressedUTXOBlock. */
    interface ICompressedUTXOBlock {

        /** CompressedUTXOBlock index */
        index?: (number|null);

        /** CompressedUTXOBlock timestamp */
        timestamp?: (number|null);

        /** CompressedUTXOBlock transactions */
        transactions?: (lorachain.ICompressedUTXOTransaction[]|null);

        /** CompressedUTXOBlock previousHash */
        previousHash?: (Uint8Array|null);

        /** CompressedUTXOBlock hash */
        hash?: (Uint8Array|null);

        /** CompressedUTXOBlock nonce */
        nonce?: (number|null);

        /** CompressedUTXOBlock merkleRoot */
        merkleRoot?: (Uint8Array|null);

        /** CompressedUTXOBlock difficulty */
        difficulty?: (number|null);
    }

    /** Represents a CompressedUTXOBlock. */
    class CompressedUTXOBlock implements ICompressedUTXOBlock {

        /**
         * Constructs a new CompressedUTXOBlock.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.ICompressedUTXOBlock);

        /** CompressedUTXOBlock index. */
        public index: number;

        /** CompressedUTXOBlock timestamp. */
        public timestamp: number;

        /** CompressedUTXOBlock transactions. */
        public transactions: lorachain.ICompressedUTXOTransaction[];

        /** CompressedUTXOBlock previousHash. */
        public previousHash: Uint8Array;

        /** CompressedUTXOBlock hash. */
        public hash: Uint8Array;

        /** CompressedUTXOBlock nonce. */
        public nonce: number;

        /** CompressedUTXOBlock merkleRoot. */
        public merkleRoot: Uint8Array;

        /** CompressedUTXOBlock difficulty. */
        public difficulty: number;

        /**
         * Creates a new CompressedUTXOBlock instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CompressedUTXOBlock instance
         */
        public static create(properties?: lorachain.ICompressedUTXOBlock): lorachain.CompressedUTXOBlock;

        /**
         * Encodes the specified CompressedUTXOBlock message. Does not implicitly {@link lorachain.CompressedUTXOBlock.verify|verify} messages.
         * @param message CompressedUTXOBlock message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.ICompressedUTXOBlock, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CompressedUTXOBlock message, length delimited. Does not implicitly {@link lorachain.CompressedUTXOBlock.verify|verify} messages.
         * @param message CompressedUTXOBlock message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.ICompressedUTXOBlock, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CompressedUTXOBlock message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CompressedUTXOBlock
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.CompressedUTXOBlock;

        /**
         * Decodes a CompressedUTXOBlock message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CompressedUTXOBlock
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.CompressedUTXOBlock;

        /**
         * Verifies a CompressedUTXOBlock message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CompressedUTXOBlock message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CompressedUTXOBlock
         */
        public static fromObject(object: { [k: string]: any }): lorachain.CompressedUTXOBlock;

        /**
         * Creates a plain object from a CompressedUTXOBlock message. Also converts values to other types if specified.
         * @param message CompressedUTXOBlock
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.CompressedUTXOBlock, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CompressedUTXOBlock to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for CompressedUTXOBlock
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** CompressionType enum. */
    enum CompressionType {
        NONE = 0,
        PROTOBUF = 1,
        GZIP = 2,
        LZ4 = 3,
        UTXO_CUSTOM = 4,
        UTXO_DICTIONARY = 5
    }

    /** MessageType enum. */
    enum MessageType {
        UTXO_TRANSACTION = 0,
        UTXO_BLOCK = 1,
        BLOCKCHAIN_SYNC = 2,
        NODE_DISCOVERY = 3,
        ROUTE_REQUEST = 4,
        ROUTE_REPLY = 5,
        ROUTE_ERROR = 6,
        HELLO = 7,
        FRAGMENT = 8,
        FRAGMENT_ACK = 9
    }

    /** Properties of a CompressedUTXOMeshMessage. */
    interface ICompressedUTXOMeshMessage {

        /** CompressedUTXOMeshMessage type */
        type?: (lorachain.MessageType|null);

        /** CompressedUTXOMeshMessage payload */
        payload?: (Uint8Array|null);

        /** CompressedUTXOMeshMessage timestamp */
        timestamp?: (number|null);

        /** CompressedUTXOMeshMessage fromId */
        fromId?: (number|null);

        /** CompressedUTXOMeshMessage toId */
        toId?: (number|null);

        /** CompressedUTXOMeshMessage signature */
        signature?: (Uint8Array|null);

        /** CompressedUTXOMeshMessage compression */
        compression?: (lorachain.CompressionType|null);

        /** CompressedUTXOMeshMessage originalSize */
        originalSize?: (number|null);

        /** CompressedUTXOMeshMessage compressionDictId */
        compressionDictId?: (Uint8Array|null);

        /** CompressedUTXOMeshMessage fragmentId */
        fragmentId?: (number|null);

        /** CompressedUTXOMeshMessage totalFragments */
        totalFragments?: (number|null);
    }

    /** Represents a CompressedUTXOMeshMessage. */
    class CompressedUTXOMeshMessage implements ICompressedUTXOMeshMessage {

        /**
         * Constructs a new CompressedUTXOMeshMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.ICompressedUTXOMeshMessage);

        /** CompressedUTXOMeshMessage type. */
        public type: lorachain.MessageType;

        /** CompressedUTXOMeshMessage payload. */
        public payload: Uint8Array;

        /** CompressedUTXOMeshMessage timestamp. */
        public timestamp: number;

        /** CompressedUTXOMeshMessage fromId. */
        public fromId: number;

        /** CompressedUTXOMeshMessage toId. */
        public toId: number;

        /** CompressedUTXOMeshMessage signature. */
        public signature: Uint8Array;

        /** CompressedUTXOMeshMessage compression. */
        public compression: lorachain.CompressionType;

        /** CompressedUTXOMeshMessage originalSize. */
        public originalSize: number;

        /** CompressedUTXOMeshMessage compressionDictId. */
        public compressionDictId: Uint8Array;

        /** CompressedUTXOMeshMessage fragmentId. */
        public fragmentId: number;

        /** CompressedUTXOMeshMessage totalFragments. */
        public totalFragments: number;

        /**
         * Creates a new CompressedUTXOMeshMessage instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CompressedUTXOMeshMessage instance
         */
        public static create(properties?: lorachain.ICompressedUTXOMeshMessage): lorachain.CompressedUTXOMeshMessage;

        /**
         * Encodes the specified CompressedUTXOMeshMessage message. Does not implicitly {@link lorachain.CompressedUTXOMeshMessage.verify|verify} messages.
         * @param message CompressedUTXOMeshMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.ICompressedUTXOMeshMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CompressedUTXOMeshMessage message, length delimited. Does not implicitly {@link lorachain.CompressedUTXOMeshMessage.verify|verify} messages.
         * @param message CompressedUTXOMeshMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.ICompressedUTXOMeshMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CompressedUTXOMeshMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CompressedUTXOMeshMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.CompressedUTXOMeshMessage;

        /**
         * Decodes a CompressedUTXOMeshMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CompressedUTXOMeshMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.CompressedUTXOMeshMessage;

        /**
         * Verifies a CompressedUTXOMeshMessage message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CompressedUTXOMeshMessage message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CompressedUTXOMeshMessage
         */
        public static fromObject(object: { [k: string]: any }): lorachain.CompressedUTXOMeshMessage;

        /**
         * Creates a plain object from a CompressedUTXOMeshMessage message. Also converts values to other types if specified.
         * @param message CompressedUTXOMeshMessage
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.CompressedUTXOMeshMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CompressedUTXOMeshMessage to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for CompressedUTXOMeshMessage
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a CompressionMetadata. */
    interface ICompressionMetadata {

        /** CompressionMetadata version */
        version?: (number|null);

        /** CompressionMetadata algorithm */
        algorithm?: (lorachain.CompressionType|null);

        /** CompressionMetadata originalSize */
        originalSize?: (number|null);

        /** CompressionMetadata compressedSize */
        compressedSize?: (number|null);

        /** CompressionMetadata checksum */
        checksum?: (Uint8Array|null);

        /** CompressionMetadata timestamp */
        timestamp?: (number|Long|null);

        /** CompressionMetadata dictionaryId */
        dictionaryId?: (string|null);
    }

    /** Represents a CompressionMetadata. */
    class CompressionMetadata implements ICompressionMetadata {

        /**
         * Constructs a new CompressionMetadata.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.ICompressionMetadata);

        /** CompressionMetadata version. */
        public version: number;

        /** CompressionMetadata algorithm. */
        public algorithm: lorachain.CompressionType;

        /** CompressionMetadata originalSize. */
        public originalSize: number;

        /** CompressionMetadata compressedSize. */
        public compressedSize: number;

        /** CompressionMetadata checksum. */
        public checksum: Uint8Array;

        /** CompressionMetadata timestamp. */
        public timestamp: (number|Long);

        /** CompressionMetadata dictionaryId. */
        public dictionaryId: string;

        /**
         * Creates a new CompressionMetadata instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CompressionMetadata instance
         */
        public static create(properties?: lorachain.ICompressionMetadata): lorachain.CompressionMetadata;

        /**
         * Encodes the specified CompressionMetadata message. Does not implicitly {@link lorachain.CompressionMetadata.verify|verify} messages.
         * @param message CompressionMetadata message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.ICompressionMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CompressionMetadata message, length delimited. Does not implicitly {@link lorachain.CompressionMetadata.verify|verify} messages.
         * @param message CompressionMetadata message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.ICompressionMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CompressionMetadata message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CompressionMetadata
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.CompressionMetadata;

        /**
         * Decodes a CompressionMetadata message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CompressionMetadata
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.CompressionMetadata;

        /**
         * Verifies a CompressionMetadata message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CompressionMetadata message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CompressionMetadata
         */
        public static fromObject(object: { [k: string]: any }): lorachain.CompressionMetadata;

        /**
         * Creates a plain object from a CompressionMetadata message. Also converts values to other types if specified.
         * @param message CompressionMetadata
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.CompressionMetadata, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CompressionMetadata to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for CompressionMetadata
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a CompressedData. */
    interface ICompressedData {

        /** CompressedData data */
        data?: (Uint8Array|null);

        /** CompressedData metadata */
        metadata?: (lorachain.ICompressionMetadata|null);
    }

    /** Represents a CompressedData. */
    class CompressedData implements ICompressedData {

        /**
         * Constructs a new CompressedData.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.ICompressedData);

        /** CompressedData data. */
        public data: Uint8Array;

        /** CompressedData metadata. */
        public metadata?: (lorachain.ICompressionMetadata|null);

        /**
         * Creates a new CompressedData instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CompressedData instance
         */
        public static create(properties?: lorachain.ICompressedData): lorachain.CompressedData;

        /**
         * Encodes the specified CompressedData message. Does not implicitly {@link lorachain.CompressedData.verify|verify} messages.
         * @param message CompressedData message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.ICompressedData, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CompressedData message, length delimited. Does not implicitly {@link lorachain.CompressedData.verify|verify} messages.
         * @param message CompressedData message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.ICompressedData, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CompressedData message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CompressedData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.CompressedData;

        /**
         * Decodes a CompressedData message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CompressedData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.CompressedData;

        /**
         * Verifies a CompressedData message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CompressedData message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CompressedData
         */
        public static fromObject(object: { [k: string]: any }): lorachain.CompressedData;

        /**
         * Creates a plain object from a CompressedData message. Also converts values to other types if specified.
         * @param message CompressedData
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.CompressedData, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CompressedData to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for CompressedData
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a DictionaryEntry. */
    interface IDictionaryEntry {

        /** DictionaryEntry pattern */
        pattern?: (string|null);

        /** DictionaryEntry frequency */
        frequency?: (number|null);

        /** DictionaryEntry id */
        id?: (number|null);
    }

    /** Represents a DictionaryEntry. */
    class DictionaryEntry implements IDictionaryEntry {

        /**
         * Constructs a new DictionaryEntry.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.IDictionaryEntry);

        /** DictionaryEntry pattern. */
        public pattern: string;

        /** DictionaryEntry frequency. */
        public frequency: number;

        /** DictionaryEntry id. */
        public id: number;

        /**
         * Creates a new DictionaryEntry instance using the specified properties.
         * @param [properties] Properties to set
         * @returns DictionaryEntry instance
         */
        public static create(properties?: lorachain.IDictionaryEntry): lorachain.DictionaryEntry;

        /**
         * Encodes the specified DictionaryEntry message. Does not implicitly {@link lorachain.DictionaryEntry.verify|verify} messages.
         * @param message DictionaryEntry message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.IDictionaryEntry, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified DictionaryEntry message, length delimited. Does not implicitly {@link lorachain.DictionaryEntry.verify|verify} messages.
         * @param message DictionaryEntry message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.IDictionaryEntry, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a DictionaryEntry message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns DictionaryEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.DictionaryEntry;

        /**
         * Decodes a DictionaryEntry message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns DictionaryEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.DictionaryEntry;

        /**
         * Verifies a DictionaryEntry message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a DictionaryEntry message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns DictionaryEntry
         */
        public static fromObject(object: { [k: string]: any }): lorachain.DictionaryEntry;

        /**
         * Creates a plain object from a DictionaryEntry message. Also converts values to other types if specified.
         * @param message DictionaryEntry
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.DictionaryEntry, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this DictionaryEntry to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for DictionaryEntry
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a CompressionDictionary. */
    interface ICompressionDictionary {

        /** CompressionDictionary id */
        id?: (string|null);

        /** CompressionDictionary version */
        version?: (number|null);

        /** CompressionDictionary entries */
        entries?: (lorachain.IDictionaryEntry[]|null);

        /** CompressionDictionary createdAt */
        createdAt?: (number|Long|null);

        /** CompressionDictionary lastUpdated */
        lastUpdated?: (number|Long|null);

        /** CompressionDictionary compressionRatio */
        compressionRatio?: (number|null);

        /** CompressionDictionary signature */
        signature?: (Uint8Array|null);
    }

    /** Represents a CompressionDictionary. */
    class CompressionDictionary implements ICompressionDictionary {

        /**
         * Constructs a new CompressionDictionary.
         * @param [properties] Properties to set
         */
        constructor(properties?: lorachain.ICompressionDictionary);

        /** CompressionDictionary id. */
        public id: string;

        /** CompressionDictionary version. */
        public version: number;

        /** CompressionDictionary entries. */
        public entries: lorachain.IDictionaryEntry[];

        /** CompressionDictionary createdAt. */
        public createdAt: (number|Long);

        /** CompressionDictionary lastUpdated. */
        public lastUpdated: (number|Long);

        /** CompressionDictionary compressionRatio. */
        public compressionRatio: number;

        /** CompressionDictionary signature. */
        public signature: Uint8Array;

        /**
         * Creates a new CompressionDictionary instance using the specified properties.
         * @param [properties] Properties to set
         * @returns CompressionDictionary instance
         */
        public static create(properties?: lorachain.ICompressionDictionary): lorachain.CompressionDictionary;

        /**
         * Encodes the specified CompressionDictionary message. Does not implicitly {@link lorachain.CompressionDictionary.verify|verify} messages.
         * @param message CompressionDictionary message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: lorachain.ICompressionDictionary, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CompressionDictionary message, length delimited. Does not implicitly {@link lorachain.CompressionDictionary.verify|verify} messages.
         * @param message CompressionDictionary message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: lorachain.ICompressionDictionary, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CompressionDictionary message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CompressionDictionary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): lorachain.CompressionDictionary;

        /**
         * Decodes a CompressionDictionary message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CompressionDictionary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): lorachain.CompressionDictionary;

        /**
         * Verifies a CompressionDictionary message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a CompressionDictionary message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns CompressionDictionary
         */
        public static fromObject(object: { [k: string]: any }): lorachain.CompressionDictionary;

        /**
         * Creates a plain object from a CompressionDictionary message. Also converts values to other types if specified.
         * @param message CompressionDictionary
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: lorachain.CompressionDictionary, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this CompressionDictionary to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for CompressionDictionary
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
