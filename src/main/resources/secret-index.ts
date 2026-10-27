import { createHmac } from 'node:crypto'
import { getDEK, decryptWithDEK } from '../crypto/vault'
import { getDatabase } from '../../db/connection'

/** Domain-separated keyed MAC: never persist raw or unkeyed hashes of credentials. */
export function secretMac(value: string): string {
  const dek = getDEK()
  if (!dek) throw new Error('请先解锁本地资料库')
  const key = createHmac('sha256', dek).update('clipvault/resource-secret-index/v1').digest()
  try { return createHmac('sha256', key).update(value).digest('hex') }
  finally { key.fill(0); dek.fill(0) }
}
export function indexSecret(id: string, field: string, value: string): void {
  getDatabase().prepare('INSERT INTO wb_resource_secret_index(resource_id,field,mac) VALUES(?,?,?) ON CONFLICT(resource_id,field) DO UPDATE SET mac=excluded.mac').run(id, field, secretMac(value))
}
export function duplicateSecretResources(values: string[]): string[] {
  const db = getDatabase()
  // Lazy backfill is additive; old fields and ciphertext remain untouched.
  const missing = db.prepare(`SELECT f.resource_id,f.name,f.value_encrypted FROM wb_resource_fields f
    WHERE f.secret=1 AND f.version=(SELECT MAX(v.version) FROM wb_resource_fields v WHERE v.resource_id=f.resource_id AND v.name=f.name)
    AND NOT EXISTS(SELECT 1 FROM wb_resource_secret_index i WHERE i.resource_id=f.resource_id AND i.field=f.name)`).all() as Array<{ resource_id: string; name: string; value_encrypted: string }>
  for (const field of missing) indexSecret(field.resource_id, field.name, decryptWithDEK(field.value_encrypted))
  const query = db.prepare(`SELECT DISTINCT i.resource_id FROM wb_resource_secret_index i JOIN wb_resources r ON r.id=i.resource_id
    JOIN wb_resource_fields f ON f.resource_id=i.resource_id AND f.name=i.field AND f.secret=1
    AND f.version=(SELECT MAX(v.version) FROM wb_resource_fields v WHERE v.resource_id=f.resource_id AND v.name=f.name)
    WHERE i.mac=? AND r.state<>'revoked'`)
  return [...new Set(values.flatMap(value => (query.all(secretMac(value)) as Array<{ resource_id: string }>).map(row => row.resource_id)))]
}
