import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, Crown, Search, RefreshCw,
  Share2, Check, X, Filter, Lock,
} from 'lucide-react'
import { supabase } from './lib/supabase.js'

// ─── Shared display constants ─────────────────────────────────────────────────
const ALLIANCES = ['TEA', 'VIK', 'ERA', 'FFF']

const ALLIANCE_CLR = {
  TEA: { border: '#10b981', bg: 'rgba(16,185,129,0.15)',  text: '#6ee7b7' },
  VIK: { border: '#f43f5e', bg: 'rgba(244,63,94,0.15)',   text: '#fda4af' },
  ERA: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  text: '#c4b5fd' },
  FFF: { border: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  text: '#fcd34d' },
}

const TC_IS_GOLD = (v) => v?.startsWith('TG')

const TIME_SLOTS = (() => {
  const slots = []
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m += 30) {
      const p  = (n) => String(n).padStart(2, '0')
      const eH = m === 30 ? h + 1 : h
      const eM = m === 30 ? 0 : 30
      slots.push({
        value: `${p(h)}:${p(m)}`,
        label: `${p(h)}:${p(m)} – ${eH === 24 ? '24:00' : p(eH)+':'+p(eM)} UTC`,
      })
    }
  return slots
})()

const fmtSlot = (v) => {
  if (!v) return '—'
  const [h, m] = v.split(':').map(Number)
  const eH = m === 30 ? h + 1 : h
  const eM = m === 30 ? 0 : 30
  const p  = (n) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)} – ${eH === 24 ? '24:00' : p(eH)+':'+p(eM)} UTC`
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
function AllianceBadge({ alliance }) {
  const s = ALLIANCE_CLR[alliance] ?? { border:'#6b7280', bg:'rgba(107,114,128,0.15)', text:'#9ca3af' }
  return (
    <span className="inline-block font-sans font-bold text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-lg"
      style={{ color:s.text, background:s.bg, border:`1px solid ${s.border}` }}>
      {alliance}
    </span>
  )
}

function TcBadge({ level }) {
  const gold = TC_IS_GOLD(level)
  return (
    <span className="inline-block font-sans font-bold text-[11px] px-2 py-0.5 rounded-lg"
      style={gold
        ?{color:'#fcd34d',background:'rgba(245,158,11,0.14)',border:'1px solid rgba(245,158,11,0.3)'}
        :{color:'#748ffc',background:'rgba(76,110,245,0.14)',border:'1px solid rgba(76,110,245,0.3)'}}>
      {level ? (level.startsWith('TG') ? level : `TC ${level}`) : '—'}
    </span>
  )
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className="flex flex-col justify-between gap-1 p-3 sm:px-4 sm:py-3.5 rounded-2xl min-w-0 w-full shadow-lg"
      style={{ background:'#0f1117', border:`1px solid ${accent??'#1c1f2e'}` }}>
      <div>
        <div className="flex items-center gap-1.5 min-w-0" style={{ color:accent??'#6b7280' }}>
          <span className="shrink-0">{icon}</span>
          <span className="truncate" style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</span>
        </div>
        <span className="block font-sans text-xl sm:text-2xl font-bold text-white tracking-tight mt-1 truncate">{value}</span>
      </div>
      {sub && <span className="font-sans text-[10px] sm:text-xs text-slate-400 truncate block mt-0.5 font-medium">{sub}</span>}
    </div>
  )
}

// ─── Public Read-Only Schedule Page ───────────────────────────────────────────
const enrichScheduleRow = (r) => {
  let localOverrides = {}
  try {
    localOverrides = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('kvk_status_overrides') || '{}')
      : {}
  } catch {}

  const d1Key = `${r.id}_day1`
  const d4Key = `${r.id}_day4`
  const legacyDeclined = r.status === 'declined' || localOverrides[r.id] === 'declined'

  const status_day1 = r.status_day1
    ?? localOverrides[d1Key]
    ?? (typeof localOverrides[r.id] === 'object' ? localOverrides[r.id]?.day1 : undefined)
    ?? (legacyDeclined ? 'declined' : 'approved')

  const status_day4 = r.status_day4
    ?? localOverrides[d4Key]
    ?? (typeof localOverrides[r.id] === 'object' ? localOverrides[r.id]?.day4 : undefined)
    ?? (legacyDeclined ? 'declined' : 'approved')

  const hasD1 = (r.selected_days || []).includes('day1') && status_day1 !== 'declined'
  const hasD4 = (r.selected_days || []).includes('day4') && status_day4 !== 'declined'
  const isFullyDeclined = !hasD1 && !hasD4

  return {
    ...r,
    status_day1,
    status_day4,
    hasD1,
    hasD4,
    isFullyDeclined,
  }
}

export default function PublicSchedule() {
  const [rows, setRows]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [copied, setCopied]           = useState(false)

  // Visualizer & Filter States
  const [activeDay, setActiveDay]                   = useState('day1')  // 'day1' | 'day4'
  const [selectedSlotFilter, setSelectedSlotFilter] = useState(null)
  const [tableDayFilter, setTableDayFilter]         = useState('ALL')   // 'ALL' | 'day1' | 'day4'
  const [allianceFilter, setAllianceFilter]         = useState('ALL')
  const [search, setSearch]                         = useState('')
  const [hoveredData, setHoveredData]               = useState(null)

  // ── Fetch appointments from Supabase ───────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('kvk_appointments')
      .select('id, player_name, alliance, tc_level, selected_days, time_slot_day1, time_slot_day4, created_at, status, status_day1, status_day4')
      .order('player_name', { ascending: true })

    if (error) {
      // Fallback query if status column is pending in DB schema cache
      const fallbackRes = await supabase
        .from('kvk_appointments')
        .select('id, player_name, alliance, tc_level, selected_days, time_slot_day1, time_slot_day4, created_at')
        .order('player_name', { ascending: true })

      if (fallbackRes.error) {
        console.error('[Public Schedule Fetch Error]', fallbackRes.error)
      } else {
        const enriched = (fallbackRes.data ?? []).map(enrichScheduleRow).filter(r => !r.isFullyDeclined)
        setRows(enriched)
        setLastUpdated(new Date())
      }
    } else {
      const enriched = (data ?? []).map(enrichScheduleRow).filter(r => !r.isFullyDeclined)
      setRows(enriched)
      setLastUpdated(new Date())
    }
    setLoading(false)
  }, [])

  // ── Initial load + Real-time Subscription ──────────────────────────────────
  useEffect(() => {
    fetchData()

    // Real-time Supabase postgres_changes subscription
    const channel = supabase
      .channel('public_schedule_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kvk_appointments' },
        () => {
          fetchData()
        }
      )
      .subscribe()

    // 45-second polling fallback
    const interval = setInterval(fetchData, 45000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchData])

  // ── Copy Link action ───────────────────────────────────────────────────────
  const handleCopyLink = async () => {
    const url = window.location.href
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const input = document.createElement('input')
        input.value = url
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2600)
    } catch {
      // ignore
    }
  }

  // ── Slot Data for Visualizer ───────────────────────────────────────────────
  const slotData = useMemo(() => {
    const slotField = activeDay === 'day1' ? 'time_slot_day1' : 'time_slot_day4'
    const activeCheck = activeDay === 'day1' ? 'hasD1' : 'hasD4'

    return TIME_SLOTS.map(slot => {
      const signups = rows.filter(r =>
        r[activeCheck] && r[slotField] === slot.value
      )

      const count = signups.length
      const status = count === 0 ? 'unclaimed' : 'covered'
      return { slot, signups, count, status }
    })
  }, [rows, activeDay])

  const totalSlots   = 48
  const coveredSlots = useMemo(() => slotData.filter(s => s.count >= 1).length, [slotData])
  const unclaimedSlots = useMemo(() => slotData.filter(s => s.count === 0).length, [slotData])

  // Count unique slots claimed on Day 1 and Day 4
  const d1ClaimedCount = useMemo(() => {
    const claimed = new Set()
    rows.forEach(r => {
      if (r.hasD1 && r.time_slot_day1) claimed.add(r.time_slot_day1)
    })
    return claimed.size
  }, [rows])

  const d4ClaimedCount = useMemo(() => {
    const claimed = new Set()
    rows.forEach(r => {
      if (r.hasD4 && r.time_slot_day4) claimed.add(r.time_slot_day4)
    })
    return claimed.size
  }, [rows])

  // Table rows filtering
  const displayed = useMemo(() => {
    let res = [...rows]

    if (allianceFilter !== 'ALL') res = res.filter(r => r.alliance === allianceFilter)

    if (tableDayFilter === 'day1') res = res.filter(r => r.hasD1)
    if (tableDayFilter === 'day4') res = res.filter(r => r.hasD4)

    if (selectedSlotFilter) {
      const slotField = activeDay === 'day1' ? 'time_slot_day1' : 'time_slot_day4'
      const activeCheck = activeDay === 'day1' ? 'hasD1' : 'hasD4'
      res = res.filter(r => r[activeCheck] && r[slotField] === selectedSlotFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      res = res.filter(r =>
        r.player_name?.toLowerCase().includes(q) ||
        r.alliance?.toLowerCase().includes(q)
      )
    }

    return res
  }, [rows, allianceFilter, tableDayFilter, selectedSlotFilter, activeDay, search])

  const handleCellClick = (slot, status) => {
    if (status === 'covered') {
      if (selectedSlotFilter === slot.value) {
        setSelectedSlotFilter(null)
      } else {
        setSelectedSlotFilter(slot.value)
      }
    }
  }

  return (
    <div className="min-h-screen text-slate-200 overflow-x-hidden flex flex-col items-center" style={{ background: '#0a0b0f' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 backdrop-blur-xl"
        style={{ background: 'rgba(10,11,15,0.94)', borderBottom: '1px solid #1c1f2e' }}>

        <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(76,110,245,0.2)', border: '1px solid rgba(76,110,245,0.35)' }}>
              <Crown className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-sans font-bold text-sm sm:text-base text-white tracking-tight">
                  2323 KvK Schedule
                </h1>
                <span className="flex items-center gap-1 text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="font-sans text-[11px] text-slate-400">
                Kingdom Ministry Schedule · Official Alliance Time Slots
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
          {/* Share Link */}
          <button
            onClick={handleCopyLink}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-sans text-xs font-semibold tracking-tight transition-all active:scale-95 bg-[#12141c] hover:bg-[#1a1d28] border border-[#1c1f2e] text-slate-300">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? 'Link Copied!' : 'Share'}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-sans text-xs font-medium tracking-tight transition-all bg-[#12141c] hover:bg-[#1a1d28] border border-[#1c1f2e] text-slate-400 hover:text-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Booking Closed Indicator */}
          <div
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-sans text-xs font-semibold tracking-tight text-rose-300 bg-rose-500/10 border border-rose-500/25 shrink-0"
            title="Ministry booking submissions are currently closed">
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>Booking Closed</span>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="w-full max-w-[1440px] px-4 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6 overflow-x-hidden">

        {/* ── 1. Minister of Justice: Magpie Profile Section ── */}
        <section
          aria-label="Minister of Justice Profile"
          className="w-full rounded-2xl p-4 sm:p-6 bg-gradient-to-br from-[#131625] via-[#0f111c] to-[#0a0b12] border border-amber-500/35 shadow-2xl relative overflow-hidden">
          {/* Subtle decorative glow accents */}
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6 relative z-10">
            {/* Sleek Circular Framed Profile Picture */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1 bg-gradient-to-tr from-amber-500 via-amber-300 to-indigo-500 shadow-xl shadow-amber-500/20">
                <img
                  src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRuI89w7biqTbW1DZ4ASFe40uir-6-hCIAfD3YhU6Qstg&s=10"
                  alt="Minister of Justice: Magpie"
                  className="w-full h-full object-cover rounded-full bg-[#12141c]"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-400 text-black text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full shadow-lg flex items-center gap-0.5 border border-amber-900/40">
                <span>⚖️</span>
                <span>R4</span>
              </div>
            </div>

            {/* Profile Title, Role & Instructions */}
            <div className="flex-1 space-y-2.5 min-w-0">
              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                  <span className="font-sans text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/35 flex items-center gap-1">
                    <span>⚖️</span>
                    <span>Minister of Justice</span>
                  </span>
                  <span className="font-sans text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    Kingdom 2323
                  </span>
                </div>
                <h2 className="font-sans font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                  Magpie
                </h2>
                <p className="font-sans text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl mt-1">
                  Overseeing official Kingdom Ministry appointments, speedup coordination, and KvK Preparation Day buff distribution across <strong className="text-white">TEA · VIK · ERA · FFF</strong>.
                </p>
              </div>

              {/* Direct Contact Guidelines */}
              <div className="pt-2 border-t border-[#1c1f2e] flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 font-sans text-xs text-slate-300">
                <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
                  <span className="text-amber-400 font-bold">✉️ In-Game:</span>
                  <span>PM <strong>Magpie</strong></span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
                  <span className="text-indigo-400 font-bold">💬 Discord:</span>
                  <span>Tag in <strong>#ministry-desk</strong></span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
                  <span className="text-emerald-400 font-bold">🛡️ Leadership:</span>
                  <span>Contact your Alliance R4/R5</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. Top Summary Cards (2-col on mobile, 4-col on tablet/desktop) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          <StatCard
            icon={<span style={{fontSize:13}}>👥</span>}
            label="Total Booked"
            value={rows.length}
            sub="TEA · VIK · ERA · FFF"
          />
          <StatCard
            icon={<span style={{fontSize:13}}>⚒️</span>}
            label="Day 1 (Const/Res)"
            value={`${d1ClaimedCount} Booked`}
            sub="0 Open · Closed"
            accent="rgba(76,110,245,0.7)"
          />
          <StatCard
            icon={<span style={{fontSize:13}}>⚔️</span>}
            label="Day 4 (Training)"
            value={`${d4ClaimedCount} Booked`}
            sub="0 Open · Closed"
            accent="rgba(245,158,11,0.7)"
          />
          <StatCard
            icon={<Lock className="w-3.5 h-3.5 text-rose-400" />}
            label="Ministry Status"
            value="Closed"
            sub="All Slots Finalized"
            accent="rgba(244,63,94,0.6)"
          />
        </div>

        {/* ── 3. Read-Only Slot Coverage Visualizer ── */}
        <div className="rounded-2xl p-3.5 sm:p-5 space-y-4 shadow-xl"
          style={{ background: '#0f1117', border: '1px solid #1c1f2e' }}>

          {/* Visualizer Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(76, 110, 245, 0.15)', border: '1px solid rgba(76, 110, 245, 0.35)' }}>
                <Clock className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-sans font-bold text-white text-sm sm:text-base tracking-tight">
                    24-Hour Time Slot Grid
                  </h2>
                  <span className="font-sans text-xs px-2.5 py-0.5 rounded-full font-bold tracking-tight bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-rose-400" />
                    <span>Booking Closed · {coveredSlots} Booked</span>
                  </span>
                </div>
                <p className="font-sans text-[11px] text-slate-400 mt-0.5">
                  Click any booked slot to filter schedule below · Unassigned slots are locked
                </p>
              </div>
            </div>

            {/* Day Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-[#0a0b0f] border border-[#1c1f2e] w-full md:w-auto justify-center">
              <button
                onClick={() => { setActiveDay('day1'); setSelectedSlotFilter(null) }}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-sans text-xs font-bold tracking-tight transition-all"
                style={activeDay === 'day1'
                  ? { background: 'rgba(76, 110, 245, 0.22)', color: '#748ffc', border: '1px solid rgba(76, 110, 245, 0.45)' }
                  : { color: '#6b7280', border: '1px solid transparent' }}>
                <span>⚒️</span>
                <span>Day 1</span>
                <span className="font-sans text-[10px] px-2 py-0.5 rounded font-semibold tracking-tight"
                  style={{ background: 'rgba(0,0,0,0.4)', color: activeDay === 'day1' ? '#a5b4fc' : '#6b7280' }}>
                  {d1ClaimedCount} Booked
                </span>
              </button>

              <button
                onClick={() => { setActiveDay('day4'); setSelectedSlotFilter(null) }}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-sans text-xs font-bold tracking-tight transition-all"
                style={activeDay === 'day4'
                  ? { background: 'rgba(245, 158, 11, 0.22)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.45)' }
                  : { color: '#6b7280', border: '1px solid transparent' }}>
                <span>⚔️</span>
                <span>Day 4</span>
                <span className="font-sans text-[10px] px-2 py-0.5 rounded font-semibold tracking-tight"
                  style={{ background: 'rgba(0,0,0,0.4)', color: activeDay === 'day4' ? '#fde68a' : '#6b7280' }}>
                  {d4ClaimedCount} Booked
                </span>
              </button>
            </div>
          </div>

          {/* Legend Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#1c1f2e]/70 text-xs">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded shrink-0"
                  style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.55)' }} />
                <span className="font-sans text-[11px] text-slate-300">
                  Booked ({coveredSlots})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded shrink-0"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.2)' }} />
                <span className="font-sans text-[11px] text-slate-400">
                  Closed / Unassigned ({unclaimedSlots})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 font-sans text-[11px] text-slate-500">
              {selectedSlotFilter && (
                <button
                  onClick={() => setSelectedSlotFilter(null)}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold underline truncate">
                  Clear Slot Filter ({selectedSlotFilter})
                </button>
              )}
              <span className="shrink-0">{slotData.length} of {totalSlots} slots</span>
            </div>
          </div>

          {/* 48 Slots Heatmap Grid: 2-col on mobile, 3-col on sm, 4-col on md, 6-col on lg, 8-col on xl, 12-col on 2xl */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-12 gap-2">
            {slotData.map(({ slot, signups, count, status }) => {
              const isUnclaimed = status === 'unclaimed'
              const isSelected  = selectedSlotFilter === slot.value

              let borderStyle, bgStyle, glowStyle
              if (isSelected) {
                borderStyle = '2px solid #818cf8'
                bgStyle     = 'rgba(99, 102, 241, 0.25)'
                glowStyle   = '0 0 16px rgba(129, 140, 248, 0.4)'
              } else if (isUnclaimed) {
                borderStyle = '1px dashed rgba(255, 255, 255, 0.12)'
                bgStyle     = 'rgba(255, 255, 255, 0.02)'
                glowStyle   = 'none'
              } else {
                borderStyle = '1px solid rgba(16, 185, 129, 0.4)'
                bgStyle     = 'rgba(16, 185, 129, 0.12)'
                glowStyle   = '0 0 10px rgba(16, 185, 129, 0.08)'
              }

              const topPlayer = signups[0]

              return (
                <div
                  key={slot.value}
                  onClick={() => handleCellClick(slot, status)}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoveredData({ slot, signups, status, rect })
                  }}
                  onMouseLeave={() => setHoveredData(null)}
                  className={`group relative flex flex-col justify-between p-2 sm:p-2.5 rounded-xl transition-all select-none min-w-0 ${
                    isUnclaimed
                      ? 'opacity-65 cursor-default'
                      : isSelected
                        ? 'scale-102 ring-1 ring-indigo-400 cursor-pointer'
                        : 'hover:border-indigo-400/80 hover:bg-slate-800/40 active:scale-98 cursor-pointer'
                  }`}
                  style={{
                    border: borderStyle,
                    background: bgStyle,
                    boxShadow: glowStyle,
                    minHeight: 64,
                  }}
                >
                  {/* Top line: Slot Time & Indicator */}
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className={`font-sans text-xs font-semibold tracking-tight transition-colors truncate ${
                      isSelected ? 'text-white font-bold' : 'text-slate-200 group-hover:text-white'
                    }`}>
                      {slot.value}
                    </span>
                    {!isUnclaimed ? (
                      <span className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                    ) : (
                      <span className="font-sans text-[9px] text-slate-500 font-bold tracking-wider uppercase shrink-0">
                        CLOSED
                      </span>
                    )}
                  </div>

                  {/* Bottom line: Player Name & Alliance/TC */}
                  <div className="mt-1 min-w-0">
                    {isUnclaimed ? (
                      <div className="flex items-center gap-1 font-sans text-[10px] text-slate-500 min-w-0">
                        <Lock className="w-2.5 h-2.5 shrink-0 text-slate-600" />
                        <span className="font-medium tracking-tight truncate min-w-0">Unassigned</span>
                      </div>
                    ) : (
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <span className="font-sans text-xs font-semibold text-slate-100 truncate min-w-0 flex-1 tracking-tight">
                            {topPlayer?.player_name}
                          </span>
                          <span className="font-sans text-[10px] font-bold text-slate-300 shrink-0">
                            {topPlayer?.alliance}
                          </span>
                        </div>
                        {count > 1 && (
                          <span className="font-sans text-[9px] text-slate-400 font-medium truncate tracking-tight">
                            +{count - 1} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Active Slot Filter Banner ── */}
        {selectedSlotFilter && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
            <div className="flex items-center gap-2 font-sans text-xs">
              <Filter className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>
                Filtering schedule for slot: <strong className="text-white font-semibold">{selectedSlotFilter} UTC</strong> ({activeDay === 'day1' ? 'Day 1' : 'Day 4'})
              </span>
              <span className="text-[11px] text-indigo-400/80">({displayed.length} player{displayed.length !== 1 ? 's' : ''})</span>
            </div>
            <button
              onClick={() => setSelectedSlotFilter(null)}
              className="flex items-center gap-1 text-xs font-sans font-semibold text-indigo-300 hover:text-white px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 transition-colors shrink-0">
              <X className="w-3 h-3" />
              <span>Clear Filter</span>
            </button>
          </div>
        )}

        {/* ── 4. Searchable Alliance Schedule Directory ── */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-center md:text-left">
              <h3 className="font-sans font-bold text-base sm:text-lg text-white tracking-tight">
                Player Directory
              </h3>
              <p className="font-sans text-xs text-slate-400">
                Search your commander name or alliance to verify your assigned time slot
              </p>
            </div>

            {/* Filter pills & search */}
            <div className="flex flex-col sm:flex-row items-center justify-center md:justify-end gap-2.5 w-full md:w-auto">
              <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
                {/* Day filter for list */}
                <div className="flex items-center gap-1 bg-[#0f1117] p-1 rounded-xl border border-[#1c1f2e]">
                  {[['ALL', 'All Days'], ['day1', '⚒️ Day 1'], ['day4', '⚔️ Day 4']].map(([d, lbl]) => (
                    <button
                      key={d}
                      onClick={() => setTableDayFilter(d)}
                      className={`px-2.5 py-1 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all ${
                        tableDayFilter === d
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Alliance filter */}
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  {['ALL', ...ALLIANCES].map(a => (
                    <button
                      key={a}
                      onClick={() => setAllianceFilter(a)}
                      className={`px-2.5 py-1 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all ${
                        allianceFilter === a
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-[#0f1117] text-slate-400 border border-[#1c1f2e] hover:text-slate-200'
                      }`}>
                      {a === 'ALL' ? 'All' : a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Find commander…"
                  className="w-full pl-8 pr-4 py-1.5 rounded-xl font-sans text-xs bg-[#0f1117] border border-[#1c1f2e] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            </div>
          </div>

          {/* Directory Content */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500 font-sans text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading schedule…
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-16 text-center text-slate-500 font-sans text-xs rounded-2xl border border-[#1c1f2e] bg-[#0f1117] px-4">
              No player appointments match the current search or slot filter.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile Card-Based Schedule Directory (Visible on < md) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 md:hidden">
                {displayed.map((r, idx) => (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-2xl bg-[#0f1117] border border-[#1c1f2e] space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-sans text-[11px] font-bold text-slate-500 shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-sans font-bold text-sm text-white truncate">
                          {r.player_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <AllianceBadge alliance={r.alliance} />
                        <TcBadge level={r.tc_level} />
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#1c1f2e]/70 text-xs font-sans">
                      {r.hasD1 && r.time_slot_day1 ? (
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200">
                          <span className="font-semibold flex items-center gap-1 text-[11px]">
                            <span>⚒️</span>
                            <span>Day 1 (Const/Res):</span>
                          </span>
                          <span className="font-mono font-bold text-[11px] text-indigo-300 shrink-0">
                            {fmtSlot(r.time_slot_day1)}
                          </span>
                        </div>
                      ) : null}

                      {r.hasD4 && r.time_slot_day4 ? (
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200">
                          <span className="font-semibold flex items-center gap-1 text-[11px]">
                            <span>⚔️</span>
                            <span>Day 4 (Training):</span>
                          </span>
                          <span className="font-mono font-bold text-[11px] text-amber-300 shrink-0">
                            {fmtSlot(r.time_slot_day4)}
                          </span>
                        </div>
                      ) : null}

                      {!r.hasD1 && !r.hasD4 && (
                        <span className="text-slate-500 text-[11px] italic">No active slots</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (Visible on >= md) */}
              <div className="hidden md:block rounded-2xl overflow-hidden border border-[#1c1f2e] bg-[#0f1117]">
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#0a0b0f', borderBottom: '1px solid #1c1f2e' }}>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }}>#</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }}>Player</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }}>Alliance</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }}>TC Level</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }}>Day 1 Slot (Const/Res)</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }}>Day 4 Slot (Training)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((r, idx) => (
                        <tr key={r.id} className="border-b border-[#141620] hover:bg-white/[0.02] transition-colors">
                          <td style={{ padding:'12px 14px', color:'#4b5563', fontWeight:700 }}>{idx+1}</td>
                          <td style={{ padding:'12px 14px', color:'#f8fafc', fontWeight:600, whiteSpace:'nowrap' }}>{r.player_name}</td>
                          <td style={{ padding:'12px 14px', whiteSpace:'nowrap' }}><AllianceBadge alliance={r.alliance} /></td>
                          <td style={{ padding:'12px 14px', whiteSpace:'nowrap' }}><TcBadge level={r.tc_level} /></td>
                          <td className="font-sans text-xs tracking-tight"
                            style={{ padding:'12px 14px', whiteSpace:'nowrap', color: r.hasD1 && r.time_slot_day1 ? '#748ffc' : '#4b5563', fontWeight: r.hasD1 && r.time_slot_day1 ? 600 : 400 }}>
                            {r.hasD1 ? fmtSlot(r.time_slot_day1) : '—'}
                          </td>
                          <td className="font-sans text-xs tracking-tight"
                            style={{ padding:'12px 14px', whiteSpace:'nowrap', color: r.hasD4 && r.time_slot_day4 ? '#fcd34d' : '#4b5563', fontWeight: r.hasD4 && r.time_slot_day4 ? 600 : 400 }}>
                            {r.hasD4 ? fmtSlot(r.time_slot_day4) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Directory Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 font-sans text-xs text-slate-500 rounded-xl bg-[#0f1117] border border-[#1c1f2e]">
                <span>Showing {displayed.length} of {rows.length} commanders</span>
                {lastUpdated && (
                  <span>Live synced {lastUpdated.toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Tooltip (Clean: Player Name, Alliance, TC, Slot only) ── */}
      {hoveredData && (
        <div
          className="fixed z-[100] pointer-events-none transition-opacity duration-150"
          style={{
            left: Math.min(
              Math.max(12, hoveredData.rect.left + hoveredData.rect.width / 2 - 130),
              (typeof window !== 'undefined' ? window.innerWidth : 360) - 272
            ),
            top: hoveredData.rect.top - 12 > 140
              ? hoveredData.rect.top - 8
              : hoveredData.rect.bottom + 8,
            transform: hoveredData.rect.top - 12 > 140 ? 'translateY(-100%)' : 'none',
            maxWidth: 'calc(100vw - 24px)',
            width: 260,
          }}
        >
          <div
            className="p-3 rounded-xl shadow-2xl backdrop-blur-md"
            style={{
              background: 'rgba(15, 17, 23, 0.97)',
              border: hoveredData.status === 'covered'
                ? '1px solid rgba(16, 185, 129, 0.45)'
                : '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.85)',
            }}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1c1f2e]">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-sans font-semibold tracking-tight text-xs text-slate-100">
                  {hoveredData.slot.label}
                </span>
              </div>
              <span
                className="font-sans text-[10px] font-bold px-2 py-0.5 rounded-full tracking-tight"
                style={{
                  background: hoveredData.status === 'covered'
                    ? 'rgba(16,185,129,0.2)'
                    : 'rgba(255,255,255,0.06)',
                  color: hoveredData.status === 'covered'
                    ? '#6ee7b7'
                    : '#9ca3af',
                }}
              >
                {hoveredData.status === 'covered'
                  ? `${hoveredData.signups.length} Player${hoveredData.signups.length !== 1 ? 's' : ''}`
                  : 'Closed'}
              </span>
            </div>

            {hoveredData.signups.length > 0 ? (
              <div className="space-y-1.5">
                {hoveredData.signups.map((player) => (
                  <div
                    key={player.id}
                    className="p-2 rounded-lg bg-white/[0.03] border border-[#1c1f2e] flex items-center justify-between gap-1.5"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-sans font-bold text-xs text-white truncate">{player.player_name}</span>
                      <AllianceBadge alliance={player.alliance} />
                    </div>
                    <TcBadge level={player.tc_level} />
                  </div>
                ))}
                <p className="font-sans text-[10px] text-slate-400 text-center pt-0.5">
                  Click slot to filter schedule below
                </p>
              </div>
            ) : (
              <div className="py-1 text-center text-xs space-y-0.5">
                <p className="font-sans font-semibold text-slate-400">Unassigned Time Slot</p>
                <p className="font-sans text-[10px] text-slate-500">Public booking is closed</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
