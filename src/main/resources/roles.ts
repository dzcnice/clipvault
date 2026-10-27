import type { FieldRole } from '../../types/workbench'
export const fieldRoles: FieldRole[] = ['username', 'password', 'api_key', 'token', 'totp_seed', 'host', 'port', 'database', 'connection_string', 'other']
export function inferRole(name: string, value = ''): FieldRole {
  if (/totp|otp.?secret|authenticator|二步|动态口令/i.test(name) || value.startsWith('otpauth://')) return 'totp_seed'
  if (/password|passwd|pwd|密码/i.test(name)) return 'password'
  if (/api.?key|密钥|^key$/i.test(name)) return 'api_key'
  if (/token|令牌/i.test(name)) return 'token'
  if (/user|account|email|账号|用户名|邮箱/i.test(name)) return 'username'
  if (/connection|连接串/i.test(name)) return 'connection_string'
  if (/^(host|主机)$/i.test(name)) return 'host'
  if (/^(port|端口)$/i.test(name)) return 'port'
  if (/^(database|数据库)$/i.test(name)) return 'database'
  return 'other'
}
export function sensitiveRole(role: FieldRole): boolean { return ['password', 'api_key', 'token', 'totp_seed', 'connection_string'].includes(role) }
