import crypto from "node:crypto";
import * as ed from "@noble/ed25519";

import { type CliConfig } from "./config.js";
import type {
  HealthResponse,
  RecallRequest,
  RecallResponse,
  RememberBatchRequest,
  RememberBatchResponse,
} from "./types.js";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256hex(data: string): Promise<string> {
  return crypto.createHash("sha256").update(data).digest("hex");
}

type SignedClientConfig = {
  serverUrl: string;
  accountId: string;
  delegateKeyHex: string;
};

export class MemshareClient {
  private readonly serverUrl: string;
  private readonly accountId: string;
  private readonly delegateKey: Uint8Array;
  private publicKey: Uint8Array | null = null;

  constructor(config: SignedClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, "");
    this.accountId = config.accountId;
    this.delegateKey = hexToBytes(config.delegateKeyHex);
  }

  static fromConfig(config: CliConfig): MemshareClient {
    if (!config.relayerUrl) {
      throw new Error("MEMSHARE_RELAYER_URL is required");
    }
    if (!config.accountId) {
      throw new Error("MEMWAL_ACCOUNT_ID is required");
    }
    if (!config.delegateKey) {
      throw new Error("MEMWAL_DELEGATE_KEY is required");
    }

    return new MemshareClient({
      serverUrl: config.relayerUrl,
      accountId: config.accountId,
      delegateKeyHex: config.delegateKey,
    });
  }

  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.serverUrl}/health`);
    if (!response.ok) {
      throw new Error(`Relayer health check failed (${response.status})`);
    }
    return (await response.json()) as HealthResponse;
  }

  async rememberBatch(body: RememberBatchRequest): Promise<RememberBatchResponse> {
    return this.signedRequest("POST", "/api/remember/batch", body);
  }

  async recall(body: RecallRequest): Promise<RecallResponse> {
    return this.signedRequest("POST", "/api/recall", body);
  }

  private async getPublicKey(): Promise<Uint8Array> {
    if (!this.publicKey) {
      this.publicKey = await ed.getPublicKeyAsync(this.delegateKey);
    }
    return this.publicKey;
  }

  private async signedRequest<T>(
    method: string,
    path: string,
    body: object,
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyString = JSON.stringify(body);
    const bodySha256 = await sha256hex(bodyString);
    const message = `${timestamp}.${method}.${path}.${bodySha256}`;
    const messageBytes = new TextEncoder().encode(message);

    const signature = await ed.signAsync(messageBytes, this.delegateKey);
    const publicKey = await this.getPublicKey();

    const response = await fetch(`${this.serverUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-public-key": bytesToHex(publicKey),
        "x-signature": bytesToHex(signature),
        "x-timestamp": timestamp,
        "x-delegate-key": bytesToHex(this.delegateKey),
        "x-account-id": this.accountId,
      },
      body: bodyString,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relayer request failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as T;
  }
}
