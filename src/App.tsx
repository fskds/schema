import { useEffect, useMemo, useRef, useState } from 'react'
import type { SchemaDetail, SchemaProp, SchemaSummary, SchemaTypeInfo } from './data.d'
import { fetchSchemaDetail, fetchSchemaSummary, fetchSchemaTypes } from './service'

/** 折叠块：显示一组属性 */
function PropGroup({
  title,
  props,
  open,
}: {
  title: string
  props: SchemaProp[]
  open?: boolean
}) {
  if (props.length === 0) return null
  return (
    <details className="prop-group" open={open}>
      <summary>
        <span className="prop-group-title">{title}</span>
        <span className="badge">{props.length}</span>
      </summary>
      <table className="prop-table">
        <thead>
          <tr>
            <th>属性</th>
            <th>期望取值类型</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name}>
              <td className="prop-name">
                {p.name}
                <a
                  className="prop-link"
                  href={`https://schema.org/${p.name}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗
                </a>
              </td>
              <td className="prop-type">{p.expectedType}</td>
              <td className="prop-desc">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function App() {
  const [schemaTypes, setSchemaTypes] = useState<SchemaTypeInfo[]>([])
  const [summary, setSummary] = useState<SchemaSummary>({ typeCount: 0, totalProps: 0 })
  const [typesLoading, setTypesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 右侧详情：未选择类型时显示首页
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<SchemaDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 布局状态：左栏折叠 + 可拖拽调宽
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const dragStart = useRef<{ x: number; w: number } | null>(null)

  // ---- 数据加载：类型树 + 首页统计（不加载全部属性）----
  useEffect(() => {
    let cancelled = false

    fetchSchemaTypes()
      .then((res) => {
        if (!cancelled) setSchemaTypes(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setTypesLoading(false)
      })

    fetchSchemaSummary()
      .then((res) => {
        if (!cancelled) setSummary(res)
      })
      .catch(() => {
        /* 统计失败不阻塞页面 */
      })

    return () => {
      cancelled = true
    }
  }, [])

  // ---- 索引（依赖加载到的类型）----
  const typeIndex = useMemo(
    () => new Map<string, SchemaTypeInfo>(schemaTypes.map((t) => [t.name, t])),
    [schemaTypes],
  )

  const childMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const t of schemaTypes) {
      if (!t.parent) continue
      const list = map.get(t.parent) ?? []
      list.push(t.name)
      map.set(t.parent, list)
    }
    return map
  }, [schemaTypes])

  // 数据就绪后，默认展开顶层节点（depth <= 1）
  useEffect(() => {
    if (schemaTypes.length > 0 && expanded.size === 0) {
      setExpanded(new Set(schemaTypes.filter((t) => t.depth <= 1).map((t) => t.name)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaTypes])

  const breadcrumbOf = (name: string): string[] => {
    const chain: string[] = []
    let cur: string | undefined = name
    while (cur) {
      chain.unshift(cur)
      cur = typeIndex.get(cur)?.parent ?? undefined
    }
    return chain
  }

  // ---- 点击左侧类型：按需加载该类型数据 ----
  const handleSelectType = async (name: string) => {
    const id = typeIndex.get(name)?.id
    if (!id) return
    setSelected(name)
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await fetchSchemaDetail(id)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetailLoading(false)
    }
  }

  // ---- 树节点 ----
  function TreeItem({
    name,
    visible,
    selected,
    expanded,
    onSelect,
    onToggle,
  }: {
    name: string
    visible: Set<string> | null
    selected: string | null
    expanded: Set<string>
    onSelect: (name: string) => void
    onToggle: (name: string) => void
  }) {
    const kids = childMap.get(name) ?? []
    const hasKids = kids.length > 0

    // 搜索时仅显示命中节点及其祖先
    if (visible !== null && !visible.has(name)) return null

    const open =
      visible !== null ? kids.some((k) => visible.has(k)) : expanded.has(name)

    return (
      <li
        className={`tree-item${hasKids ? ' has-children' : ''}${
          open ? ' expanded' : ''
        }`}
      >
        {hasKids && (
          <button
            type="button"
            className="tree-toggle"
            onClick={() => onToggle(name)}
            aria-label="展开/收起"
          >
            ▶
          </button>
        )}
        <button
          type="button"
          className={`tree-label${selected === name ? ' active' : ''}`}
          data-type={name}
          onClick={() => onSelect(name)}
        >
          <span className="tree-name">{name}</span>
        </button>
        {hasKids && (
          <ul className="sub-menu">
            {kids.map((k) => (
              <TreeItem
                key={k}
                name={k}
                visible={visible}
                selected={selected}
                expanded={expanded}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  // ---- 搜索可见集合：命中节点 + 全部祖先 ----
  const visibleSet = useMemo(() => {
    if (query === '') return null
    const q = query.trim().toLowerCase()
    const set = new Set<string>()
    const hit = (n: string) => {
      const info = typeIndex.get(n)
      return (
        n.toLowerCase().includes(q) ||
        (info?.description ?? '').toLowerCase().includes(q)
      )
    }
    const walk = (n: string): boolean => {
      const res = hit(n) || (childMap.get(n) ?? []).some((c) => walk(c))
      if (res) set.add(n)
      return res
    }
    for (const root of schemaTypes.filter((t) => !t.parent)) {
      walk(root.name)
    }
    return set
  }, [query, typeIndex, childMap, schemaTypes])

  const handleToggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // 拖拽分隔条调整左栏宽度
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStart.current = { x: e.clientX, w: sidebarWidth }
    const move = (ev: MouseEvent) => {
      if (!dragStart.current) return
      const w = Math.min(
        560,
        Math.max(200, dragStart.current.w + ev.clientX - dragStart.current.x),
      )
      setSidebarWidth(w)
    }
    const up = () => {
      dragStart.current = null
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  // ---- 渲染 ----
  if (typesLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#999',
        }}
      >
        加载中…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#e74c3c',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span>数据加载失败：{error}</span>
      </div>
    )
  }

  const roots = schemaTypes.filter((t) => !t.parent)

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
        >
          {collapsed ? '»' : '«'}
        </button>
        <div className="brand-row">
          <img className="brand-logo" src="/logo.svg" alt="Schema.org" />
          <div className="brand">Schema.org 中文文档</div>
        </div>
        <div className="stats">
          <span>{summary.typeCount} 类型</span>
          <span className="dot" />
          <span>{summary.totalProps} 直接属性</span>
        </div>
        <input
          className="search"
          type="text"
          placeholder="搜索类型或描述…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="layout">
        <aside
          className={`sidebar${collapsed ? ' collapsed' : ''}`}
          style={{ width: collapsed ? 0 : sidebarWidth }}
        >
          <ul className="tree-root">
            {roots.map((r) => (
              <TreeItem
                key={r.name}
                name={r.name}
                visible={visibleSet}
                selected={selected}
                expanded={expanded}
                onSelect={handleSelectType}
                onToggle={handleToggle}
              />
            ))}
          </ul>
          {visibleSet !== null && visibleSet.size === 0 && (
            <div className="no-result">未找到匹配的类型或描述</div>
          )}
        </aside>

        {!collapsed && (
          <div
            className="resize-handle"
            onMouseDown={startDrag}
            title="拖拽调整宽度"
          />
        )}

        <main className="content">
          {selected === null || (!detailLoading && !detail) ? (
            /* ---- 默认首页 ---- */
            <div className="home-page">
              <h1 className="home-title">Schema.org 结构化数据中文文档</h1>
              <p className="home-sub">
                从左侧类型树中选择一个类型，即可查看该类型的定义、继承关系及属性说明。数据按需加载，仅返回当前查看的内容。
              </p>
              <div className="home-stats">
                <div className="home-stat">
                  <span className="home-stat-value">{summary.typeCount}</span>
                  <span className="home-stat-label">可用类型</span>
                </div>
                <div className="home-stat">
                  <span className="home-stat-value">{summary.totalProps}</span>
                  <span className="home-stat-label">属性总数</span>
                </div>
              </div>
              <div className="home-hint">点击左侧任一类型开始浏览 →</div>
            </div>
          ) : detail ? (
            /* ---- 当前类型详情 ---- */
            <>
              <div className="crumb">
                {breadcrumbOf(detail.name).map((c, i) => (
                  <span key={c}>
                    {i > 0 && <span className="crumb-sep"> / </span>}
                    <a
                      className="crumb-link"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        if (c !== detail.name) handleSelectType(c)
                      }}
                    >
                      {c}
                    </a>
                  </span>
                ))}
              </div>

              <h1 className="type-name">
                {detail.name}
                <a
                  className="type-link"
                  href={`https://schema.org/${detail.name}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看英文原文 ↗
                </a>
              </h1>
              <p className="type-desc">
                {detail.description ||
                  '（该类型暂无中文描述，请参考 schema.org 官方文档。）'}
              </p>

              {detail.example ? (
                <div className="type-example">
                  <h3 className="type-example-title">实例</h3>
                  <pre className="exa-code">{detail.example}</pre>
                </div>
              ) : null}

              {(() => {
                const own = detail.groups[detail.groups.length - 1]?.props ?? []
                const inherited = detail.groups.slice(0, -1).reverse()
                const totalCount = detail.groups.reduce((n, g) => n + g.props.length, 0)
                return (
                  <>
                    <h2 className="section-title">
                      属性定义
                      <span className="hint">
                        （共 {totalCount}，当前类型直接定义 {own.length}）
                      </span>
                    </h2>
                    <PropGroup title="当前类型直接定义的属性" props={own} open />
                    {inherited.map((g) => (
                      <PropGroup
                        key={g.origin}
                        title={`继承自 ${g.origin} 的属性`}
                        props={g.props}
                      />
                    ))}
                  </>
                )
              })()}
            </>
          ) : (
            <div className="detail-loading">正在加载 {selected} 的属性…</div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App