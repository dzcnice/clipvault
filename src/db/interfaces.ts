/**
 * Repository 接口（B-8）
 *
 * 轻量版：不引 DI 容器，只是把现有 store 导出的函数签名收拢到接口下
 * 便于未来测试/mock 时替换实现。调用方可以直接用 `import * as credentialStore from './credential-store'`，
 * 需要依赖注入时，把 credential-store 导出对象视作 ICredentialRepository 即可
 */

import type {
  Credential,
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialFilter,
  CredentialSortBy,
  SortDirection,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryTreeNode,
  ClipboardItem,
  CreateClipboardItemInput,
  CreateSnippetInput,
  UpdateSnippetInput,
  ClipboardFilter,
  Tag,
  WorkspaceContext
} from '@/types'

export interface ICredentialRepository {
  createCredential(input: CreateCredentialInput, workspace?: WorkspaceContext): Credential
  getCredentialById(id: string): Credential | null
  updateCredential(input: UpdateCredentialInput): Credential | null
  deleteCredential(id: string): boolean
  listCredentials(
    filter?: CredentialFilter,
    sortBy?: CredentialSortBy,
    sortDir?: SortDirection,
    limit?: number,
    offset?: number,
    workspace?: WorkspaceContext,
    includeSecrets?: boolean
  ): { items: Credential[]; total: number }
  recordCredentialUsage(id: string): void
  getAllTags(): Tag[]
  deleteTag(tagName: string): void
}

export interface ICategoryRepository {
  createCategory(input: CreateCategoryInput): Category
  getCategoryById(id: string): Category | null
  updateCategory(input: UpdateCategoryInput): Category | null
  deleteCategory(id: string): boolean
  listCategories(): Category[]
  getCategoryTree(): CategoryTreeNode[]
}

export interface IClipboardRepository {
  addClipboardItem(
    input: CreateClipboardItemInput,
    detectedKeyType?: string,
    workspace?: WorkspaceContext
  ): Promise<ClipboardItem | null>
  getClipboardItemById(id: string): ClipboardItem | null
  listClipboardHistory(
    filter?: ClipboardFilter,
    limit?: number,
    offset?: number,
    workspace?: WorkspaceContext
  ): { items: ClipboardItem[]; total: number }
  deleteClipboardItem(id: string): boolean
  clearClipboardHistory(): number
  toggleClipboardPin(id: string): boolean
  recordClipboardUsage(id: string): void
  createSnippet(input: CreateSnippetInput, workspace?: WorkspaceContext): ClipboardItem
  updateSnippet(input: UpdateSnippetInput): ClipboardItem | null
  getSnippets(workspace?: WorkspaceContext): ClipboardItem[]
  findByHash(hash: string): ClipboardItem | null
}
