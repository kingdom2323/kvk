import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Download, Search, AlertTriangle, ArrowLeft,
  Crown, ChevronUp, ChevronDown, Loader2, XCircle, Calendar,
  TrendingUp, Users, Pencil, Trash2, Lock, KeyRound,
  LogOut, Save, X, Check, ShieldAlert, UserPlus, CheckCircle2,
  Clock, Eye, EyeOff, Plus, ArrowRightLeft, ChevronRight,
  Filter, UserCheck, Sparkles, Share2, ExternalLink,
} from 'lucide-react'
import { supabase } from './lib/supabase.js'
import { calculateRoiScore } from './lib/roi.js'

// ─── Shared constants ─────────────────────────────────────────────────────────
const ALLIANCES = ['TEA', 'VIK', 'ERA', 'FFF']

const ALLIANCE_CLR = {
  TEA: { border: '#10b981', bg: 'rgba(16,185,129,0.15)',  text: '#6ee7b7' },
  VIK: { border: '#f43f5e', bg: 'rgba(244,63,94,0.15)',   text: '#fda4af' },
  ERA: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  text: '#c4b5fd' },
  FFF: { border: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  text: '#fcd34d' },
}

const TC_LEVELS  = ['25','26','27','28','29','30','TG1','TG2','TG3']
const TC_IS_GOLD = (v) => v?.startsWith('TG')

const KVK_DAYS = [
  { id: 'day1', emoji: '⚒️', label: 'Day 1', sub: 'Construction & Research',
    border: '#4c6ef5', bg: 'rgba(76,110,245,0.13)', text: '#748ffc', glow: '0 0 14px rgba(92,124,250,0.35)' },
  { id: 'day4', emoji: '⚔️', label: 'Day 4', sub: 'Training',
    border: '#f59e0b', bg: 'rgba(245,158,11,0.13)',  text: '#fcd34d', glow: '0 0 14px rgba(245,158,11,0.35)' },
]

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtSpd  = (d, h) => (!d && !h) ? '—' : (d && h) ? `${d}d ${h}h` : d ? `${d}d` : `${h}h`
const fmtGold = (n)    => !n ? '—' : n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n/1_000)}K` : String(n)
const fmtDate = (s)    => new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
const fmtSlot = (v)    => {
  if (!v) return '—'
  const [h, m] = v.split(':').map(Number)
  const eH = m === 30 ? h + 1 : h
  const eM = m === 30 ? 0 : 30
  const p  = (n) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)} – ${eH === 24 ? '24:00' : p(eH)+':'+p(eM)}`
}

const roiStyle = (score) => {
  if (score >= 4000) return { color:'#6ee7b7', bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.3)' }
  if (score >= 1500) return { color:'#fcd34d', bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.3)' }
  return                    { color:'#9ca3af', bg:'rgba(107,114,128,0.10)', border:'rgba(107,114,128,0.2)' }
}

const enrichRoi = (r) => {
  let localOverrides = {}
  try {
    localOverrides = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('kvk_status_overrides') || '{}')
      : {}
  } catch {}

  const d1Key = `${r.id}_day1`
  const d4Key = `${r.id}_day4`
  const legacyDeclined = r.status === 'declined' || localOverrides[r.id] === 'declined'

  // Database column value takes top priority; fallback to local overrides only if DB value is null/undefined
  const status_day1 = (r.status_day1 !== null && r.status_day1 !== undefined)
    ? r.status_day1
    : (localOverrides[d1Key] ?? (legacyDeclined ? 'declined' : 'approved'))

  const status_day4 = (r.status_day4 !== null && r.status_day4 !== undefined)
    ? r.status_day4
    : (localOverrides[d4Key] ?? (legacyDeclined ? 'declined' : 'approved'))

  const hasD1 = (r.selected_days || []).includes('day1')
  const hasD4 = (r.selected_days || []).includes('day4')

  const isD1Active = hasD1 && status_day1 !== 'declined'
  const isD4Active = hasD4 && status_day4 !== 'declined'

  const isD1Declined = hasD1 && status_day1 === 'declined'
  const isD4Declined = hasD4 && status_day4 === 'declined'

  const isFullyDeclined = (hasD1 || hasD4) && (!isD1Active && !isD4Active)
  const isPartiallyDeclined = (hasD1 && hasD4) && ((status_day1 === 'declined') !== (status_day4 === 'declined'))
  const status = isFullyDeclined ? 'declined' : 'approved'

  return {
    ...r,
    status_day1,
    status_day4,
    status,
    hasD1,
    hasD4,
    isD1Active,
    isD4Active,
    isD1Declined,
    isD4Declined,
    isFullyDeclined,
    isPartiallyDeclined,
    _roi: calculateRoiScore({
      tcLevel:           r.tc_level,
      constructionDays:  r.construction_days,  constructionHours: r.construction_hours,
      researchDays:      r.research_days,      researchHours:     r.research_hours,
      trainingDays:      r.training_days,      trainingHours:     r.training_hours,
      trueGold:          r.true_gold_count,
    }),
  }
}

// Build a safe DB payload with strict type coercion — shared by Add + Edit
const buildPayload = (f) => ({
  player_name:        String(f.playerName).trim(),
  alliance:           String(f.alliance),
  selected_days:      Array.isArray(f.selectedDays) ? f.selectedDays : [],
  tc_level:           String(f.tcLevel),
  construction_days:  parseInt(f.constructionDays,  10) || 0,
  construction_hours: parseInt(f.constructionHours, 10) || 0,
  research_days:      parseInt(f.researchDays,      10) || 0,
  research_hours:     parseInt(f.researchHours,     10) || 0,
  training_days:      parseInt(f.trainingDays,      10) || 0,
  training_hours:     parseInt(f.trainingHours,     10) || 0,
  true_gold_count:    parseInt(f.trueGold,          10) || 0,
  time_slot_day1:     f.timeSlotDay1 ? String(f.timeSlotDay1) : null,
  time_slot_day4:     f.timeSlotDay4 ? String(f.timeSlotDay4) : null,
  status_day1:        f.status_day1 ?? 'approved',
  status_day4:        f.status_day4 ?? 'approved',
})

