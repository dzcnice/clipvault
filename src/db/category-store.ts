/**
 * 分类数据存储层
 * KR 1.3: 密钥分类与标签系统
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase, transaction } from './connection'
import type { Category, CreateCategoryInput, UpdateCategoryInput, CategoryTreeNode } from '@/types'

/** 数据库行类型 */
interface CategoryRow {
  id: string
  name: string
  parent_id: string | null
  icon: string | null
  color: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

/** 将数据库行转换为 Category */
function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id || undefined,
    icon: row.icon || undefined,
    color: row.color || undefined,
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 创建分类 */
export function createCategory(input: CreateCategoryInput): Category {
  const db = getDatabase()
  const now = Date.now()
  const id = uuidv4()

  // 获取同级分类的最大排序值
  let maxOrder = 0
  const parentCondition = input.parentId ? 'parent_id = ?' : 'parent_id IS NULL'
  const params = input.parentId ? [input.parentId] : []

  const maxOrderRow = db
    .prepare(`SELECT MAX(sort_order) as max_order FROM categories WHERE ${parentCondition}`)
    .get(...params) as { max_order: number | null }

  if (maxOrderRow.max_order !== null) {
    maxOrder = maxOrderRow.max_order + 1
  }

  const order = input.order ?? maxOrder

  db.prepare(`
    INSERT INTO categories (id, name, parent_id, icon, color, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.name, input.parentId || null, input.icon || null, input.color || null, order, now, now)

  return getCategoryById(id)!
}

/** 根据ID获取分类 */
export function getCategoryById(id: string): Category | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined

  if (!row) {
    return null
  }

  return rowToCategory(row)
}

/** 更新分类 */
export function updateCategory(input: UpdateCategoryInput): Category | null {
  const db = getDatabase()
  const existing = getCategoryById(input.id)

  if (!existing) {
    return null
  }

  const now = Date.now()
  const updates: string[] = ['updated_at = ?']
  const values: (string | number | null)[] = [now]

  if (input.name !== undefined) {
    updates.push('name = ?')
    values.push(input.name)
  }
  if (input.parentId !== undefined) {
    // 防止循环引用
    if (input.parentId === input.id) {
      throw new Error('Category cannot be its own parent')
    }
    updates.push('parent_id = ?')
    values.push(input.parentId || null)
  }
  if (input.icon !== undefined) {
    updates.push('icon = ?')
    values.push(input.icon || null)
  }
  if (input.color !== undefined) {
    updates.push('color = ?')
    values.push(input.color || null)
  }
  if (input.order !== undefined) {
    updates.push('sort_order = ?')
    values.push(input.order)
  }

  values.push(input.id)

  db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  return getCategoryById(input.id)
}

/** 删除分类 */
export function deleteCategory(id: string): boolean {
  const db = getDatabase()

  return transaction(() => {
    // 将子分类的 parent_id 设为 null
    db.prepare('UPDATE categories SET parent_id = NULL WHERE parent_id = ?').run(id)

    // 将该分类下的凭证的 category_id 设为 null
    db.prepare('UPDATE credentials SET category_id = NULL WHERE category_id = ?').run(id)

    // 删除分类
    const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    return result.changes > 0
  })
}

/** 获取所有分类列表 */
export function listCategories(): Category[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all() as CategoryRow[]
  return rows.map(rowToCategory)
}

/** 获取分类树 */
export function getCategoryTree(): CategoryTreeNode[] {
  const db = getDatabase()

  // 获取所有分类
  const categories = listCategories()

  // 获取每个分类下的凭证数量
  const credentialCounts = new Map<string, number>()
  const countRows = db
    .prepare(
      `
    SELECT category_id, COUNT(*) as count
    FROM credentials
    WHERE category_id IS NOT NULL
    GROUP BY category_id
  `
    )
    .all() as { category_id: string; count: number }[]

  for (const row of countRows) {
    credentialCounts.set(row.category_id, row.count)
  }

  // 构建树结构
  const categoryMap = new Map<string, CategoryTreeNode>()
  const rootNodes: CategoryTreeNode[] = []

  // 先创建所有节点
  for (const cat of categories) {
    categoryMap.set(cat.id, {
      ...cat,
      children: [],
      credentialCount: credentialCounts.get(cat.id) || 0
    })
  }

  // 构建父子关系
  for (const cat of categories) {
    const node = categoryMap.get(cat.id)!
    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        // 父节点不存在，作为根节点
        rootNodes.push(node)
      }
    } else {
      rootNodes.push(node)
    }
  }

  // 递归计算包含子分类的凭证总数
  function calculateTotalCount(node: CategoryTreeNode): number {
    let total = node.credentialCount
    for (const child of node.children) {
      total += calculateTotalCount(child)
    }
    return total
  }

  // 更新每个节点的凭证计数（包含子分类）
  for (const root of rootNodes) {
    calculateTotalCount(root)
  }

  return rootNodes
}

// B-9：moveCategory / getCategoryPath 清理；当前版本不需要，未来如需拖拽重排再加回
