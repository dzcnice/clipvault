import type { FieldRole, ResourceInput, WorkResource } from './workbench'
export interface IntakeField { token: string; name: string; role: FieldRole; secret: boolean; preview: string }
export interface IntakeReview {
  id: string; draft: Omit<ResourceInput, 'fields'> & { fields: IntakeField[] }; warnings: string[]
  duplicates: Array<{ id: string; name: string; version: number }>; usedAI: boolean; usernameShared?: boolean; sourceClipId?: string
}
export interface IntakeSource { text?: string; purpose?: string; promptId?: string; clipboardId?: string; useAI?: boolean; allowUsername?: boolean }
export interface IntakeCommit { id: string; draft: IntakeReview['draft']; updateId?: string; expectedVersion?: number; clearSource?: boolean }
export interface ResourceSequenceState { active: boolean; nextRole?: FieldRole; remaining: number; expiresAt?: number; error?: string }
export interface ResourceIntakeAPI {
  intake(input: IntakeSource): Promise<IntakeReview>
  saveIntake(input: IntakeCommit): Promise<WorkResource>
  revealIntake(input: { id: string; token: string }): Promise<string>
}
