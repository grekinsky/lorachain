import { createHash } from 'crypto';
import type {
  Transaction,
  UTXOTransaction,
  MerkleNode,
  MerkleProof,
  ProofElement,
  CompressedMerkleProof,
} from '../types.js';

export class MerkleTree {
  /**
   * Build merkle tree for UTXO transactions (future state)
   * This method constructs a complete tree structure for proof generation
   */
  static buildTree(transactions: UTXOTransaction[]): MerkleNode[] {
    if (transactions.length === 0) {
      const emptyHash = createHash('sha256').update('').digest('hex');
      return [
        {
          hash: emptyHash,
          isLeaf: true,
        },
      ];
    }

    // Create leaf nodes from transactions
    const leafNodes: MerkleNode[] = transactions.map(tx => ({
      hash: createHash('sha256').update(JSON.stringify(tx)).digest('hex'),
      isLeaf: true,
      transactionId: tx.id,
    }));

    return this.buildTreeFromLeaves(leafNodes);
  }

  /**
   * Build merkle tree for legacy transactions (current state)
   * Maintains backward compatibility during transition
   */
  static buildTreeLegacy(transactions: Transaction[]): MerkleNode[] {
    if (transactions.length === 0) {
      const emptyHash = createHash('sha256').update('').digest('hex');
      return [
        {
          hash: emptyHash,
          isLeaf: true,
        },
      ];
    }

    // Create leaf nodes from transactions
    const leafNodes: MerkleNode[] = transactions.map(tx => ({
      hash: createHash('sha256').update(JSON.stringify(tx)).digest('hex'),
      isLeaf: true,
      transactionId: tx.id,
    }));

    return this.buildTreeFromLeaves(leafNodes);
  }

  /**
   * Calculate merkle root for UTXO transactions
   * This method is compatible with existing BlockManager.calculateMerkleRoot
   */
  static calculateRoot(transactions: UTXOTransaction[]): string {
    if (transactions.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }

    const hashes = transactions.map(tx =>
      createHash('sha256').update(JSON.stringify(tx)).digest('hex')
    );

    while (hashes.length > 1) {
      const newHashes: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || left; // Duplicate last hash if odd number
        const combined = createHash('sha256')
          .update(left + right)
          .digest('hex');
        newHashes.push(combined);
      }
      hashes.length = 0;
      hashes.push(...newHashes);
    }

