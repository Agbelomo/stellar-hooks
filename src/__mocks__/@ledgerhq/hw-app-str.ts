/** Test stub for the optional `@ledgerhq/hw-app-str` peer package. */
export default class Str {
  constructor(_transport: unknown) {}
  async getPublicKey(_path: string): Promise<{ publicKey: string }> {
    return { publicKey: "G_STUB" };
  }
  async signTransaction(_path: string, _payload: Buffer): Promise<{ signature: Buffer }> {
    return { signature: Buffer.alloc(0) };
  }
}
