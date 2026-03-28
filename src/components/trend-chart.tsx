'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Maximize2, MoveHorizontal } from 'lucide-react'

interface DataPoint {
  date: string
  value: number
}

interface TrendChartProps {
  data: DataPoint[]
  unit: string
  color?: string
  decimals?: number
}

/** Minimum px per point when in pan (scroll) mode — more = fewer points on screen, easier to read */
const PX_PER_POINT_PAN = 44
const CHART_HEIGHT = 168

export function TrendChart({ data, unit, color = '#f97316', decimals = 1 }: TrendChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [containerWidth, setContainerWidth] = useState(320)
  /** fit = entire series in view; pan = wide chart, horizontal scroll */
  const [viewMode, setViewMode] = useState<'fit' | 'pan'>('fit')

  const gradId = useId().replace(/:/g, '')

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setContainerWidth(Math.max(el.clientWidth, 260))
    })
    ro.observe(el)
    setContainerWidth(Math.max(el.clientWidth, 260))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (viewMode !== 'pan' || !scrollRef.current) return
    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [data, viewMode])

  if (data.length === 0) return null

  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = (max - min) * 0.15 || 5
  const adjMin = min - padding
  const adjMax = max + padding
  const range = adjMax - adjMin || 1

  const innerW = Math.max(containerWidth - 8, 260)
  const widthFit = innerW
  const widthPan = Math.max(data.length * PX_PER_POINT_PAN, innerW)

  const chartWidth = viewMode === 'fit' ? widthFit : widthPan
  const chartHeight = CHART_HEIGHT
  const paddingX = 36
  const paddingTop = 28
  const paddingBottom = 34
  const drawHeight = chartHeight - paddingTop - paddingBottom

  const points = data.map((d, i) => ({
    x: paddingX + i * ((chartWidth - paddingX * 2) / Math.max(data.length - 1, 1)),
    y: paddingTop + drawHeight - ((d.value - adjMin) / range) * drawHeight,
    ...d,
  }))

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  const areaD = pathD +
    ` L ${points[points.length - 1].x} ${chartHeight - paddingBottom}` +
    ` L ${points[0].x} ${chartHeight - paddingBottom} Z`

  const gridLines = 4
  const gridValues = Array.from({ length: gridLines }, (_, i) => {
    const val = adjMin + (range / (gridLines - 1)) * i
    return { value: val, y: paddingTop + drawHeight - ((val - adjMin) / range) * drawHeight }
  })

  const first = data[0].value
  const last = data[data.length - 1].value
  const totalChange = last - first

  const labelEvery = viewMode === 'fit'
    ? Math.max(1, Math.ceil(data.length / 6))
    : Math.max(1, Math.floor(data.length / 8))

  return (
    <div ref={containerRef} className="space-y-3 w-full min-w-0">
      {/* Summary + view mode */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <span className="text-lg font-display font-bold">{last.toFixed(decimals)}</span>
          <span className="text-xs text-white/40 ml-1">{unit}</span>
        </div>
        <div className="flex items-center gap-1">
          {data.length > 1 && (
            <span className={cn(
              'text-sm font-display font-semibold mr-2',
              totalChange < 0 ? 'text-green-400' : totalChange > 0 ? 'text-red-400' : 'text-white/30'
            )}>
              {totalChange > 0 ? '+' : ''}{totalChange.toFixed(decimals)} {unit}
            </span>
          )}
          <button
            type="button"
            onClick={() => setViewMode('fit')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-display font-semibold transition-all',
              viewMode === 'fit'
                ? 'bg-white/15 text-white'
                : 'bg-white/5 text-white/40 hover:text-white/70'
            )}
            title="Show entire range in this width"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Full
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pan')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-display font-semibold transition-all',
              viewMode === 'pan'
                ? 'bg-white/15 text-white'
                : 'bg-white/5 text-white/40 hover:text-white/70'
            )}
            title="Wider chart — scroll horizontally"
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
            Pan
          </button>
        </div>
      </div>

      {/* Chart */}
      <div
        ref={scrollRef}
        className={cn(
          'overflow-x-auto -mx-1 px-1',
          viewMode === 'pan' && 'pb-1',
          viewMode === 'pan' ? 'scrollbar-thin' : 'overflow-x-hidden'
        )}
        style={viewMode === 'pan' ? { WebkitOverflowScrolling: 'touch' } : undefined}
      >
        <svg
          width={chartWidth}
          height={chartHeight}
          className="touch-pan-x max-w-none"
          style={{ minWidth: viewMode === 'fit' ? '100%' : undefined }}
        >
          <defs>
            <linearGradient id={`grad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {gridValues.map((g, i) => (
            <g key={i}>
              <line
                x1={paddingX}
                y1={g.y}
                x2={chartWidth - paddingX}
                y2={g.y}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 4}
                y={g.y + 3}
                textAnchor="end"
                className="fill-white/20"
                fontSize={9}
                fontFamily="var(--font-body)"
              >
                {g.value.toFixed(0)}
              </text>
            </g>
          ))}

          {data.length > 1 && (
            <path d={areaD} fill={`url(#grad-${gradId})`} />
          )}

          {data.length > 1 && (
            <path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIndex === i ? 6 : 4}
                fill={i === points.length - 1 ? color : 'rgba(255,255,255,0.15)'}
                stroke={color}
                strokeWidth={2}
                className="transition-all duration-150"
                onPointerEnter={() => setHoveredIndex(i)}
                onPointerLeave={() => setHoveredIndex(null)}
              />

              {(i === 0 || i === points.length - 1 || i % labelEvery === 0) && (
                <text
                  x={p.x}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  className="fill-white/25"
                  fontSize={8}
                  fontFamily="var(--font-body)"
                >
                  {format(new Date(p.date + 'T12:00:00'), 'M/d')}
                </text>
              )}

              {hoveredIndex === i && (
                <>
                  <line
                    x1={p.x}
                    y1={paddingTop}
                    x2={p.x}
                    y2={chartHeight - paddingBottom}
                    stroke="rgba(255,255,255,0.1)"
                    strokeDasharray="3 3"
                  />
                  <rect
                    x={p.x - 32}
                    y={p.y - 28}
                    width={64}
                    height={20}
                    rx={6}
                    fill="rgba(0,0,0,0.8)"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={1}
                  />
                  <text
                    x={p.x}
                    y={p.y - 15}
                    textAnchor="middle"
                    fill="white"
                    fontSize={11}
                    fontWeight={600}
                    fontFamily="var(--font-display)"
                  >
                    {p.value.toFixed(decimals)}
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
      </div>

      {viewMode === 'pan' && data.length > 3 && (
        <p className="text-[10px] text-center text-white/25 px-2">
          Swipe or scroll horizontally to see the full range.
        </p>
      )}
    </div>
  )
}
