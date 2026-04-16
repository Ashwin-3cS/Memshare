import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";

import type { CliConfig } from "./config.js";

// Sui system Clock object ID (same on all networks)
const SUI_CLOCK_OBJECT_ID = "0x6";

function buildSuiClient(config: CliConfig): SuiJsonRpcClient {
  const network = (config.suiNetwork ?? "mainnet") as "mainnet" | "testnet";
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  });
}

function buildKeypair(suiPrivateKey: string): Ed25519Keypair {
  const { secretKey } = decodeSuiPrivateKey(suiPrivateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

export type AddDelegateKeyParams = {
  friendPubkeyHex: string;
  label: string;
};

export async function addDelegateKey(
  config: CliConfig,
  params: AddDelegateKeyParams,
): Promise<string> {
  if (!config.suiPrivateKey) throw new Error("SUI_PRIVATE_KEY not set");
  if (!config.packageId) throw new Error("MEMWAL_PACKAGE_ID not set");
  if (!config.accountId) throw new Error("MEMWAL_ACCOUNT_ID not set");

  const client = buildSuiClient(config);
  const keypair = buildKeypair(config.suiPrivateKey);

  // Decode friend's pubkey from hex to bytes
  const pubkeyBytes = Buffer.from(params.friendPubkeyHex.replace(/^0x/, ""), "hex");
  if (pubkeyBytes.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${pubkeyBytes.length}`);
  }

  // Derive Sui address from Ed25519 public key
  const ed25519PubKey = new Ed25519PublicKey(pubkeyBytes);
  const friendSuiAddress = ed25519PubKey.toSuiAddress();

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::account::add_delegate_key`,
    arguments: [
      tx.object(config.accountId),
      tx.pure.vector("u8", Array.from(pubkeyBytes)),
      tx.pure.address(friendSuiAddress),
      tx.pure.string(params.label),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  if (!result.digest) {
    throw new Error("Transaction failed: no digest returned");
  }
  return result.digest;
}

export function derivePublicKeyHex(delegateKeyHex: string): { pubkeyHex: string; suiAddress: string } {
  const privkeyBytes = Buffer.from(delegateKeyHex.replace(/^0x/, ""), "hex");
  // Ed25519: public key is derived synchronously in @mysten/sui via keypair
  const keypair = Ed25519Keypair.fromSecretKey(privkeyBytes);
  const pubkey = keypair.getPublicKey();
  return {
    pubkeyHex: Buffer.from(pubkey.toRawBytes()).toString("hex"),
    suiAddress: pubkey.toSuiAddress(),
  };
}
