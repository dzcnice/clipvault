import VaultPersistence from './encrypted-persistence.mjs'

// Implements the same official persistence service, with no filesystem backend.
export default class MemoryPersistence extends VaultPersistence {
  snapshot = null
  async request(operation, payload = {}) {
    if (operation === 'create') {
      if (this.snapshot) throw new Error('Utility session already exists')
      this.snapshot = { header: structuredClone(payload.header), events: [] }
      return true
    }
    if (operation === 'read') return structuredClone(this.snapshot)
    if (operation === 'count') return { count: this.snapshot?.events.length ?? 0 }
    if (operation === 'append' && this.snapshot && payload.cursor === this.snapshot.events.length) {
      if (JSON.stringify(payload.events).length > 1_000_000 || this.snapshot.events.length + payload.events.length > 200) throw new Error('Utility session exceeds limits')
      this.snapshot.events.push(...structuredClone(payload.events)); return true
    }
    throw new Error('Invalid utility persistence operation')
  }
}
