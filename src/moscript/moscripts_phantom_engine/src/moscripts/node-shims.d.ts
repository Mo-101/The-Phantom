declare module 'node:crypto' {
  export function createHash(algorithm: string): { update(data: string, inputEncoding?: string): { digest(encoding: 'hex'): string } };
}
declare module 'node:assert/strict' {
  const assert: any;
  export default assert;
}