// ─── Conflict detection (declined slots are completely excluded per day) ──────
const buildConflictMap = (rows = []) => {
  const d1 = {}, d4 = {}
  ;(rows || []).forEach(r => {
    // Only active (non-declined) bookings count towards conflict/overlap detection
    const d1Active = r?.status_day1 !== 'declined' && r?.selected_days?.includes('day1') && Boolean(r?.time_slot_day1)
    const d4Active = r?.status_day4 !== 'declined' && r?.selected_days?.includes('day4') && Boolean(r?.time_slot_day4)

    if (d1Active) {
      (d1[r.time_slot_day1] ??= []).push(r.id)
    }
    if (d4Active) {
      (d4[r.time_slot_day4] ??= []).push(r.id)
    }
  })
  const map = new Map()
  const mark = (ids, day) =>
    ids.forEach(id => { const s = map.get(id) ?? new Set(); s.add(day); map.set(id, s) })
  Object.values(d1).filter(ids => ids.length > 1).forEach(ids => mark(ids, 'day1'))
  Object.values(d4).filter(ids => ids.length > 1).forEach(ids => mark(ids, 'day4'))
  return map
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
const exportCsv = (rows, conflictMap) => {
  const hdrs = ['Rank','Player','Alliance','Status','Day 1 Status','Day 4 Status','TC Level','Selected Days','Day 1 Slot','Day 4 Slot',
                'Construction','Research','Training','True Gold','ROI Score','Conflict','Submitted At']
  const body = rows.map((r, i) => [
    i+1, r.player_name, r.alliance,
    r.isFullyDeclined ? 'Declined' : r.isPartiallyDeclined ? 'Partial' : 'Approved',
    (r.selected_days||[]).includes('day1') ? (r.status_day1 || 'approved') : '—',
    (r.selected_days||[]).includes('day4') ? (r.status_day4 || 'approved') : '—',
    r.tc_level,
    (r.selected_days||[]).join(' + '),
    fmtSlot(r.time_slot_day1), fmtSlot(r.time_slot_day4),
    fmtSpd(r.construction_days, r.construction_hours),
    fmtSpd(r.research_days, r.research_hours),
    fmtSpd(r.training_days, r.training_hours),
    r.true_gold_count ?? 0, r._roi ?? 0,
    conflictMap.has(r.id) ? [...conflictMap.get(r.id)].join('+') : '',
    fmtDate(r.created_at),
  ])
  const csv = [hdrs,...body].map(row =>
    row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')
  ).join('\n')
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'),{href:url,download:`kvk-appointments-${new Date().toISOString().slice(0,10)}.csv`})
  a.click(); URL.revokeObjectURL(url)
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col justify-between gap-1 p-3 sm:px-4 sm:py-3 rounded-xl min-w-0 w-full transition-all ${onClick ? 'cursor-pointer hover:border-slate-500 active:scale-98' : ''}`}
      style={{ background:'#0f1117', border:`1px solid ${accent??'#1c1f2e'}` }}>
      <div className="flex items-center gap-1.5 min-w-0" style={{ color:accent??'#6b7280' }}>
        <span className="shrink-0">{icon}</span>
        <span className="truncate" style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</span>
      </div>
      <span className="block font-sans text-xl sm:text-2xl font-bold text-white tracking-tight mt-1 truncate">{value}</span>
    </div>
  )
}

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
      {level}
    </span>
  )
}

function RoiPill({ score }) {
  const s = roiStyle(score??0)
  return (
    <span className="inline-block font-sans font-semibold text-xs sm:text-sm px-2 sm:px-2.5 py-0.5 rounded-lg tabular-nums tracking-tight"
      style={{ color:s.color, background:s.bg, border:`1px solid ${s.border}` }}>
      {(score??0).toLocaleString()}
    </span>
  )
}

function ConflictPill({ conflicts, isD1Declined, isD4Declined }) {
  if (!conflicts || conflicts.size === 0) return <span style={{ color:'#374151' }}>—</span>
  const activeConflicts = [...conflicts].filter(d => (d === 'day1' ? !isD1Declined : !isD4Declined))
  if (activeConflicts.length === 0) return <span style={{ color:'#374151' }}>—</span>
  return (
    <span className="inline-flex items-center gap-1 font-sans font-bold text-xs px-2 py-0.5 rounded-lg"
      style={{ color:'#fcd34d', background:'rgba(245,158,11,0.18)', border:'1px solid rgba(245,158,11,0.4)' }}>
      <AlertTriangle className="w-3 h-3" />
      {activeConflicts.map(d=>d==='day1'?'D1':'D4').join('+')}
    </span>
  )
}

function SortIcon({ col, sort }) {
  if (sort.col!==col) return <ChevronDown className="w-3 h-3 inline ml-1" style={{ color:'#2d3748' }} />
  return sort.dir==='desc'
    ? <ChevronDown className="w-3 h-3 inline ml-1" style={{ color:'#748ffc' }} />
    : <ChevronUp   className="w-3 h-3 inline ml-1" style={{ color:'#748ffc' }} />
}

// ─── Quick Re-assignment Modal ─────────────────────────────────────────────────
function ReassignModal({ slot, day, rows, onReassign, onOpenFullAdd, onClose }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [allianceFilter, setAllianceFilter] = useState('ALL')
  const [submittingId, setSubmittingId] = useState(null)

  const slotField = day === 'day1' ? 'time_slot_day1' : 'time_slot_day4'
  const statusField = day === 'day1' ? 'status_day1' : 'status_day4'
  const dayName   = day === 'day1' ? 'Day 1 (Construction & Research)' : 'Day 4 (Training)'

  // Eligible candidates: all active players signed up for this day
  const candidates = useMemo(() => {
    let list = rows.filter(r => r.selected_days?.includes(day) && r[statusField] !== 'declined')

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(r =>
        r.player_name?.toLowerCase().includes(q) ||
        r.alliance?.toLowerCase().includes(q)
      )
    }

    // Alliance filter
    if (allianceFilter !== 'ALL') {
      list = list.filter(r => r.alliance === allianceFilter)
    }

    // Count occupancy per slot on this day to detect which players currently have conflicts
    const slotCountMap = {}
    rows.forEach(r => {
      if (r[statusField] !== 'declined' && r.selected_days?.includes(day) && r[slotField]) {
        slotCountMap[r[slotField]] = (slotCountMap[r[slotField]] || 0) + 1
      }
    })

    const withMeta = list.map(player => ({
      ...player,
      currentSlot: player[slotField] || null,
      isAlreadyHere: player[slotField] === slot.value,
      hasConflictAtCurrentSlot: (slotCountMap[player[slotField]] || 0) > 1,
    }))

    // Sort: Players with conflicts first (resolving conflicts is high priority), then highest ROI
    withMeta.sort((a, b) => {
      if (a.hasConflictAtCurrentSlot && !b.hasConflictAtCurrentSlot) return -1
      if (!a.hasConflictAtCurrentSlot && b.hasConflictAtCurrentSlot) return 1
      return (b._roi ?? 0) - (a._roi ?? 0)
    })

    return withMeta
  }, [rows, day, searchQuery, allianceFilter, slotField, statusField, slot.value])

  const handleSelectPlayer = async (player) => {
    if (player.isAlreadyHere) return
    setSubmittingId(player.id)
    await onReassign(player, day, slot.value)
    setSubmittingId(null)
    onClose()
  }

  return (
    <Backdrop zIndex={70}>
      <div className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ maxWidth: 560, maxHeight: '90vh', background: '#0f1117',
                 border: '1px solid rgba(76,110,245,0.3)', animation: 'slideUp 0.25s ease-out' }}>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid #1c1f2e', background: 'rgba(18,20,28,0.7)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(76,110,245,0.15)', border: '1px solid rgba(76,110,245,0.35)' }}>
              <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-sans font-bold text-slate-100 text-sm sm:text-base tracking-tight">
                  Assign Slot: {slot.label}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-sans font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  FREE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {dayName} · Re-assign an existing player or create a new booking
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-400 hover:text-white bg-[#12141c]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Alliance Filters */}
        <div className="p-4 border-b border-[#1c1f2e] space-y-3 bg-[#0a0b0f]/60">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search booked player by name or alliance…"
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm font-sans tracking-tight bg-[#0f1117] border border-[#1c1f2e] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-slate-500 mr-1">
                Alliance:
              </span>
              {['ALL', ...ALLIANCES].map(a => (
                <button
                  key={a}
                  onClick={() => setAllianceFilter(a)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-sans font-semibold tracking-tight transition-all ${
                    allianceFilter === a
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-[#0f1117] text-slate-400 border border-[#1c1f2e] hover:text-slate-200'
                  }`}>
                  {a}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-sans text-slate-400">
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Candidate List & Action Body */}
        <div className="overflow-y-auto p-4 space-y-2.5 flex-1 max-h-[50vh]">

          {/* Create new player shortcut card */}
          <div
            onClick={() => {
              onClose()
              onOpenFullAdd(day, slot.value)
            }}
            className="p-3 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/15 hover:border-emerald-500/70 cursor-pointer transition-all flex items-center justify-between group active:scale-[0.99]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <p className="font-sans text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                  + Create & Book a Brand New Player
                </p>
                <p className="font-sans text-[11px] text-slate-400 tracking-tight">
                  Opens full form with {slot.value} UTC pre-selected
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
          </div>

          <div className="pt-2 pb-1 flex items-center justify-between text-[11px] font-sans font-semibold uppercase tracking-wider text-slate-500">
            <span>Or Re-Assign Existing Booked Player:</span>
            <span>Conflict players prioritized</span>
          </div>

          {candidates.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No booked players match the search criteria for {day === 'day1' ? 'Day 1' : 'Day 4'}.
            </div>
          ) : (
            candidates.map(player => {
              const isSubmitting = submittingId === player.id
              return (
                <div
                  key={player.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    player.hasConflictAtCurrentSlot
                      ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60'
                      : 'bg-[#0a0b0f] border-[#1c1f2e] hover:border-slate-700'
                  }`}>
                  <div className="flex items-start sm:items-center gap-2.5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {player.hasConflictAtCurrentSlot && (
                          <span title="Currently in a conflict slot — reassigning fixes the conflict!"
                            className="flex items-center gap-1 text-[10px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Overlap
                          </span>
                        )}
                        <span className="font-sans font-bold text-xs sm:text-sm text-slate-100">
                          {player.player_name}
                        </span>
                        <AllianceBadge alliance={player.alliance} />
                        <TcBadge level={player.tc_level} />
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[11px] font-sans text-slate-400">
                        <span>
                          Current: <strong className={player.hasConflictAtCurrentSlot ? 'text-amber-300' : 'text-slate-300'}>
                            {player.currentSlot ? `${player.currentSlot} UTC` : 'None'}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>TG: {fmtGold(player.true_gold_count)}</span>
                        <span>·</span>
                        <span className="text-slate-500">
                          {fmtSpd(player.construction_days, player.construction_hours)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#1c1f2e]/60">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-sans text-slate-500">ROI:</span>
                      <RoiPill score={player._roi} />
                    </div>

                    <button
                      onClick={() => handleSelectPlayer(player)}
                      disabled={isSubmitting || player.isAlreadyHere}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-bold tracking-tight transition-all active:scale-95 disabled:opacity-50 ${
                        player.hasConflictAtCurrentSlot
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 shadow-sm'
                          : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30'
                      }`}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Moving…</span>
                        </>
                      ) : player.isAlreadyHere ? (
                        <span>Current Slot</span>
                      ) : (
                        <>
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Move Here</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#1c1f2e] bg-[#0a0b0f] flex items-center justify-between text-xs text-slate-500">
          <span>Clicking 'Move Here' instantly updates both schedule and database</span>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[#1c1f2e] hover:bg-[#2a2d3a] text-slate-300 font-sans font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ─── Slot Coverage Visualizer / Heatmap ───────────────────────────────────────
function SlotCoverageVisualizer({
  rows,
  activeDay,
  setActiveDay,
  hideCovered,
  setHideCovered,
  selectedSlotFilter,
  setSelectedSlotFilter,
  onOpenReassign,
  onSharePublic,
  onPreviewPublic,
}) {
  const [hoveredData, setHoveredData] = useState(null)

  // Map each slot value to list of signups for this day (declined appointments excluded for active day)
  const slotData = useMemo(() => {
    const safeRows = rows || []
    const slotField = activeDay === 'day1' ? 'time_slot_day1' : 'time_slot_day4'
    const statusField = activeDay === 'day1' ? 'status_day1' : 'status_day4'

    return TIME_SLOTS.map(slot => {
      const signups = safeRows.filter(r =>
        r?.[statusField] !== 'declined' &&
        r?.selected_days?.includes(activeDay) && r[slotField] === slot.value
      ).sort((a, b) => (b?._roi ?? 0) - (a?._roi ?? 0)) // sort by highest ROI

      const count = signups.length
      const status = count === 0 ? 'unclaimed' : count === 1 ? 'covered' : 'conflict'
      return { slot, signups, count, status }
    })
  }, [rows, activeDay])

  // Coverage statistics for active day
  const totalSlots     = 48
  const coveredSlots   = useMemo(() => (slotData || []).filter(s => s.count >= 1).length, [slotData])
  const unclaimedSlots = useMemo(() => (slotData || []).filter(s => s.count === 0).length, [slotData])
  const conflictSlots  = useMemo(() => (slotData || []).filter(s => s.count >= 2).length, [slotData])
  const coveragePct    = Math.round((coveredSlots / totalSlots) * 100)

  // Filter slots if 'Hide Covered Slots' toggle is active
  const displayedSlots = useMemo(() => {
    if (!slotData) return []
    if (hideCovered) {
      return slotData.filter(s => s.status === 'unclaimed')
    }
    return slotData
  }, [slotData, hideCovered])

  // Count unclaimed for both days to display in tab buttons
  const d1UnclaimedCount = useMemo(() => {
    const claimed = new Set()
    ;(rows || []).forEach(r => {
      if (r?.status_day1 !== 'declined' && r?.selected_days?.includes('day1') && r?.time_slot_day1) claimed.add(r.time_slot_day1)
    })
    return 48 - claimed.size
  }, [rows])

  const d4UnclaimedCount = useMemo(() => {
    const claimed = new Set()
    ;(rows || []).forEach(r => {
      if (r?.status_day4 !== 'declined' && r?.selected_days?.includes('day4') && r?.time_slot_day4) claimed.add(r.time_slot_day4)
    })
    return 48 - claimed.size
  }, [rows])

  const handleCellHover = (e, slot, signups, status) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoveredData({ slot, signups, status, rect })
  }

  const handleCellLeave = () => {
    setHoveredData(null)
  }

  const handleCellClick = (slot, status) => {
    if (status === 'unclaimed') {
      // Open quick re-assignment modal
      onOpenReassign(slot)
    } else {
      // Toggle table slot filter: clicking an occupied slot filters the table to those players
      if (selectedSlotFilter === slot.value) {
        setSelectedSlotFilter(null)
      } else {
        setSelectedSlotFilter(slot.value)
      }
    }
  }

  return (
    <div className="rounded-2xl p-3 sm:p-5 space-y-4"
      style={{ background: '#0f1117', border: '1px solid #1c1f2e', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>

      {/* Visualizer Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(76, 110, 245, 0.15)', border: '1px solid rgba(76, 110, 245, 0.35)' }}>
            <Clock className="w-4 h-4" style={{ color: '#748ffc' }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-sans font-bold text-white text-sm sm:text-base tracking-tight">
                Slot Coverage Visualizer
              </h3>
              <span className="font-sans text-xs px-2.5 py-0.5 rounded-full font-bold tracking-tight"
                style={{
                  background: coveragePct >= 80 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: coveragePct >= 80 ? '#6ee7b7' : '#fcd34d',
                  border: `1px solid ${coveragePct >= 80 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}>
                {coveragePct}% Covered ({coveredSlots}/{totalSlots})
              </span>
            </div>
            <p className="font-sans text-[11px] text-slate-400 mt-0.5 tracking-tight">
              24h UTC Ministry timeline · 30-min intervals · Click empty slot to re-assign/book · Click covered slot to filter table
            </p>
          </div>
        </div>

        {/* Day switch & Hide Covered toggle */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
          {/* Day 1 vs Day 4 Switch (acts as global sync) */}
          <div className="flex items-center p-1 rounded-xl flex-1 sm:flex-none justify-center"
            style={{ background: '#0a0b0f', border: '1px solid #1c1f2e' }}>
            <button
              onClick={() => setActiveDay('day1')}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-xs font-bold tracking-tight transition-all"
              style={activeDay === 'day1'
                ? { background: 'rgba(76, 110, 245, 0.22)', color: '#748ffc', border: '1px solid rgba(76, 110, 245, 0.45)', boxShadow: '0 0 12px rgba(92,124,250,0.25)' }
                : { color: '#6b7280', border: '1px solid transparent' }}
            >
              <span>⚒️</span>
              <span>Day 1</span>
              <span className="font-sans text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-tight"
                style={{ background: 'rgba(0,0,0,0.4)', color: activeDay === 'day1' ? '#a5b4fc' : '#6b7280' }}>
                {d1UnclaimedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveDay('day4')}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-xs font-bold tracking-tight transition-all"
              style={activeDay === 'day4'
                ? { background: 'rgba(245, 158, 11, 0.22)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.45)', boxShadow: '0 0 12px rgba(245,158,11,0.25)' }
                : { color: '#6b7280', border: '1px solid transparent' }}
            >
              <span>⚔️</span>
              <span>Day 4</span>
              <span className="font-sans text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-tight"
                style={{ background: 'rgba(0,0,0,0.4)', color: activeDay === 'day4' ? '#fde68a' : '#6b7280' }}>
                {d4UnclaimedCount}
              </span>
            </button>
          </div>

          {/* Hide Covered Slots Toggle */}
          <button
            onClick={() => setHideCovered(p => !p)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-sans text-xs font-semibold tracking-tight transition-all active:scale-95"
            style={hideCovered
              ? { background: 'rgba(244, 63, 94, 0.16)', border: '1px solid rgba(244, 63, 94, 0.45)', color: '#fda4af' }
              : { background: '#0a0b0f', border: '1px solid #1c1f2e', color: '#9ca3af' }}
          >
            {hideCovered ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{hideCovered ? 'Showing Free Only' : 'Hide Covered'}</span>
            <span className="sm:hidden">{hideCovered ? 'Free Only' : 'Hide'}</span>
            {hideCovered && (
              <span className="font-sans text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-tight"
                style={{ background: 'rgba(244, 63, 94, 0.3)', color: '#fff' }}>
                {unclaimedSlots}
              </span>
            )}
          </button>

          {/* Share Public Link & Preview */}
          <button
            onClick={onSharePublic}
            title="Copy public read-only schedule URL to clipboard"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-sans text-xs font-semibold tracking-tight transition-all active:scale-95 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/35 text-indigo-300">
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share Schedule</span>
            <span className="sm:hidden">Share</span>
          </button>

          <button
            onClick={onPreviewPublic}
            title="Open public schedule page in a new tab"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-sans text-xs font-semibold tracking-tight transition-all active:scale-95 bg-[#0a0b0f] hover:bg-[#12141c] border border-[#1c1f2e] text-slate-400 hover:text-white">
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
        </div>
      </div>

      {/* Legend & Summary Info */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#1c1f2e]/70 text-xs">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded shrink-0"
              style={{ background: 'rgba(244,63,94,0.06)', border: '1px dashed rgba(244,63,94,0.55)' }} />
            <span className="font-sans text-[11px] text-slate-400">
              Free: <strong className="text-rose-400">{unclaimedSlots}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded shrink-0"
              style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.55)' }} />
            <span className="font-sans text-[11px] text-slate-400">
              Covered: <strong className="text-emerald-400">{coveredSlots - conflictSlots}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded shrink-0"
              style={{ background: 'rgba(245,158,11,0.25)', border: '1px solid rgba(245,158,11,0.65)' }} />
            <span className="font-sans text-[11px] text-slate-400">
              Conflict: <strong className="text-amber-400">{conflictSlots}</strong>
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
          <span className="shrink-0">{displayedSlots.length} of {totalSlots} slots</span>
        </div>
      </div>

      {/* Heatmap Grid: 2-col on mobile, 3-col on sm, 4-col on md, 6-col on lg, 8-col on xl, 12-col on 2xl */}
      {displayedSlots.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-center"
          style={{ background: '#0a0b0f', border: '1px dashed #1c1f2e', borderRadius: 16 }}>
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          <p className="font-sans text-sm font-bold text-white tracking-tight">Full 100% Slot Coverage!</p>
          <p className="font-sans text-xs text-slate-400">Every single 30-min time slot is claimed for {activeDay === 'day1' ? 'Day 1' : 'Day 4'}.</p>
          <button
            onClick={() => setHideCovered(false)}
            className="font-sans text-xs mt-2 underline text-indigo-400 hover:text-indigo-300">
            Show all slots
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-12 gap-2">
          {displayedSlots.map(({ slot, signups, count, status }) => {
            const isUnclaimed = status === 'unclaimed'
            const isCovered   = status === 'covered'
            const isConflict  = status === 'conflict'
            const isSelected  = selectedSlotFilter === slot.value

            let borderStyle, bgStyle, glowStyle
            if (isSelected) {
              borderStyle = '2px solid #818cf8'
              bgStyle     = 'rgba(99, 102, 241, 0.25)'
              glowStyle   = '0 0 16px rgba(129, 140, 248, 0.4)'
            } else if (isUnclaimed) {
              borderStyle = '1px dashed rgba(244, 63, 94, 0.45)'
              bgStyle     = 'rgba(244, 63, 94, 0.04)'
              glowStyle   = 'none'
            } else if (isCovered) {
              borderStyle = '1px solid rgba(16, 185, 129, 0.4)'
              bgStyle     = 'rgba(16, 185, 129, 0.12)'
              glowStyle   = '0 0 10px rgba(16, 185, 129, 0.08)'
            } else {
              borderStyle = '1px solid rgba(245, 158, 11, 0.65)'
              bgStyle     = 'rgba(245, 158, 11, 0.18)'
              glowStyle   = '0 0 14px rgba(245, 158, 11, 0.18)'
            }

            const topPlayer = signups[0]

            return (
              <div
                key={slot.value}
                onClick={() => handleCellClick(slot, status)}
                onMouseEnter={(e) => handleCellHover(e, slot, signups, status)}
                onMouseLeave={handleCellLeave}
                className={`group relative flex flex-col justify-between p-2 sm:p-2.5 rounded-xl transition-all select-none cursor-pointer min-w-0 ${
                  isUnclaimed
                    ? 'hover:border-rose-400 hover:bg-rose-950/25 active:scale-95'
                    : isSelected
                      ? 'scale-102 ring-1 ring-indigo-400'
                      : 'hover:border-indigo-400/80 hover:bg-slate-800/40 active:scale-98'
                }`}
                style={{
                  border: borderStyle,
                  background: bgStyle,
                  boxShadow: glowStyle,
                  minHeight: 64,
                }}
              >
                {/* Top line: Sleek Typography Time Label & Indicator */}
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className={`font-sans text-xs font-semibold tracking-tight transition-colors truncate ${
                    isSelected ? 'text-white font-bold' : 'text-slate-200 group-hover:text-white'
                  }`}>
                    {slot.value}
                  </span>
                  {isConflict && (
                    <span className="flex items-center gap-0.5 font-sans text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0"
                      style={{ background: 'rgba(245,158,11,0.25)', color: '#fcd34d' }}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {count}
                    </span>
                  )}
                  {isCovered && (
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                  )}
                  {isUnclaimed && (
                    <span className="font-sans text-[10px] text-rose-400 font-bold tracking-wide uppercase group-hover:text-rose-300 shrink-0">
                      FREE
                    </span>
                  )}
                </div>

                {/* Bottom line: Content */}
                <div className="mt-1 min-w-0">
                  {isUnclaimed ? (
                    <div className="flex items-center gap-1 font-sans text-[10px] text-rose-300/80 group-hover:text-rose-200 min-w-0">
                      <Plus className="w-3 h-3 shrink-0" />
                      <span className="font-semibold tracking-tight truncate min-w-0">Assign</span>
                    </div>
                  ) : (
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <span className="font-sans text-xs font-semibold text-slate-100 truncate min-w-0 flex-1 tracking-tight">
                          {topPlayer?.player_name}
                        </span>
                        <span className="font-sans text-[10px] font-semibold text-emerald-400 shrink-0 tracking-tight">
                          {topPlayer?._roi ? fmtGold(topPlayer._roi) : '—'}
                        </span>
                      </div>
                      {isConflict && (
                        <span className="font-sans text-[9px] text-amber-300/90 font-medium truncate tracking-tight">
                          +{count - 1} overlap
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Hover Tooltip (Portaled / Absolute viewport position) */}
      {hoveredData && (
        <div
          className="fixed z-[100] pointer-events-none transition-opacity duration-150"
          style={{
            left: Math.min(
              Math.max(12, hoveredData.rect.left + hoveredData.rect.width / 2 - 140),
              (typeof window !== 'undefined' ? window.innerWidth : 360) - 292
            ),
            top: hoveredData.rect.top - 12 > 160
              ? hoveredData.rect.top - 8
              : hoveredData.rect.bottom + 8,
            transform: hoveredData.rect.top - 12 > 160 ? 'translateY(-100%)' : 'none',
            maxWidth: 'calc(100vw - 24px)',
            width: 280,
          }}
        >
          <div
            className="p-3 rounded-xl shadow-2xl backdrop-blur-md"
            style={{
              background: 'rgba(15, 17, 23, 0.97)',
              border: hoveredData.status === 'conflict'
                ? '1px solid rgba(245, 158, 11, 0.55)'
                : hoveredData.status === 'covered'
                  ? '1px solid rgba(16, 185, 129, 0.45)'
                  : '1px solid rgba(244, 63, 94, 0.45)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.85)',
            }}
          >
            {/* Tooltip Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1c1f2e]">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: '#748ffc' }} />
                <span className="font-sans font-semibold tracking-tight text-xs text-slate-100">
                  {hoveredData.slot.label}
                </span>
              </div>
              <span
                className="font-sans text-[10px] font-bold px-2 py-0.5 rounded-full tracking-tight"
                style={{
                  background: hoveredData.status === 'conflict'
                    ? 'rgba(245,158,11,0.22)'
                    : hoveredData.status === 'covered'
                      ? 'rgba(16,185,129,0.2)'
                      : 'rgba(244,63,94,0.18)',
                  color: hoveredData.status === 'conflict'
                    ? '#fcd34d'
                    : hoveredData.status === 'covered'
                      ? '#6ee7b7'
                      : '#fda4af',
                }}
              >
                {hoveredData.status === 'conflict'
                  ? `⚠️ ${hoveredData.signups.length} Conflicts`
                  : hoveredData.status === 'covered'
                    ? '1 Booking'
                    : 'Unclaimed'}
              </span>
            </div>

            {/* Tooltip Content */}
            {hoveredData.signups.length > 0 ? (
              <div className="space-y-2">
                {hoveredData.signups.map((player, idx) => (
                  <div
                    key={player.id}
                    className="p-2 rounded-lg"
                    style={{
                      background: idx === 0 && hoveredData.status === 'conflict'
                        ? 'rgba(16,185,129,0.08)'
                        : 'rgba(255,255,255,0.03)',
                      border: idx === 0 && hoveredData.status === 'conflict'
                        ? '1px solid rgba(16,185,129,0.3)'
                        : '1px solid #1c1f2e',
                    }}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        {idx === 0 && hoveredData.status === 'conflict' && (
                          <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                        )}
                        <span className="font-sans font-bold text-xs text-white truncate">{player.player_name}</span>
                        <AllianceBadge alliance={player.alliance} />
                      </div>
                      <RoiPill score={player._roi} />
                    </div>
                    <div className="flex items-center justify-between font-sans text-[10px] text-slate-400 pt-1 border-t border-[#1c1f2e]/40">
                      <span>TC {player.tc_level}</span>
                      <span>
                        {fmtSpd(player.construction_days, player.construction_hours)} /{' '}
                        {fmtSpd(player.research_days, player.research_hours)}
                      </span>
                      <span className="text-amber-300 font-semibold">
                        TG: {fmtGold(player.true_gold_count)}
                      </span>
                    </div>
                  </div>
                ))}
                {hoveredData.status === 'conflict' && (
                  <p className="font-sans text-[10px] text-amber-300/90 italic text-center pt-0.5">
                    👑 Ranked by ROI score · highest recommended
                  </p>
                )}
                <p className="font-sans text-[10px] text-indigo-400/80 text-center pt-0.5">
                  Click slot to filter table below
                </p>
              </div>
            ) : (
              <div className="py-2 text-center text-xs">
                <p className="font-sans font-semibold text-rose-300">Unclaimed Time Slot</p>
                <p className="font-sans text-[10px] text-slate-400 mt-0.5">Click to re-assign or book a player</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Admin Toast ──────────────────────────────────────────────────────────────
function AdminToast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onClose, 3400)
    return () => clearTimeout(id)
  }, [toast, onClose])

  if (!toast) return null
  const ok = toast.type === 'success'
  return (
    <div className="fixed bottom-6 right-6 z-[80]"
      style={{ animation:'toastSlide 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}>
      <div className="flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl"
        style={{ background: ok ? 'rgba(6,78,59,0.97)' : 'rgba(69,10,10,0.97)',
                 border: `1px solid ${ok?'rgba(16,185,129,0.45)':'rgba(244,63,94,0.45)'}`,
                 boxShadow:'0 8px 36px rgba(0,0,0,0.55)', backdropFilter:'blur(12px)' }}>
        {ok
          ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color:'#6ee7b7' }} />
          : <XCircle      className="w-4 h-4 shrink-0" style={{ color:'#fda4af' }} />}
        <p className="font-sans text-sm font-semibold text-white pr-1 tracking-tight">{toast.msg}</p>
        <button onClick={onClose} className="shrink-0 transition-colors text-slate-400 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Backdrop ─────────────────────────────────────────────────────────────────
function Backdrop({ children, zIndex=50 }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background:'rgba(0,0,0,0.8)', backdropFilter:'blur(10px)',
               zIndex, animation:'fadeIn 0.18s ease-out' }}>
      {children}
    </div>
  )
}

// ─── Login Modal ──────────────────────────────────────────────────────────────
function LoginModal({ onSuccess }) {
  const navigate = useNavigate()
  const [pw,    setPw]    = useState('')
  const [err,   setErr]   = useState('')
  const [shake, setShake] = useState(false)
  const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD

  const attempt = (e) => {
    e.preventDefault()
    if (!ADMIN_PW) { console.warn('[Admin] No VITE_ADMIN_PASSWORD — access granted.'); onSuccess(); return }
    if (pw === ADMIN_PW) { onSuccess() }
    else {
      setErr('Incorrect passcode. Try again.')
      setPw(''); setShake(true)
      setTimeout(() => setShake(false), 450)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5"
      style={{ background:'#0a0b0f', animation:'fadeIn 0.2s ease-out' }}>
      <div className="w-full" style={{ maxWidth:360 }}>
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background:'rgba(76,110,245,0.15)', border:'1px solid rgba(76,110,245,0.35)',
                     boxShadow:'0 0 32px rgba(92,124,250,0.2)', animation:'subtleGlow 3s ease-in-out infinite' }}>
            <ShieldAlert className="w-8 h-8" style={{ color:'#748ffc' }} />
          </div>
          <div className="text-center">
            <h1 className="font-sans text-xl font-bold text-white tracking-tight">Ministry Admin</h1>
            <p className="font-sans text-xs text-slate-400 mt-1">2323 KvK · R4 Access Only</p>
          </div>
        </div>
        <form onSubmit={attempt} className="rounded-2xl p-6 space-y-4"
          style={{ background:'#0f1117', border:'1px solid #1c1f2e', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
                   animation:shake?'shake 0.4s ease-out':'slideUp 0.3s ease-out' }}>
          <div className="space-y-1.5">
            <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }}>
              R4 Passcode
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color:'#374151' }} />
              <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr('')}}
                placeholder="Enter passcode…" autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-xl font-sans text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1"
                style={{ background:'#0a0b0f', border:`1px solid ${err?'#f43f5e66':'#1c1f2e'}`, fontSize:16, '--tw-ring-color':'rgba(92,124,250,0.3)' }} />
            </div>
            {err && (
              <p className="flex items-center gap-1.5 text-xs" style={{ color:'#f43f5e', animation:'fadeIn 0.15s' }}>
                <XCircle className="w-3.5 h-3.5 shrink-0" />{err}
              </p>
            )}
          </div>
          <button type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-sans font-bold text-white transition-all active:scale-95 tracking-tight"
            style={{ background:'linear-gradient(135deg,#4c6ef5,#5c7cfa)', boxShadow:'0 0 24px rgba(92,124,250,0.35)', fontSize:14 }}>
            <KeyRound className="w-4 h-4" />Enter Admin Dashboard
          </button>
          <button type="button" onClick={() => navigate('/schedule')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-sans text-sm transition-all text-slate-500 hover:text-slate-300"
            style={{ background:'transparent', border:'1px solid #1c1f2e' }}>
            <ArrowLeft className="w-3.5 h-3.5" />Back to Public Schedule
          </button>
        </form>
        <p className="text-center mt-4 font-sans" style={{ fontSize:10, color:'#2d3748' }}>
          Session-scoped · VITE_ADMIN_PASSWORD
        </p>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteModal({ row, loading, onConfirm, onCancel }) {
  return (
    <Backdrop zIndex={60}>
      <div className="w-full rounded-2xl p-6 space-y-5"
        style={{ maxWidth:360, background:'#0f1117', border:'1px solid rgba(244,63,94,0.25)',
                 boxShadow:'0 24px 64px rgba(0,0,0,0.7)', animation:'slideUp 0.25s ease-out' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background:'rgba(244,63,94,0.15)', border:'1px solid rgba(244,63,94,0.3)' }}>
            <Trash2 className="w-5 h-5" style={{ color:'#f43f5e' }} />
          </div>
          <div>
            <h3 className="font-sans font-bold text-white text-sm">Delete Booking?</h3>
            <p className="font-sans text-xs text-slate-400 mt-1">
              {row.player_name} · <AllianceBadge alliance={row.alliance} />
            </p>
          </div>
        </div>
        <p className="font-sans text-xs text-slate-400 leading-relaxed">
          This will permanently remove this appointment. This action cannot be undone.
        </p>
        <div className="flex gap-2.5">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl font-sans text-sm font-semibold text-slate-400 bg-[#1c1f2e] border border-[#2a2d3a] hover:text-white">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-sans text-sm font-bold transition-all active:scale-95 disabled:opacity-60"
            style={{ background:'rgba(244,63,94,0.2)', border:'1px solid rgba(244,63,94,0.4)', color:'#fda4af' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ─── Booking Modal (shared by Add & Edit) ────────────────────────────────────
function BookingModal({ mode = 'edit', row = null, prefill = null, onSave, onClose, saving }) {
  const isAdd = mode === 'add'

  const [f, setF] = useState(() => ({
    playerName:        isAdd ? '' : (row?.player_name ?? ''),
    alliance:          isAdd ? '' : (row?.alliance ?? ''),
    selectedDays:      isAdd
      ? (prefill?.day ? [prefill.day] : [])
      : (row?.selected_days ?? []),
    tcLevel:           isAdd ? '' : (row?.tc_level ?? ''),
    constructionDays:  isAdd ? 0 : (row?.construction_days ?? 0),
    constructionHours: isAdd ? 0 : (row?.construction_hours ?? 0),
    researchDays:      isAdd ? 0 : (row?.research_days ?? 0),
    researchHours:     isAdd ? 0 : (row?.research_hours ?? 0),
    trainingDays:      isAdd ? 0 : (row?.training_days ?? 0),
    trainingHours:     isAdd ? 0 : (row?.training_hours ?? 0),
    trueGold:          isAdd ? '' : (row?.true_gold_count ?? ''),
    timeSlotDay1:      isAdd
      ? (prefill?.day === 'day1' ? prefill.slot : '')
      : (row?.time_slot_day1 ?? ''),
    timeSlotDay4:      isAdd
      ? (prefill?.day === 'day4' ? prefill.slot : '')
      : (row?.time_slot_day4 ?? ''),
  }))

  const set  = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const setE = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const toggleDay = (id) =>
    setF(p => ({
      ...p,
      selectedDays: p.selectedDays.includes(id)
        ? p.selectedDays.filter(d => d !== id)
        : [...p.selectedDays, id],
    }))

  // Accent colours: emerald for Add, indigo for Edit
  const accent     = isAdd ? '#10b981' : '#4c6ef5'
  const accentText = isAdd ? '#6ee7b7' : '#748ffc'
  const accentBg   = isAdd ? 'rgba(16,185,129,0.15)' : 'rgba(76,110,245,0.15)'
  const accentGlow = isAdd ? 'rgba(16,185,129,0.4)'  : 'rgba(92,124,250,0.4)'
  const btnGrad    = isAdd
    ? 'linear-gradient(135deg,#059669,#10b981)'
    : 'linear-gradient(135deg,#4c6ef5,#5c7cfa)'

  const lbl = { fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em' }
  const inp = { background:'#0a0b0f', border:'1px solid #1c1f2e', color:'#e2e8f0',
                borderRadius:10, padding:'8px 12px', fontSize:14, outline:'none', width:'100%' }

  return (
    <Backdrop zIndex={60}>
      <div className="w-full flex flex-col rounded-2xl overflow-hidden"
        style={{ maxWidth:520, maxHeight:'92vh', background:'#0f1117',
                 border:`1px solid ${accent}40`,
                 boxShadow:'0 24px 64px rgba(0,0,0,0.7)', animation:'slideUp 0.28s ease-out' }}>

        {/* Accent bar */}
        <div className="h-0.5 w-full shrink-0"
          style={{ background:`linear-gradient(90deg,${accent},${accentText},transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom:'1px solid #1c1f2e', background:'rgba(18,20,28,0.7)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background:accentBg, border:`1px solid ${accent}50` }}>
              {isAdd
                ? <UserPlus className="w-4 h-4" style={{ color:accentText }} />
                : <Pencil   className="w-4 h-4" style={{ color:accentText }} />}
            </div>
            <div>
              <h2 className="font-sans font-bold text-white text-sm">{isAdd ? 'Add Player' : 'Edit Booking'}</h2>
              <p className="font-sans text-xs text-slate-400">
                {isAdd
                  ? prefill?.slot
                    ? `Manual entry · pre-selected ${prefill.day === 'day1' ? 'Day 1' : 'Day 4'} (${prefill.slot} UTC)`
                    : 'Manual entry · no Discord notification'
                  : `${row?.player_name} · ${row?.alliance}`}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-400 hover:text-white bg-[#12141c]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="overflow-y-auto p-5 space-y-5 flex-1">

          {/* Player Name */}
          <div className="space-y-1.5">
            <p style={lbl}>Player Name</p>
            <input type="text" value={f.playerName} onChange={setE('playerName')}
              placeholder="In-game name…" style={inp} />
          </div>

          {/* Alliance */}
          <div className="space-y-1.5">
            <p style={lbl}>Alliance</p>
            <div className="grid grid-cols-4 gap-2">
              {ALLIANCES.map(a => {
                const s = ALLIANCE_CLR[a]; const sel = f.alliance === a
                return (
                  <button key={a} type="button" onClick={() => set('alliance')(a)}
                    className="py-2.5 rounded-xl font-sans font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
                    style={sel
                      ?{border:`1.5px solid ${s.border}`,background:s.bg,color:s.text,boxShadow:`0 0 10px ${s.border}44`}
                      :{border:'1.5px solid #1c1f2e',background:'#0a0b0f',color:'#4b5563'}}>
                    {a}
                  </button>
                )
              })}
            </div>
          </div>

          {/* KvK Days */}
          <div className="space-y-1.5">
            <p style={lbl}>KvK Prep Days</p>
            <div className="grid grid-cols-2 gap-2.5">
              {KVK_DAYS.map(d => {
                const sel = f.selectedDays.includes(d.id)
                return (
                  <button key={d.id} type="button" onClick={() => toggleDay(d.id)}
                    className="relative flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all active:scale-97"
                    style={sel
                      ?{border:`1.5px solid ${d.border}`,background:d.bg,boxShadow:d.glow}
                      :{border:'1.5px solid #1c1f2e',background:'#0a0b0f'}}>
                    <span className="flex items-center justify-center rounded-full shrink-0"
                      style={{ width:16, height:16, background:sel?d.border:'transparent', border:sel?'none':'1.5px solid #2a2d4a' }}>
                      {sel && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span style={{ fontSize:15 }}>{d.emoji}</span>
                    <div className="text-left">
                      <p className="font-sans text-xs font-bold leading-tight" style={{ color:sel?d.text:'#6b7280' }}>{d.label}</p>
                      <p className="font-sans text-[10px]" style={{ color:sel?d.text:'#374151', lineHeight:1.3 }}>{d.sub}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* TC Level */}
          <div className="space-y-1.5">
            <p style={lbl}>TC Level</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TC_LEVELS.map(lvl => {
                const gold = TC_IS_GOLD(lvl); const sel = f.tcLevel === lvl
                const aC   = gold ? '#f59e0b' : '#4c6ef5'
                return (
                  <button key={lvl} type="button" onClick={() => set('tcLevel')(lvl)}
                    className="py-2.5 rounded-xl font-sans font-bold text-sm transition-all active:scale-95"
                    style={sel
                      ?{border:`1.5px solid ${aC}`,background:gold?'rgba(245,158,11,0.14)':'rgba(76,110,245,0.14)',
                        color:gold?'#fcd34d':'#748ffc',boxShadow:`0 0 10px ${aC}55`}
                      :{border:`1.5px solid ${gold?'rgba(245,158,11,0.22)':'#1c1f2e'}`,
                        background:gold?'rgba(245,158,11,0.04)':'#0a0b0f',
                        color:gold?'rgba(245,158,11,0.5)':'#374151'}}>
                    {lvl}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Speedups */}
          <div className="space-y-3">
            <p style={lbl}>Speedups (Days / Hours)</p>
            {[['🔨','Construction','constructionDays','constructionHours'],
              ['🧪','Research',    'researchDays',    'researchHours'   ],
              ['⚔️','Training',    'trainingDays',    'trainingHours'   ],
            ].map(([icon,label,dKey,hKey]) => (
              <div key={label} className="flex items-center gap-3">
                <span style={{ width:22, textAlign:'center', fontSize:14, flexShrink:0 }}>{icon}</span>
                <span className="font-sans text-xs font-semibold text-slate-400" style={{ width:82, flexShrink:0 }}>{label}</span>
                <div className="flex gap-2 flex-1">
                  {[['Days', dKey, 999], ['Hours', hKey, 23]].map(([unit, key, max]) => (
                    <div key={key} className="flex-1">
                      <input type="number" min="0" max={max} value={f[key]}
                        onChange={e => set(key)(parseInt(e.target.value,10)||0)}
                        style={{ ...inp, textAlign:'center', appearance:'textfield' }} />
                      <p style={{ fontSize:9, color:'#374151', textAlign:'center', marginTop:2, fontWeight:700, textTransform:'uppercase' }}>{unit}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* True Gold */}
          <div className="space-y-1.5">
            <p style={lbl}>True Gold Count</p>
            <input type="number" min="0" value={f.trueGold}
              onChange={setE('trueGold')} placeholder="e.g. 250000" style={inp} />
          </div>

          {/* Time Slots */}
          {(f.selectedDays.includes('day1') || f.selectedDays.includes('day4')) && (
            <div className="space-y-3">
              <p style={lbl}>Time Slots (UTC)</p>
              {[['day1','⚒️ Day 1 Slot','#748ffc','timeSlotDay1'],
                ['day4','⚔️ Day 4 Slot','#fcd34d','timeSlotDay4']
              ].filter(([id]) => f.selectedDays.includes(id)).map(([,label,color,key]) => (
                <div key={key} className="space-y-1">
                  <p className="font-sans text-xs font-bold" style={{ color }}>{label}</p>
                  <div className="relative">
                    <select value={f[key]} onChange={setE(key)} dir="ltr"
                      className="font-sans text-sm tracking-tight"
                      style={{ ...inp, paddingRight:36, appearance:'none', cursor:'pointer' }}>
                      <option value="">Select a slot…</option>
                      {TIME_SLOTS.map(s => <option key={s.value} value={s.value} style={{ background:'#0f1117' }}>{s.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-slate-500" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 py-4 shrink-0"
          style={{ borderTop:'1px solid #1c1f2e', background:'rgba(10,11,15,0.5)' }}>
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-3 rounded-xl font-sans text-sm font-semibold transition-all text-slate-400 bg-[#1c1f2e] border border-[#2a2d3a] hover:text-white">
            Cancel
          </button>
          <button onClick={() => onSave(f)} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-sans font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60 tracking-tight"
            style={{ background:saving?'#1c1f2e':btnGrad,
                     boxShadow:saving?'none':`0 0 24px ${accentGlow}55`, fontSize:14 }}>
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : isAdd ? <UserPlus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? (isAdd?'Adding…':'Saving…') : isAdd ? 'Add to Dashboard' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
export default function Admin() {
  const navigate = useNavigate()

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem('kvk_admin_auth') === 'true')
  const login  = () => { sessionStorage.setItem('kvk_admin_auth','true');  setIsAuthed(true)  }
  const logout = () => { sessionStorage.removeItem('kvk_admin_auth');       setIsAuthed(false) }

  // ── Data ──────────────────────────────────────────────────────────────────────
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // ── Global Filter & Sync States ───────────────────────────────────────────────
  // activeDay controls both the Visualizer view and acts as table day filter
  const [activeDay,           setActiveDay]           = useState('day1')  // 'day1' | 'day4'
  const [hideCovered,         setHideCovered]         = useState(false)
  const [selectedSlotFilter,  setSelectedSlotFilter]  = useState(null)    // e.g. '14:00' or null
  const [tableDayFilter,      setTableDayFilter]      = useState('day1')  // 'ALL' | 'day1' | 'day4' | 'both'
  const [allianceFilter,      setAllianceFilter]      = useState('ALL')
  const [search,              setSearch]              = useState('')
  const [sort,                setSort]                = useState({ col:'_roi', dir:'desc' })

  // ── Modals & Action States ────────────────────────────────────────────────────
  const [addModal,        setAddModal]        = useState({ open: false, prefill: null })
  const [addSaving,       setAddSaving]       = useState(false)
  const [editRow,         setEditRow]         = useState(null)
  const [editSaving,      setEditSaving]      = useState(false)
  const [deleteTarget,    setDelTarget]       = useState(null)
  const [deleteLoading,   setDelLoading]      = useState(false)
  const [reassignTarget,  setReassignTarget]  = useState(null) // { slot: {value, label}, day }

  // ── Toast ─────────────────────────────────────────────────────────────────────
  const [adminToast, setAdminToast] = useState(null)
  const showToast = useCallback((type, msg) => setAdminToast({ type, msg }), [])

  // ── Global Day Switch Synchronizer ───────────────────────────────────────────
  // When activeDay changes in visualizer, automatically sync table filter to that day
  const handleVisualizerDayChange = (day) => {
    setActiveDay(day)
    setTableDayFilter(day)
    setSelectedSlotFilter(null) // clear slot filter when switching days
  }

  // When day filter is clicked in table filters, sync visualizer day if day1 or day4
  const handleTableDayChange = (day) => {
    setTableDayFilter(day)
    if (day === 'day1' || day === 'day4') {
      setActiveDay(day)
    }
    setSelectedSlotFilter(null)
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('kvk_appointments')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) {
      console.error('[Supabase fetch]', err)
      setError(`${err.message}${err.hint?` — ${err.hint}`:''}`)
      setLoading(false); return
    }
    setRows((data??[]).map(enrichRoi))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!isAuthed) return

    fetchData()

    // Real-time Supabase postgres_changes subscription
    const channel = supabase
      .channel('admin_appointments_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kvk_appointments' },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAuthed, fetchData])

  // ── Direct Quick Re-Assignment Handler ────────────────────────────────────────
  const handleReassignSlot = async (player, targetDay, targetSlot) => {
    const slotField = targetDay === 'day1' ? 'time_slot_day1' : 'time_slot_day4'
    const oldSlot = player[slotField]

    // Optimistic local state update for zero latency
    const updatedPlayer = {
      ...player,
      [slotField]: targetSlot,
      selected_days: player.selected_days?.includes(targetDay)
        ? player.selected_days
        : [...(player.selected_days || []), targetDay],
    }
    const enriched = enrichRoi(updatedPlayer)

    setRows(prev => prev.map(r => r.id === player.id ? enriched : r))

    // Real-time Supabase update
    const { error: err } = await supabase
      .from('kvk_appointments')
      .update({
        [slotField]: targetSlot,
        selected_days: updatedPlayer.selected_days,
      })
      .eq('id', player.id)

    if (err) {
      console.error('[Supabase reassign error]', err)
      showToast('error', `Failed to move ${player.player_name}: ${err.message}`)
      // Revert optimistic state
      setRows(prev => prev.map(r => r.id === player.id ? player : r))
      return false
    }

    showToast(
      'success',
      `✅ Reassigned ${player.player_name} to ${targetSlot} UTC (${targetDay === 'day1' ? 'Day 1' : 'Day 4'})`
    )
    return true
  }

  // ── Add player (direct DB insert, no Discord) ─────────────────────────────────
  const handleAddSave = async (f) => {
    setAddSaving(true)
    const payload = buildPayload(f)
    console.log('[Admin Add] Inserting:', payload)

    const { error: err } = await supabase
      .from('kvk_appointments')
      .insert([payload])

    if (err) {
      console.error('[Supabase add]', err)
      alert(`Add failed: ${err.message}${err.hint?`\nHint: ${err.hint}`:''}`)
      setAddSaving(false); return
    }

    setAddSaving(false)
    setAddModal({ open: false, prefill: null })
    showToast('success', `✅ ${f.playerName || 'Player'} added to dashboard`)
    await fetchData()   // refresh so new row appears with correct ROI
  }

  // ── Edit save ─────────────────────────────────────────────────────────────────
  const handleEditSave = async (f) => {
    setEditSaving(true)
    const payload = buildPayload(f)
    const { error: err } = await supabase
      .from('kvk_appointments')
      .update(payload)
      .eq('id', editRow.id)
    if (err) {
      console.error('[Supabase update]', err)
      alert(`Update failed: ${err.message}`)
      setEditSaving(false); return
    }
    setRows(prev => prev.map(r => r.id === editRow.id ? enrichRoi({ ...r, ...payload }) : r))
    setEditSaving(false)
    setEditRow(null)
    showToast('success', `✅ ${f.playerName} updated`)
  }

  // ── Delete confirm ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDelLoading(true)
    const { error: err } = await supabase
      .from('kvk_appointments')
      .delete()
      .eq('id', deleteTarget.id)
    if (err) {
      console.error('[Supabase delete]', err)
      alert(`Delete failed: ${err.message}`)
      setDelLoading(false); return
    }
    const name = deleteTarget.player_name
    setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
    setDelLoading(false); setDelTarget(null)
    showToast('success', `🗑️ ${name}'s booking deleted`)
  }

  const [showDeclined,        setShowDeclined]        = useState(true)

  // ── Derived stats & conflict calculations ─────────────────────────────────────
  const conflictMap = useMemo(() => buildConflictMap(rows), [rows])

  // Filtered displayed rows with real-time slot synchronization and status filter
  const displayed = useMemo(() => {
    let res = [...rows]

    // Declined filter
    if (!showDeclined) {
      if (tableDayFilter === 'day1') {
        res = res.filter(r => r.status_day1 !== 'declined')
      } else if (tableDayFilter === 'day4') {
        res = res.filter(r => r.status_day4 !== 'declined')
      } else {
        res = res.filter(r => !r.isFullyDeclined)
      }
    }

    // Alliance filter
    if (allianceFilter !== 'ALL') res = res.filter(r => r.alliance === allianceFilter)

    // Day filter (synchronized with Visualizer)
    if (tableDayFilter === 'day1') res = res.filter(r => r.selected_days?.includes('day1'))
    if (tableDayFilter === 'day4') res = res.filter(r => r.selected_days?.includes('day4'))
    if (tableDayFilter === 'both') res = res.filter(r =>
      r.selected_days?.includes('day1') && r.selected_days?.includes('day4'))

    // Slot click filter from visualizer
    if (selectedSlotFilter) {
      const slotField = activeDay === 'day1' ? 'time_slot_day1' : 'time_slot_day4'
      const statusField = activeDay === 'day1' ? 'status_day1' : 'status_day4'
      res = res.filter(r => r[statusField] !== 'declined' && r.selected_days?.includes(activeDay) && r[slotField] === selectedSlotFilter)
    }

    // Search query
    if (search.trim()) res = res.filter(r =>
      r.player_name?.toLowerCase().includes(search.toLowerCase()))

    // Sorting
    res.sort((a,b) => {
      const av=a[sort.col]??0, bv=b[sort.col]??0
      const cmp = typeof av==='string' ? av.localeCompare(bv) : av-bv
      return sort.dir==='desc' ? -cmp : cmp
    })
    return res
  }, [rows, showDeclined, allianceFilter, tableDayFilter, selectedSlotFilter, activeDay, search, sort])

  const toggleSort     = (col) => setSort(s => s.col===col?{col,dir:s.dir==='desc'?'asc':'desc'}:{col,dir:'desc'})

  // Counts strictly exclude declined appointments from active schedule coverage
  const activeRows          = useMemo(() => rows.filter(r => !r.isFullyDeclined), [rows])
  const declinedCount       = useMemo(() => rows.filter(r => r.isFullyDeclined).length, [rows])
  const totalConflicts      = useMemo(() => rows.filter(r =>
    (!r.isD1Declined && conflictMap.get(r.id)?.has('day1')) ||
    (!r.isD4Declined && conflictMap.get(r.id)?.has('day4'))
  ).length, [rows, conflictMap])
  const day1Count           = rows.filter(r => r.status_day1 !== 'declined' && r.selected_days?.includes('day1')).length
  const day4Count           = rows.filter(r => r.status_day4 !== 'declined' && r.selected_days?.includes('day4')).length
  const bothCount           = rows.filter(r => r.status_day1 !== 'declined' && r.status_day4 !== 'declined' && r.selected_days?.includes('day1') && r.selected_days?.includes('day4')).length

  // Calculate unique unclaimed slots across both days (excluding declined)
  const d1CoveredCount = useMemo(() => {
    const s = new Set()
    rows.forEach(r => {
      if (r.status_day1 !== 'declined' && r.selected_days?.includes('day1') && r.time_slot_day1) s.add(r.time_slot_day1)
    })
    return s.size
  }, [rows])

  const d4CoveredCount = useMemo(() => {
    const s = new Set()
    rows.forEach(r => {
      if (r.status_day4 !== 'declined' && r.selected_days?.includes('day4') && r.time_slot_day4) s.add(r.time_slot_day4)
    })
    return s.size
  }, [rows])

  const activeUnclaimedCount = activeDay === 'day1' ? (48 - d1CoveredCount) : (48 - d4CoveredCount)

  // ── Accept / Decline Per-Day Status Toggle Handler ──────────────────────────
  const handleToggleDayStatus = async (row, targetDay) => {
    const currentStatus = targetDay === 'day1' ? row.status_day1 : row.status_day4
    const newStatus = currentStatus === 'declined' ? 'approved' : 'declined'

    const updatedD1 = targetDay === 'day1' ? newStatus : row.status_day1
    const updatedD4 = targetDay === 'day4' ? newStatus : row.status_day4

    // 1. Optimistic React state update
    setRows(prev => prev.map(r => {
      if (r.id !== row.id) return r
      return enrichRoi({
        ...r,
        status_day1: updatedD1,
        status_day4: updatedD4,
      })
    }))

    // 2. Persist to localStorage cache
    try {
      const overrides = JSON.parse(localStorage.getItem('kvk_status_overrides') || '{}')
      overrides[`${row.id}_${targetDay}`] = newStatus
      localStorage.setItem('kvk_status_overrides', JSON.stringify(overrides))
    } catch (e) {
      console.warn('[Status localStorage]', e)
    }

    // 3. Persist to Supabase database (strictly updating valid column status_day1 / status_day4)
    const dbField = targetDay === 'day1' ? 'status_day1' : 'status_day4'

    const { error: err } = await supabase
      .from('kvk_appointments')
      .update({
        [dbField]: newStatus,
      })
      .eq('id', row.id)

    if (err) {
      console.error('[Supabase status update error]:', err)
      showToast('error', `Failed to update database: ${err.message}`)
      fetchData()
      return
    }

    const dayLabel = targetDay === 'day1' ? 'Day 1' : 'Day 4'
    showToast(
      newStatus === 'approved' ? 'success' : 'info',
      newStatus === 'approved'
        ? `✅ Accepted ${row.player_name} for ${dayLabel} (slot restored)`
        : `🚫 Declined ${row.player_name} for ${dayLabel} (slot freed)`
    )
  }

  // ── Accept / Decline All Booked Days Toggle Handler ──────────────────────────
  const handleToggleStatus = async (row) => {
    const newStatus = row.isFullyDeclined ? 'approved' : 'declined'

    // 1. Optimistic React state update
    setRows(prev => prev.map(r => {
      if (r.id !== row.id) return r
      return enrichRoi({
        ...r,
        status_day1: newStatus,
        status_day4: newStatus,
      })
    }))

    // 2. Persist to localStorage cache
    try {
      const overrides = JSON.parse(localStorage.getItem('kvk_status_overrides') || '{}')
      overrides[`${row.id}_day1`] = newStatus
      overrides[`${row.id}_day4`] = newStatus
      localStorage.setItem('kvk_status_overrides', JSON.stringify(overrides))
    } catch (e) {
      console.warn('[Status localStorage]', e)
    }

    // 3. Persist to Supabase database (strictly updating valid columns status_day1 / status_day4)
    const { error: err } = await supabase
      .from('kvk_appointments')
      .update({
        status_day1: newStatus,
        status_day4: newStatus,
      })
      .eq('id', row.id)

    if (err) {
      console.error('[Supabase status update error]:', err)
      showToast('error', `Failed to update database: ${err.message}`)
      fetchData()
      return
    }

    showToast(
      newStatus === 'approved' ? 'success' : 'info',
      newStatus === 'approved'
        ? `✅ Accepted all slots for ${row.player_name}`
        : `🚫 Declined all slots for ${row.player_name}`
    )
  }

  const handleSharePublic = async () => {
    const publicUrl = `${window.location.origin}${window.location.pathname}#/schedule`
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(publicUrl)
      } else {
        const input = document.createElement('input')
        input.value = publicUrl
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      showToast('success', '🔗 Public schedule link copied! Share with your alliance.')
    } catch {
      showToast('info', `Public link: ${publicUrl}`)
    }
  }

  const handlePreviewPublic = () => {
    window.open('#/schedule', '_blank')
  }

  const Th = ({ col, children, right }) => (
    <th onClick={() => toggleSort(col)} className="select-none cursor-pointer whitespace-nowrap"
      style={{ padding:'10px 14px', textAlign:right?'right':'left', fontSize:11, fontWeight:700,
               color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em', background:'#0a0b0f',
               borderBottom:'1px solid #1c1f2e', position:'sticky', top:0, zIndex:10 }}>
      {children}<SortIcon col={col} sort={sort} />
    </th>
  )

  // ── Not authed ────────────────────────────────────────────────────────────────
  if (!isAuthed) return (
    <>
      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes subtleGlow { 0%,100%{box-shadow:0 0 20px rgba(92,124,250,0.12)} 50%{box-shadow:0 0 36px rgba(92,124,250,0.28)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
      `}</style>
      <LoginModal onSuccess={login} />
    </>
  )

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes slideUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes toastSlide { from{opacity:0;transform:translateY(12px) scale(0.94)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes subtleGlow { 0%,100%{box-shadow:0 0 20px rgba(92,124,250,0.12)} 50%{box-shadow:0 0 36px rgba(92,124,250,0.28)} }
        .arow{transition:background 0.1s;}
        .arow:hover{background:rgba(255,255,255,0.025);}
        .arow-conflict{background:rgba(245,158,11,0.07) !important;}
        .arow-conflict:hover{background:rgba(245,158,11,0.12) !important;}
        .fpill{padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
               border:1px solid #1c1f2e;background:#0a0b0f;color:#4b5563;transition:all 0.15s;}
        .fpill:hover{border-color:#2a2d4a;color:#9ca3af;}
        .fpill.on{background:rgba(92,124,250,0.15);border-color:rgba(92,124,250,0.45);color:#748ffc;}
        input[type=text],input[type=number],select{font-size:14px;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
      `}</style>

      <div className="min-h-screen overflow-x-hidden" style={{ background:'#0a0b0f', animation:'fadeIn 0.2s ease-out' }}>

        {/* ── Top bar ── */}
        <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3 sm:px-6 py-2.5 sm:py-3 backdrop-blur-xl"
          style={{ background:'rgba(10,11,15,0.93)', borderBottom:'1px solid #1c1f2e' }}>

          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <button onClick={() => navigate('/schedule')}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-sans font-medium transition-colors shrink-0 text-slate-400 hover:text-white"
              title="View Public Schedule">
              <ArrowLeft className="w-4 h-4" /><span>Schedule</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background:'rgba(76,110,245,0.2)', border:'1px solid rgba(76,110,245,0.3)' }}>
                <Crown className="w-3.5 h-3.5" style={{ color:'#748ffc' }} />
              </div>
              <span className="font-sans font-bold text-sm text-gray-200 tracking-tight">Ministry Admin</span>
              <span className="hidden md:inline font-sans text-xs font-medium text-slate-500">— 2323 KvK</span>
            </div>

            {/* Mobile Logout */}
            <button onClick={logout}
              title="Logout"
              className="sm:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-sans text-xs font-medium tracking-tight"
              style={{ background:'rgba(244,63,94,0.08)', border:'1px solid rgba(244,63,94,0.2)', color:'#f43f5e' }}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Action buttons ── */}
          <div className="flex items-center flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2 w-full sm:w-auto">
            {/* Add Player — emerald */}
            <button onClick={() => setAddModal({ open: true, prefill: null })}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all active:scale-95"
              style={{ background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.3)', color:'#6ee7b7' }}
              onMouseOver={e=>{e.currentTarget.style.background='rgba(16,185,129,0.2)';e.currentTarget.style.borderColor='rgba(16,185,129,0.5)'}}
              onMouseOut={e =>{e.currentTarget.style.background='rgba(16,185,129,0.12)';e.currentTarget.style.borderColor='rgba(16,185,129,0.3)'}}>
              <UserPlus className="w-3.5 h-3.5" /><span>Add Player</span>
            </button>

            {/* Share Public Link — indigo */}
            <button onClick={handleSharePublic}
              title="Copy public read-only schedule URL"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all active:scale-95 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
              <Share2 className="w-3.5 h-3.5" /><span>Share</span>
            </button>

            {/* Export CSV — indigo */}
            <button onClick={() => exportCsv(displayed, conflictMap)} disabled={displayed.length===0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all disabled:opacity-40"
              style={{ background:'rgba(76,110,245,0.12)', border:'1px solid rgba(76,110,245,0.3)', color:'#748ffc' }}>
              <Download className="w-3.5 h-3.5" /><span>Export</span>
            </button>

            {/* Refresh */}
            <button onClick={fetchData} disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-sans text-xs font-medium tracking-tight transition-all text-slate-400 hover:text-white"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid #1c1f2e' }}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />
              <span>Refresh</span>
            </button>

            {/* Desktop Logout — rose */}
            <button onClick={logout}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-xs font-medium tracking-tight transition-all"
              style={{ background:'rgba(244,63,94,0.08)', border:'1px solid rgba(244,63,94,0.2)', color:'#f43f5e' }}>
              <LogOut className="w-3.5 h-3.5" /><span>Logout</span>
            </button>
          </div>
        </div>

        <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6 overflow-x-hidden">

          {/* Summary Stats Strip: 2-col on mobile, 3-col on sm, 6-col on lg */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
            <StatCard
              icon={<Users className="w-3.5 h-3.5" />}
              label="Active Bookings"
              value={activeRows.length}
            />
            <StatCard icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Conflicts" value={totalConflicts}
              accent={totalConflicts>0?'rgba(245,158,11,0.5)':undefined} />
            <StatCard
              icon={<span style={{fontSize:13}}>⚒️</span>}
              label="Day 1"
              value={day1Count}
              accent={activeDay === 'day1' ? 'rgba(76,110,245,0.7)' : 'rgba(76,110,245,0.3)'}
              onClick={() => handleVisualizerDayChange('day1')}
            />
            <StatCard
              icon={<span style={{fontSize:13}}>⚔️</span>}
              label="Day 4"
              value={day4Count}
              accent={activeDay === 'day4' ? 'rgba(245,158,11,0.7)' : 'rgba(245,158,11,0.3)'}
              onClick={() => handleVisualizerDayChange('day4')}
            />
            <StatCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Both Days" value={bothCount} accent="rgba(139,92,246,0.4)" />
            {/* Quick Stat Badge: Unclaimed Slots */}
            <StatCard
              icon={<Clock className="w-3.5 h-3.5" />}
              label={`Unclaimed (${activeDay === 'day1' ? 'D1' : 'D4'})`}
              value={`${activeUnclaimedCount} / 48`}
              accent={activeUnclaimedCount > 0 ? 'rgba(244,63,94,0.6)' : 'rgba(16,185,129,0.6)'}
              onClick={() => setHideCovered(p => !p)}
            />
          </div>

          {/* Conflict Banner */}
          {totalConflicts > 0 && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
              style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)' }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color:'#fcd34d' }} />
              <p className="font-sans text-xs font-semibold leading-relaxed text-amber-300">
                {totalConflicts} booking{totalConflicts!==1?'s':''} share a time slot (amber cells & rows).
                Award the Ministry slot to the player with highest ROI, then click empty slots to reassign overlapping players!
              </p>
            </div>
          )}

          {/* ── Slot Coverage Visualizer Component (Heatmap) ── */}
          <SlotCoverageVisualizer
            rows={rows}
            activeDay={activeDay}
            setActiveDay={handleVisualizerDayChange}
            hideCovered={hideCovered}
            setHideCovered={setHideCovered}
            selectedSlotFilter={selectedSlotFilter}
            setSelectedSlotFilter={setSelectedSlotFilter}
            onOpenReassign={(slot) => setReassignTarget({ slot, day: activeDay })}
            onSharePublic={handleSharePublic}
            onPreviewPublic={handlePreviewPublic}
          />

          {/* Active Slot Filter Banner (when table is synchronized to a clicked slot) */}
          {selectedSlotFilter && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 animate-fadeIn">
              <div className="flex items-center gap-2 font-sans text-xs">
                <Filter className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  Filtering appointments for slot: <strong className="text-white font-semibold">{selectedSlotFilter} UTC</strong> ({activeDay === 'day1' ? 'Day 1' : 'Day 4'})
                </span>
                <span className="text-[11px] text-indigo-400/80">({displayed.length} player{displayed.length !== 1 ? 's' : ''})</span>
              </div>
              <button
                onClick={() => setSelectedSlotFilter(null)}
                className="flex items-center gap-1 text-xs font-sans font-semibold text-indigo-300 hover:text-white px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 transition-colors">
                <X className="w-3 h-3" />
                <span>Clear Slot Filter</span>
              </button>
            </div>
          )}

          {/* Table Filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <span className="font-sans text-xs font-bold uppercase tracking-wider text-slate-500">Filters:</span>
                <div className="flex flex-wrap gap-1.5">
                  {['ALL',...ALLIANCES].map(a => (
                    <button key={a} className={`fpill${allianceFilter===a?' on':''}`} onClick={() => setAllianceFilter(a)}>
                      {a==='ALL'?'All Alliances':a}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-5 hidden sm:block" style={{ background:'#1c1f2e' }} />

              {/* Synchronized Day Filter */}
              <div className="flex flex-wrap gap-1.5">
                {[['ALL','All Days'],['day1','⚒️ Day 1'],['day4','⚔️ Day 4'],['both','Both']].map(([v,l]) => (
                  <button
                    key={v}
                    className={`fpill${tableDayFilter===v?' on':''}`}
                    onClick={() => handleTableDayChange(v)}>
                    {l}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 hidden sm:block" style={{ background:'#1c1f2e' }} />

              {/* Quick Toggle: Show / Hide Declined Rows */}
              <button
                onClick={() => setShowDeclined(p => !p)}
                className={`fpill flex items-center gap-1.5 ${!showDeclined ? 'on' : ''}`}
                style={!showDeclined
                  ? { background: 'rgba(244,63,94,0.15)', borderColor: 'rgba(244,63,94,0.45)', color: '#fda4af' }
                  : {}}
              >
                {showDeclined ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showDeclined ? 'Hide Declined' : 'Show Declined'}</span>
                {declinedCount > 0 && (
                  <span className="font-sans text-[10px] px-1.5 py-0.2 rounded font-bold"
                    style={{ background: 'rgba(244,63,94,0.25)', color: '#fda4af' }}>
                    {declinedCount}
                  </span>
                )}
              </button>
            </div>

            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-slate-500" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search player…"
                className="w-full sm:w-48 pl-9 pr-4 py-2 rounded-xl font-sans text-sm placeholder-slate-600 focus:outline-none focus:ring-1"
                style={{ background:'#0f1117', border:'1px solid #1c1f2e', color:'#e2e8f0',
                         '--tw-ring-color':'rgba(92,124,250,0.3)' }} />
            </div>
          </div>

          {/* Appointments Data Table */}
          {loading ? (
            <div className="flex items-center justify-center py-24 gap-3 text-slate-600 font-sans">
              <Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm font-medium">Loading…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-20 gap-4 text-center font-sans">
              <XCircle className="w-10 h-10" style={{ color:'#f43f5e' }} />
              <p className="text-sm font-semibold" style={{ color:'#fda4af' }}>Supabase error</p>
              <p className="text-xs font-mono px-4 py-2 rounded-lg max-w-md" style={{ color:'#9ca3af', background:'#12141c' }}>{error}</p>
              <button onClick={fetchData} className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background:'rgba(76,110,245,0.15)', border:'1px solid rgba(76,110,245,0.3)', color:'#748ffc' }}>Retry</button>
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center py-24 gap-4 font-sans">
              <Calendar className="w-10 h-10" style={{ color:'#2d3748' }} />
              <p className="text-sm font-semibold text-slate-400">
                {rows.length===0
                  ? 'No appointments yet'
                  : selectedSlotFilter
                    ? `No appointments for slot ${selectedSlotFilter} UTC`
                    : 'No results match the current filters'}
              </p>
              {rows.length===0 ? (
                <button onClick={() => setAddModal({ open: true, prefill: null })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all text-emerald-300"
                  style={{ background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.3)' }}>
                  <UserPlus className="w-4 h-4" />Add First Player
                </button>
              ) : selectedSlotFilter ? (
                <button onClick={() => setSelectedSlotFilter(null)}
                  className="text-xs underline text-indigo-400 hover:text-indigo-300 font-semibold">
                  Clear slot filter
                </button>
              ) : (
                <button onClick={() => {setAllianceFilter('ALL');setTableDayFilter('ALL');setSearch('');setSelectedSlotFilter(null);setShowDeclined(true)}}
                  className="text-xs underline text-indigo-400 hover:text-indigo-300 font-semibold">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid #1c1f2e' }}>
              <div className="overflow-x-auto">
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr>
                      <Th col="_rank">        #          </Th>
                      <Th col="player_name">  Player     </Th>
                      <Th col="alliance">     Alliance   </Th>
                      <Th col="tc_level">     TC         </Th>
                      <Th col="_days">        Days       </Th>
                      <Th col="time_slot_day1">Day 1 Slot</Th>
                      <Th col="time_slot_day4">Day 4 Slot</Th>
                      <Th col="construction_days">Const  </Th>
                      <Th col="research_days">  Research </Th>
                      <Th col="training_days">  Training </Th>
                      <Th col="true_gold_count" right>Gold</Th>
                      <Th col="_roi"            right>ROI Score</Th>
                      <Th col="_conflict">    ⚠️         </Th>
                      <Th col="created_at">   Submitted  </Th>
                      <th style={{ padding:'10px 14px', fontSize:11, fontWeight:700, color:'#6b7280',
                                   textTransform:'uppercase', letterSpacing:'0.07em', background:'#0a0b0f',
                                   borderBottom:'1px solid #1c1f2e', position:'sticky', top:0, zIndex:10, whiteSpace:'nowrap' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((r, idx) => {
                      const hasD1 = (r.selected_days||[]).includes('day1')
                      const hasD4 = (r.selected_days||[]).includes('day4')
                      const isD1Declined = hasD1 && r.status_day1 === 'declined'
                      const isD4Declined = hasD4 && r.status_day4 === 'declined'
                      const isFullyDeclined = r.isFullyDeclined
                      const isPartiallyDeclined = r.isPartiallyDeclined

                      const conflicts     = conflictMap.get(r.id)
                      const hasD1Conflict = !isD1Declined && Boolean(conflicts?.has('day1'))
                      const hasD4Conflict = !isD4Declined && Boolean(conflicts?.has('day4'))
                      const hasConflict   = hasD1Conflict || hasD4Conflict
                      const days = (r.selected_days||[]).map(d=>d==='day1'?'⚒️':'⚔️').join(' ')
                      return (
                        <tr key={r.id}
                          className={`arow transition-all duration-200 ${
                            isFullyDeclined
                              ? 'opacity-50 bg-rose-950/10 hover:opacity-75'
                              : isPartiallyDeclined
                                ? 'bg-amber-950/10'
                                : hasConflict
                                  ? 'arow-conflict'
                                  : ''
                          }`}
                          style={{ borderBottom:'1px solid #12141c' }}>
                          <td style={{ padding:'10px 14px', color:'#374151', fontWeight:700, textAlign:'center', minWidth:40 }}>{idx+1}</td>
                          <td style={{ padding:'10px 14px', whiteSpace:'nowrap', minWidth:140 }}>
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold tracking-tight ${isFullyDeclined ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                                {r.player_name}
                              </span>
                              {isFullyDeclined ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-sans font-bold px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30 uppercase tracking-wider">
                                  Declined
                                </span>
                              ) : isPartiallyDeclined ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                  title="One day active, one day declined">
                                  {r.status_day1 === 'declined' ? 'D1 Declined' : 'D4 Declined'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-sans font-semibold px-1.5 py-0.2 rounded-md bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20">
                                  Approved
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}><AllianceBadge alliance={r.alliance} /></td>
                          <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}><TcBadge level={r.tc_level} /></td>
                          <td style={{ padding:'10px 14px', fontSize:15, whiteSpace:'nowrap' }}>{days}</td>

                          {/* Day 1 Slot & Per-Day Controls */}
                          <td className="font-sans text-xs tracking-tight"
                            style={{ padding:'10px 14px', whiteSpace:'nowrap', minWidth:155 }}>
                            {hasD1 ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span style={{
                                    color: isD1Declined ? '#64748b' : hasD1Conflict ? '#fcd34d' : '#cbd5e1',
                                    fontWeight: hasD1Conflict ? 700 : 500,
                                    textDecoration: isD1Declined ? 'line-through' : 'none'
                                  }}>
                                    {fmtSlot(r.time_slot_day1)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isD1Declined ? (
                                    <>
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 uppercase">
                                        Declined
                                      </span>
                                      <button
                                        onClick={() => handleToggleDayStatus(r, 'day1')}
                                        title="Accept Day 1 slot"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 transition-all active:scale-95"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Accept D1</span>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        Active
                                      </span>
                                      <button
                                        onClick={() => handleToggleDayStatus(r, 'day1')}
                                        title="Decline Day 1 slot (frees slot in Day 1 heatmap)"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 transition-all active:scale-95"
                                      >
                                        <X className="w-3 h-3" />
                                        <span>Decline D1</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>

                          {/* Day 4 Slot & Per-Day Controls */}
                          <td className="font-sans text-xs tracking-tight"
                            style={{ padding:'10px 14px', whiteSpace:'nowrap', minWidth:155 }}>
                            {hasD4 ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span style={{
                                    color: isD4Declined ? '#64748b' : hasD4Conflict ? '#fcd34d' : '#cbd5e1',
                                    fontWeight: hasD4Conflict ? 700 : 500,
                                    textDecoration: isD4Declined ? 'line-through' : 'none'
                                  }}>
                                    {fmtSlot(r.time_slot_day4)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isD4Declined ? (
                                    <>
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 uppercase">
                                        Declined
                                      </span>
                                      <button
                                        onClick={() => handleToggleDayStatus(r, 'day4')}
                                        title="Accept Day 4 slot"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 transition-all active:scale-95"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Accept D4</span>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        Active
                                      </span>
                                      <button
                                        onClick={() => handleToggleDayStatus(r, 'day4')}
                                        title="Decline Day 4 slot (frees slot in Day 4 heatmap)"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 transition-all active:scale-95"
                                      >
                                        <X className="w-3 h-3" />
                                        <span>Decline D4</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>

                          <td style={{ padding:'10px 14px', color:'#6b7280', whiteSpace:'nowrap' }}>{fmtSpd(r.construction_days,r.construction_hours)}</td>
                          <td style={{ padding:'10px 14px', color:'#6b7280', whiteSpace:'nowrap' }}>{fmtSpd(r.research_days,r.research_hours)}</td>
                          <td style={{ padding:'10px 14px', color:'#6b7280', whiteSpace:'nowrap' }}>{fmtSpd(r.training_days,r.training_hours)}</td>
                          <td style={{ padding:'10px 14px', textAlign:'right', color:'#fcd34d', fontWeight:600, whiteSpace:'nowrap' }}>{fmtGold(r.true_gold_count)}</td>
                          <td style={{ padding:'10px 14px', textAlign:'right', whiteSpace:'nowrap' }}><RoiPill score={r._roi} /></td>
                          <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>
                            {isFullyDeclined ? <span className="text-slate-600 text-xs">—</span> : <ConflictPill conflicts={conflicts} isD1Declined={isD1Declined} isD4Declined={isD4Declined} />}
                          </td>
                          <td style={{ padding:'10px 14px', color:'#4b5563', whiteSpace:'nowrap', fontSize:12 }}>{fmtDate(r.created_at)}</td>
                          <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                            <div className="flex items-center gap-1.5">
                              {/* Quick Action: Accept / Decline all */}
                              {isFullyDeclined ? (
                                <button
                                  onClick={() => handleToggleStatus(r)}
                                  title="Accept all days (restores slots)"
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-sans text-xs font-bold tracking-tight transition-all active:scale-95 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Accept All</span>
                                </button>
                              ) : isPartiallyDeclined ? (
                                <button
                                  onClick={() => handleToggleStatus(r)}
                                  title="Accept all days (restores all slots)"
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all active:scale-95 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Accept All</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleToggleStatus(r)}
                                  title="Decline all days (frees all slots)"
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all active:scale-95 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400">
                                  <X className="w-3.5 h-3.5" />
                                  <span>Decline All</span>
                                </button>
                              )}

                              {/* Edit */}
                              <button onClick={() => setEditRow(r)} title="Edit"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all active:scale-95"
                                style={{ background:'rgba(76,110,245,0.1)', border:'1px solid rgba(76,110,245,0.25)', color:'#748ffc' }}
                                onMouseOver={e=>{e.currentTarget.style.background='rgba(76,110,245,0.2)';e.currentTarget.style.borderColor='rgba(76,110,245,0.5)'}}
                                onMouseOut={e =>{e.currentTarget.style.background='rgba(76,110,245,0.1)';e.currentTarget.style.borderColor='rgba(76,110,245,0.25)'}}>
                                <Pencil className="w-3 h-3" /><span className="hidden sm:inline">Edit</span>
                              </button>

                              {/* Delete */}
                              <button onClick={() => setDelTarget(r)} title="Delete"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-sans text-xs font-semibold tracking-tight transition-all active:scale-95"
                                style={{ background:'rgba(244,63,94,0.08)', border:'1px solid rgba(244,63,94,0.2)', color:'#f43f5e' }}
                                onMouseOver={e=>{e.currentTarget.style.background='rgba(244,63,94,0.18)';e.currentTarget.style.borderColor='rgba(244,63,94,0.45)'}}
                                onMouseOut={e =>{e.currentTarget.style.background='rgba(244,63,94,0.08)';e.currentTarget.style.borderColor='rgba(244,63,94,0.2)'}}>
                                <Trash2 className="w-3 h-3" /><span className="hidden sm:inline">Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 font-sans"
                style={{ borderTop:'1px solid #1c1f2e', background:'#0a0b0f' }}>
                <span style={{ fontSize:11, color:'#374151' }}>
                  Showing <strong style={{ color:'#6b7280' }}>{displayed.length}</strong> of{' '}
                  <strong style={{ color:'#6b7280' }}>{rows.length}</strong> entries
                </span>
                <span style={{ fontSize:11, color:'#2d3748' }}>sorted by {sort.col.replace('_','')} {sort.dir}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Re-Assignment Modal ── */}
      {reassignTarget && (
        <ReassignModal
          slot={reassignTarget.slot}
          day={reassignTarget.day}
          rows={rows}
          onReassign={handleReassignSlot}
          onOpenFullAdd={(day, slot) => setAddModal({ open: true, prefill: { day, slot } })}
          onClose={() => setReassignTarget(null)}
        />
      )}

      {/* ── Add Player modal ── */}
      {addModal.open && (
        <BookingModal
          mode="add"
          prefill={addModal.prefill}
          onSave={handleAddSave}
          onClose={() => setAddModal({ open: false, prefill: null })}
          saving={addSaving}
        />
      )}

      {/* ── Edit modal ── */}
      {editRow && (
        <BookingModal
          mode="edit"
          row={editRow}
          onSave={handleEditSave}
          onClose={() => setEditRow(null)}
          saving={editSaving}
        />
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <DeleteModal
          row={deleteTarget}
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDelTarget(null)}
        />
      )}

      {/* ── Admin toast ── */}
      <AdminToast toast={adminToast} onClose={() => setAdminToast(null)} />
    </>
  )
}
