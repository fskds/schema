export interface SchemaProp {
  name: string
  expectedType: string
  description: string
}

export interface SchemaTypeInfo {
  id: number
  name: string
  parent: string | null
  depth: number
  isLeaf: boolean
  description: string
  example?: string
}

export interface SchemaPropGroup {
  origin: string
  props: SchemaProp[]
}

export interface SchemaDetail {
  name: string
  description: string
  example?: string
  groups: SchemaPropGroup[]
}

export interface SchemaSummary {
  typeCount: number
  totalProps: number
}