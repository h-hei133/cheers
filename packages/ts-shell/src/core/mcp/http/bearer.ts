/** Bind external authentication to one physical connection without persisting its value. */
export function captureBearer(variable: string): () => string {
  const token = process.env[variable];
  const valid = typeof token === 'string' && token.length > 0 && token.length <= 8192 && /^[A-Za-z0-9._~+/-]+=*$/.test(token);
  return () => {
    if (!valid || process.env[variable] !== token) throw new Error('MCP authentication is required.');
    return token!;
  };
}
