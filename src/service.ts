import type { SchemaDetail, SchemaSummary, SchemaTypeInfo } from './data.d'

export const API_BASE = 'http://dam.cnsesi.com/api/schema'
//export const API_BASE = 'http://www.a.com/api/schema'
/**
 * 通用 GET，取响应的 data 字段（service 层已剥离 { status, msg, data } 包装）
 */
async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`加载失败（HTTP ${res.status}）`)
  const json = await res.json()
  return (json?.data ?? json) as T
}

/** 拉取类型平铺列表（构建左侧树） */
export function fetchSchemaTypes(): Promise<SchemaTypeInfo[]> {
  return get<SchemaTypeInfo[]>(`${API_BASE}/types`)
}

/** 拉取首页总览统计 */
export function fetchSchemaSummary(): Promise<SchemaSummary> {
  return get<SchemaSummary>(`${API_BASE}/summary`)
}

/** 按类型 ID 按需拉取该类型的属性（含继承链），只返回当前需要的数据 */
export function fetchSchemaDetail(id: number): Promise<SchemaDetail> {
  return get<SchemaDetail>(`${API_BASE}/properties/${id}`)
}