    return hashes[0];
  }

  /**
   * Generate merkle proof for a specific UTXO transaction
   */
  static generateProof(
    transactions: UTXOTransaction[],
    targetTxId: string
  ): MerkleProof | null {
    const targetIndex = transactions.findIndex(tx => tx.id === targetTxId);
    if (targetIndex === -1) {
      return null;
    }

    const targetTransaction = transactions[targetIndex];
    const targetHash = createHash('sha256')
      .update(JSON.stringify(targetTransaction))
      .digest('hex');
    const merkleRoot = this.calculateRoot(transactions);

    // Build complete tree to generate proof
    const tree = this.buildTree(transactions);
    const proof = this.generateProofFromTree(tree, targetHash, targetIndex);

    return {
      transactionId: targetTxId,
      transactionHash: targetHash,
      merkleRoot,
      proof,
      leafIndex: targetIndex,
    };
  }

  /**
   * Generate merkle proof for legacy transactions
   * Maintains backward compatibility during transition
   */
  static generateProofLegacy(
    transactions: Transaction[],
    targetTxId: string
  ): MerkleProof | null {
    const targetIndex = transactions.findIndex(tx => tx.id === targetTxId);
    if (targetIndex === -1) {
      return null;
    }

    const targetTransaction = transactions[targetIndex];
    const targetHash = createHash('sha256')
      .update(JSON.stringify(targetTransaction))
      .digest('hex');

    // Use existing calculateMerkleRoot for consistency
    const hashes = transactions.map(tx =>
      createHash('sha256').update(JSON.stringify(tx)).digest('hex')
    );

    const merkleRoot = this.calculateMerkleRootFromHashes(hashes);

    // Build complete tree to generate proof
    const tree = this.buildTreeLegacy(transactions);
    const proof = this.generateProofFromTree(tree, targetHash, targetIndex);

    return {
      transactionId: targetTxId,
      transactionHash: targetHash,
      merkleRoot,
      proof,
      leafIndex: targetIndex,
    };
  }

  /**
   * Verify a merkle proof against a merkle root
   */
  static verifyProof(proof: MerkleProof, merkleRoot: string): boolean {
    let currentHash = proof.transactionHash;

    // Apply each proof element to reconstruct path to root
    for (const element of proof.proof) {
      if (element.direction === 'left') {
        currentHash = createHash('sha256')
          .update(element.hash + currentHash)
          .digest('hex');
      } else {
        currentHash = createHash('sha256')
          .update(currentHash + element.hash)
          .digest('hex');
      }
    }

    return currentHash === merkleRoot;
  }

  /**
   * Compress merkle proof for LoRa transmission
   * Reduces proof size by ~50% using bit manipulation
   */
  static compressProof(proof: MerkleProof): CompressedMerkleProof {
    // Compress proof path into bit string
    let pathBits = '';
    let hashConcat = '';

    for (const element of proof.proof) {
      pathBits += element.direction === 'left' ? '0' : '1';
      hashConcat += element.hash;
    }

    // Convert bit string to hex for compact representation
    const pathHex = this.bitsToHex(pathBits);

    return {
      txId: proof.transactionId,
      txHash: proof.transactionHash,
      root: proof.merkleRoot,
      path: pathHex + '|' + hashConcat, // Separator for path bits and hashes
      index: proof.leafIndex,
    };
  }

  /**
   * Decompress merkle proof from LoRa transmission
   */
  static decompressProof(compressed: CompressedMerkleProof): MerkleProof {
    const [pathHex, hashConcat] = compressed.path.split('|');

    if (!pathHex || !hashConcat) {
      return {
        transactionId: compressed.txId,
        transactionHash: compressed.txHash,
        merkleRoot: compressed.root,
        proof: [],
        leafIndex: compressed.index,
      };
    }

    const pathBits = this.hexToBits(pathHex);
    const proof: ProofElement[] = [];
    const hashLength = 64; // SHA-256 hash length in hex

    // Only process bits that have corresponding hashes
    const maxElements = Math.floor(hashConcat.length / hashLength);
    const actualBits = Math.min(pathBits.length, maxElements);

    for (let i = 0; i < actualBits; i++) {
      const direction = pathBits[i] === '0' ? 'left' : 'right';
      const hash = hashConcat.substring(i * hashLength, (i + 1) * hashLength);

      // Only add if hash is valid (not empty)
      if (hash && hash.length === hashLength) {
        proof.push({ hash, direction });
      }
    }

    return {
      transactionId: compressed.txId,
      transactionHash: compressed.txHash,
      merkleRoot: compressed.root,
      proof,
      leafIndex: compressed.index,
    };
  }

  // Private helper methods

  /**
   * Build tree structure from leaf nodes
   */
  private static buildTreeFromLeaves(leafNodes: MerkleNode[]): MerkleNode[] {
    let currentLevel = leafNodes;
    const allNodes = [...leafNodes];

    while (currentLevel.length > 1) {
      const nextLevel: MerkleNode[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left; // Duplicate if odd number

        const parent: MerkleNode = {
          hash: createHash('sha256')
            .update(left.hash + right.hash)
            .digest('hex'),
          left,
          right: currentLevel[i + 1] ? right : undefined, // Don't store duplicate
          isLeaf: false,
        };

        nextLevel.push(parent);
        allNodes.push(parent);
      }

      currentLevel = nextLevel;
    }

    return allNodes;
  }

  /**
   * Generate proof from tree structure
   */
  private static generateProofFromTree(
    tree: MerkleNode[],
    targetHash: string,
    leafIndex: number
  ): ProofElement[] {
    const proof: ProofElement[] = [];
    const leafNodes = tree.filter(node => node.isLeaf);

    if (leafNodes.length === 0) return proof;
    if (leafNodes.length === 1) return proof; // Single transaction needs no proof

    // Build levels and trace proof path
    let currentLevel = leafNodes;
    let currentIndex = leafIndex;

    while (currentLevel.length > 1) {
      const nextLevel: MerkleNode[] = [];

      // Build next level and find sibling
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left; // Duplicate if odd number

        const parent: MerkleNode = {
          hash: createHash('sha256')
            .update(left.hash + right.hash)
            .digest('hex'),
          left,
          right: currentLevel[i + 1] ? right : undefined,
          isLeaf: false,
        };

        nextLevel.push(parent);
      }

      // Find sibling for current node
      if (currentIndex < currentLevel.length) {
        const isLeft = currentIndex % 2 === 0;
        const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

        if (siblingIndex < currentLevel.length) {
          const siblingHash = currentLevel[siblingIndex].hash;
          proof.push({
            hash: siblingHash,
            direction: isLeft ? 'right' : 'left',
          });
        }
      }

      // Move to next level
      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * Calculate merkle root from hash array (compatible with existing implementation)
   */
  private static calculateMerkleRootFromHashes(hashes: string[]): string {
    if (hashes.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }

    const workingHashes = [...hashes];

    while (workingHashes.length > 1) {
      const newHashes: string[] = [];
      for (let i = 0; i < workingHashes.length; i += 2) {
        const left = workingHashes[i];
        const right = workingHashes[i + 1] || left;
        const combined = createHash('sha256')
          .update(left + right)
          .digest('hex');
        newHashes.push(combined);
      }
      workingHashes.length = 0;
      workingHashes.push(...newHashes);
    }

    return workingHashes[0];
  }

  /**
   * Convert bit string to hexadecimal
   */
  private static bitsToHex(bits: string): string {
    // Pad to multiple of 4 bits
    const paddedBits = bits.padEnd(Math.ceil(bits.length / 4) * 4, '0');

    let hex = '';
    for (let i = 0; i < paddedBits.length; i += 4) {
      const nibble = paddedBits.substring(i, i + 4);
      hex += parseInt(nibble, 2).toString(16);
    }

    return hex;
  }

  /**
   * Convert hexadecimal to bit string
   */
  private static hexToBits(hex: string): string {
    let bits = '';
    for (const char of hex) {
      bits += parseInt(char, 16).toString(2).padStart(4, '0');
    }
    return bits;
  }
}
