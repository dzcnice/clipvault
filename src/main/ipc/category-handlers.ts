/**
 * 分类相关 IPC 处理器
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../types'
import * as categoryStore from '../../db/category-store'
import * as credentialStore from '../../db/credential-store'
import { wrapHandler } from './utils'
import { logger } from '../utils/logger'
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryTreeNode,
  ApiResponse,
  Tag
} from '../../types'

/** 注册分类相关的 IPC 处理器 */
export function registerCategoryHandlers(): void {
  // 创建分类
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_CREATE,
    wrapHandler(async (_event, input: CreateCategoryInput): Promise<ApiResponse<Category>> => {
      try {
        const category = categoryStore.createCategory(input)
        return { success: true, data: category }
      } catch (error) {
        logger.error('[IPC] Error creating category:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 更新分类
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_UPDATE,
    wrapHandler(async (_event, input: UpdateCategoryInput): Promise<ApiResponse<Category>> => {
      try {
        const category = categoryStore.updateCategory(input)
        if (!category) {
          return { success: false, error: '分类不存在' }
        }
        return { success: true, data: category }
      } catch (error) {
        logger.error('[IPC] Error updating category:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 删除分类
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_DELETE,
    wrapHandler(async (_event, id: string): Promise<ApiResponse<boolean>> => {
      try {
        const success = categoryStore.deleteCategory(id)
        return { success, data: success }
      } catch (error) {
        logger.error('[IPC] Error deleting category:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 获取分类列表
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_LIST,
    wrapHandler(async (): Promise<ApiResponse<Category[]>> => {
      try {
        const categories = categoryStore.listCategories()
        return { success: true, data: categories }
      } catch (error) {
        logger.error('[IPC] Error listing categories:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 获取分类树
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_TREE,
    wrapHandler(async (): Promise<ApiResponse<CategoryTreeNode[]>> => {
      try {
        const tree = categoryStore.getCategoryTree()
        return { success: true, data: tree }
      } catch (error) {
        logger.error('[IPC] Error getting category tree:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 获取标签列表
  ipcMain.handle(
    IPC_CHANNELS.TAG_LIST,
    wrapHandler(async (): Promise<ApiResponse<Tag[]>> => {
      try {
        const tags = credentialStore.getAllTags()
        return { success: true, data: tags }
      } catch (error) {
        logger.error('[IPC] Error listing tags:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 删除标签
  ipcMain.handle(
    IPC_CHANNELS.TAG_DELETE,
    wrapHandler(async (_event, tagName: string): Promise<ApiResponse<boolean>> => {
      try {
        credentialStore.deleteTag(tagName)
        return { success: true, data: true }
      } catch (error) {
        logger.error('[IPC] Error deleting tag:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  logger.info('[IPC] Category handlers registered')
}
