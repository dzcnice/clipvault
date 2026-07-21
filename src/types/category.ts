/**
 * 分类与标签类型定义
 * KR 1.3: 密钥分类与标签系统
 */

/** 分类接口 */
export interface Category {
  /** 唯一标识 */
  id: string
  /** 分类名称 */
  name: string
  /** 父分类ID（支持无限层级） */
  parentId?: string
  /** 图标（emoji 或图标名） */
  icon?: string
  /** 颜色标识 */
  color?: string
  /** 排序顺序 */
  order: number
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
}

/** 创建分类输入 */
export interface CreateCategoryInput {
  name: string
  parentId?: string
  icon?: string
  color?: string
  order?: number
}

/** 更新分类输入 */
export interface UpdateCategoryInput {
  id: string
  name?: string
  parentId?: string
  icon?: string
  color?: string
  order?: number
}

/** 分类树节点（用于UI展示） */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[]
  /** 该分类下的凭证数量 */
  credentialCount: number
}

/** 标签接口 */
export interface Tag {
  /** 标签名（唯一） */
  name: string
  /** 颜色 */
  color?: string
  /** 使用次数 */
  useCount: number
}
