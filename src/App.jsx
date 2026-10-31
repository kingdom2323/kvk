import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Crown, Sword, Hammer, FlaskConical, Coins, Clock,
  Shield, Send, Loader2, CheckCircle2, XCircle, AlertCircle,
  Sparkles, X, User, ChevronDown, Globe, Plus, Minus,
  Lock, ArrowRight, Calendar, KeyRound, Unlock
} from 'lucide-react'
import { supabase } from './lib/supabase.js'

// ─── Hardcoded Discord Webhook ────────────────────────────────────────────────
const DISCORD_WEBHOOK_URL =
  'https://discord.com/api/webhooks/1565118471174627478/K5S5SOtF0pnEKRZPLVXhgPIx2b6DNN6xo_iX2bTghUdE7ZLrl8oXzFU7lcjGDbDXds7V'

// ─── Static Data ──────────────────────────────────────────────────────────────
const ALLIANCES = ['TEA', 'VIK', 'ERA', 'FFF']

const ALLIANCE_STYLES = {
  TEA: { border: '#10b981', bg: 'rgba(16,185,129,0.12)', text: '#6ee7b7', glow: '0 0 16px rgba(16,185,129,0.4)' },
  VIK: { border: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  text: '#fda4af', glow: '0 0 16px rgba(244,63,94,0.4)'  },
  ERA: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', text: '#c4b5fd', glow: '0 0 16px rgba(139,92,246,0.4)' },
  FFF: { border: '#f59e0b', bg: 'rgba(245,158,11,0.12)', text: '#fcd34d', glow: '0 0 16px rgba(245,158,11,0.4)' },
}

// KvK Prep Days — multi-selectable
const KVK_DAYS = [
  { id: 'day1', emoji: '⚒️', accentBorder: '#4c6ef5', accentBg: 'rgba(76,110,245,0.13)',  accentText: '#748ffc', accentGlow: '0 0 18px rgba(92,124,250,0.4)'  },
  { id: 'day4', emoji: '⚔️', accentBorder: '#f59e0b', accentBg: 'rgba(245,158,11,0.13)', accentText: '#fcd34d', accentGlow: '0 0 18px rgba(245,158,11,0.4)'  },
]

// TC Level progression
const TC_LEVELS = ['25', '26', '27', '28', '29', '30', 'TG1', 'TG2', 'TG3']
const TC_IS_GOLD = (v) => v.startsWith('TG')

// 30-min UTC slots 00:00–23:30
const TIME_SLOTS = (() => {
  const slots = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const p  = (n) => String(n).padStart(2, '0')
      const eH = m === 30 ? h + 1 : h
      const eM = m === 30 ? 0 : 30
      slots.push({
        value: `${p(h)}:${p(m)}`,
        label: `${p(h)}:${p(m)} – ${eH === 24 ? '24:00' : p(eH) + ':' + p(eM)} UTC`,
      })
    }
  }
  return slots
})()

// ─── Languages & Translations ─────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', name: 'English'   },
  { code: 'es', flag: '🇪🇸', name: 'Español'   },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية'   },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch'   },
]

const T = {
  en: {
    badge: 'Server 2323 · KvK Season',
    subtitle: 'Ministry Appointment Booking',
    secPlayer:   'Player Details',
    secDay:      'KvK Prep Day',
    secTc:       'Town Center Level',
    secSpeedups: 'Speedups & Resources',
    secSlot:     'Time Slot',
    labelName:         'Player Name / In-Game Name',
    labelAlliance:     'Alliance',
    labelDay:          'Select one or both prep days',
    day1Label:         'Day 1',
    day1Sub:           'Construction & Research',
    day4Label:         'Day 4',
    day4Sub:           'Training',
    labelTc:           'TC Level',
    labelConstruction: 'Construction',
    labelResearch:     'Research',
    labelTraining:     'Training',
    labelGold:         'True Gold Count',
    labelSlot:         'Time Slot (UTC)',
    slotHintBoth:      'Select a time slot for each chosen day',
    slotHintNone:      'Select a prep day above to unlock time slots',
    placeholderName: 'Your in-game name…',
    placeholderGold: 'e.g. 250 000',
    placeholderSlot: 'Select a slot…',
    days:  'Days',
    hours: 'Hours',
    btnSubmit:     'Book Ministry Appointment',
    btnSubmitting: 'Submitting…',
    successTitle: 'Appointment Booked!',
    successMsg:   'Your request was sent to the alliance Discord channel.',
    successClose: 'Done',
    rowCommander: 'Commander',
    rowAlliance:  'Alliance',
    rowDay:       'KvK Day',
    rowTc:        'TC Level',
    rowSlot:      'Time Slot',
    rowSlotDay1:  'Day 1 Slot',
    rowSlotDay4:  'Day 4 Slot',
    errName:       'Player name is required.',
    errAlliance:   'Select your alliance.',
    errDay:        'Select at least one KvK prep day.',
    errTc:         'Select your TC level.',
    errSlot:       'Select a time slot.',
    errNetwork:    'Network Error',
    errNetworkMsg: 'Could not reach Discord. Check your connection.',
    errFailed:     'Submission Failed',
    errCheck:      'Fix the highlighted fields.',
    footer: 'All times UTC · 30-minute slots · 2323 KvK',
    closedBadge: 'Registration Closed',
    closedTitle: 'KvK Ministry Booking is Closed',
    closedSubtitle: 'The appointment booking window has concluded.',
    closedDesc: 'Submissions are now closed while alliance leadership (TEA, VIK, ERA, FFF) finalizes kingdom speedup schedules for KvK Prep Days. Please check the public schedule to verify your assigned time slots.',
    btnViewSchedule: 'View Kingdom Schedule & Assigned Slots',
    btnAdminLogin: 'Alliance Leadership / R4 Portal',
  },
  es: {
    badge: 'Servidor 2323 · Temporada KvK',
    subtitle: 'Reserva de Cita en el Ministerio',
    secPlayer:   'Datos del Jugador',
    secDay:      'Día de Preparación KvK',
    secTc:       'Nivel del Centro de Ciudad',
    secSpeedups: 'Aceleradores y Recursos',
    secSlot:     'Franja Horaria',
    labelName:         'Nombre en el Juego',
    labelAlliance:     'Alianza',
    labelDay:          'Selecciona uno o ambos días',
    day1Label:         'Día 1',
    day1Sub:           'Construcción e Investigación',
    day4Label:         'Día 4',
    day4Sub:           'Entrenamiento',
    labelTc:           'Nivel TC',
    labelConstruction: 'Construcción',
    labelResearch:     'Investigación',
    labelTraining:     'Entrenamiento',
    labelGold:         'Oro Verdadero',
    labelSlot:         'Franja Horaria (UTC)',
    slotHintBoth:      'Selecciona una franja para cada día elegido',
    slotHintNone:      'Elige un día de preparación para desbloquear',
    placeholderName: 'Tu nombre en el juego…',
    placeholderGold: 'ej. 250 000',
    placeholderSlot: 'Elige una franja…',
    days: 'Días', hours: 'Horas',
    btnSubmit: 'Reservar Cita en el Ministerio', btnSubmitting: 'Enviando…',
    successTitle: '¡Cita Reservada!', successMsg: 'Tu solicitud fue enviada al canal Discord de la alianza.', successClose: 'Listo',
    rowCommander: 'Comandante', rowAlliance: 'Alianza', rowDay: 'Día KvK',
    rowTc: 'Nivel TC', rowSlot: 'Franja Horaria', rowSlotDay1: 'Franja Día 1', rowSlotDay4: 'Franja Día 4',
    errName: 'El nombre del jugador es obligatorio.', errAlliance: 'Selecciona tu alianza.',
    errDay: 'Selecciona al menos un día de preparación.', errTc: 'Selecciona tu nivel de TC.',
    errSlot: 'Selecciona una franja horaria.',
    errNetwork: 'Error de Red', errNetworkMsg: 'No se pudo contactar Discord.',
    errFailed: 'Error al Enviar', errCheck: 'Corrige los campos marcados.',
    footer: 'Horarios en UTC · Franjas de 30 min · 2323 KvK',
    closedBadge: 'Inscripción Cerrada',
    closedTitle: 'La Reserva del Ministerio KvK está Cerrada',
    closedSubtitle: 'El período de solicitud de citas ha finalizado.',
    closedDesc: 'Las solicitudes están cerradas mientras el liderazgo de las alianzas (TEA, VIK, ERA, FFF) finaliza los horarios de aceleradores para los días de preparación KvK. Consulta el calendario público para verificar tus franjas horarias asignadas.',
    btnViewSchedule: 'Ver Calendario y Franjas Asignadas',
    btnAdminLogin: 'Portal de Liderazgo / R4',
  },
  pt: {
    badge: 'Servidor 2323 · Temporada KvK',
    subtitle: 'Reserva de Consulta no Ministério',
    secPlayer:   'Dados do Jogador',
    secDay:      'Dia de Preparação KvK',
    secTc:       'Nível do Centro da Cidade',
    secSpeedups: 'Aceleradores e Recursos',
    secSlot:     'Horário',
    labelName:         'Nome no Jogo',
    labelAlliance:     'Aliança',
    labelDay:          'Selecione um ou ambos os dias',
    day1Label:         'Dia 1',
    day1Sub:           'Construção e Pesquisa',
    day4Label:         'Dia 4',
    day4Sub:           'Treinamento',
    labelTc:           'Nível TC',
    labelConstruction: 'Construção',
    labelResearch:     'Pesquisa',
    labelTraining:     'Treinamento',
    labelGold:         'Ouro Verdadeiro',
    labelSlot:         'Horário (UTC)',
    slotHintBoth:      'Selecione um horário para cada dia escolhido',
    slotHintNone:      'Escolha um dia de preparação para desbloquear',
    placeholderName: 'Seu nome no jogo…',
    placeholderGold: 'ex. 250 000',
    placeholderSlot: 'Escolha um horário…',
    days: 'Dias', hours: 'Horas',
    btnSubmit: 'Reservar Consulta no Ministério', btnSubmitting: 'Enviando…',
    successTitle: 'Consulta Reservada!', successMsg: 'Sua solicitação foi enviada ao canal Discord da aliança.', successClose: 'Feito',
    rowCommander: 'Comandante', rowAlliance: 'Aliança', rowDay: 'Dia KvK',
    rowTc: 'Nivel TC', rowSlot: 'Horário', rowSlotDay1: 'Horário Dia 1', rowSlotDay4: 'Horário Dia 4',
    errName: 'Nome do jogador é obrigatório.', errAlliance: 'Selecione sua aliança.',
    errDay: 'Selecione ao menos um dia de preparação.', errTc: 'Selecione o nível do seu TC.',
    errSlot: 'Selecione um horário.',
    errNetwork: 'Erro de Rede', errNetworkMsg: 'Não foi possível alcançar o Discord.',
    errFailed: 'Falha no Envio', errCheck: 'Corrija os campos destacados.',
    footer: 'Horários em UTC · Intervalos de 30 min · 2323 KvK',
    closedBadge: 'Inscrições Encerradas',
    closedTitle: 'A Reserva do Ministério KvK está Fechada',
    closedSubtitle: 'O período de agendamento de consultas terminou.',
    closedDesc: 'Os envios foram encerrados enquanto a liderança (TEA, VIK, ERA, FFF) finaliza a coordenação dos horários de aceleradores para o KvK. Verifique o cronograma público para checar seus horários atribuídos.',
    btnViewSchedule: 'Ver Cronograma e Horários Atribuídos',
    btnAdminLogin: 'Portal da Liderança / R4',
  },
  ar: {
    badge: 'خادم 2323 · موسم KvK',
    subtitle: 'حجز موعد الوزارة',
    secPlayer:   'بيانات اللاعب',
    secDay:      'يوم التحضير KvK',
    secTc:       'مستوى مركز المدينة',
    secSpeedups: 'التسريعات والموارد',
    secSlot:     'الفترة الزمنية',
    labelName:         'اسم اللاعب / الاسم في اللعبة',
    labelAlliance:     'التحالف',
    labelDay:          'اختر يومًا واحدًا أو كليهما',
    day1Label:         'اليوم 1',
    day1Sub:           'البناء والبحث',
    day4Label:         'اليوم 4',
    day4Sub:           'التدريب',
    labelTc:           'مستوى TC',
    labelConstruction: 'البناء',
    labelResearch:     'البحث',
    labelTraining:     'التدريب',
    labelGold:         'الذهب الحقيقي',
    labelSlot:         'الفترة الزمنية (UTC)',
    slotHintBoth:      'اختر فترة زمنية لكل يوم محدد',
    slotHintNone:      'اختر يوم التحضير أولاً',
    placeholderName: 'اسمك في اللعبة…',
    placeholderGold: 'مثال: 250000',
    placeholderSlot: 'اختر فترة زمنية…',
    days: 'أيام', hours: 'ساعات',
    btnSubmit: 'احجز موعد الوزارة', btnSubmitting: 'جارٍ الإرسال…',
    successTitle: 'تم حجز الموعد!', successMsg: 'تم إرسال طلبك إلى قناة Discord للتحالف.', successClose: 'تم',
    rowCommander: 'القائد', rowAlliance: 'التحالف', rowDay: 'يوم KvK',
    rowTc: 'مستوى TC', rowSlot: 'الفترة', rowSlotDay1: 'فترة اليوم 1', rowSlotDay4: 'فترة اليوم 4',
    errName: 'اسم اللاعب مطلوب.', errAlliance: 'اختر تحالفك.',
    errDay: 'اختر يوم تحضير واحدًا على الأقل.', errTc: 'اختر مستوى TC.',
    errSlot: 'اختر فترة زمنية.',
    errNetwork: 'خطأ في الشبكة', errNetworkMsg: 'تعذر الوصول إلى Discord.',
    errFailed: 'فشل الإرسال', errCheck: 'صحح الحقول المميزة.',
    footer: '2323 KvK · جميع الأوقات بتوقيت UTC · فترات 30 دقيقة',
    closedBadge: 'التسجيل مغلق',
    closedTitle: 'حجز موعد وزارة KvK مغلق حاليًا',
    closedSubtitle: 'انتهت فترة حجز المواعيد الرسمية.',
    closedDesc: 'تم إغلاق تقديم الطلبات حيث تقوم قيادة التحالفات (TEA, VIK, ERA, FFF) بوضع اللمسات الأخيرة على جدول التسريعات لمملكة 2323. يُرجى مراجعة الجدول العام للتحقق من المواعيد المخصصة.',
    btnViewSchedule: 'عرض جدول المملكة والمواعيد المخصصة',
    btnAdminLogin: 'بوابة قيادة التحالفات / R4',
  },
  de: {
    badge: 'Server 2323 · KvK-Saison',
    subtitle: 'Ministerium Terminbuchung',
    secPlayer:   'Spielerdaten',
    secDay:      'KvK-Vorbereitungstag',
    secTc:       'Stadtmittelpunkt-Level',
    secSpeedups: 'Beschleuniger & Ressourcen',
    secSlot:     'Zeitfenster',
    labelName:         'Spielername / In-Game-Name',
    labelAlliance:     'Allianz',
    labelDay:          'Einen oder beide Tage wählen',
    day1Label:         'Tag 1',
    day1Sub:           'Bau & Forschung',
    day4Label:         'Tag 4',
    day4Sub:           'Training',
    labelTc:           'TC-Level',
    labelConstruction: 'Bau',
    labelResearch:     'Forschung',
    labelTraining:     'Training',
    labelGold:         'Echtes Gold',
    labelSlot:         'Zeitfenster (UTC)',
    slotHintBoth:      'Zeitfenster für jeden gewählten Tag auswählen',
    slotHintNone:      'Zuerst Vorbereitungstag auswählen',
    placeholderName: 'Dein In-Game-Name…',
    placeholderGold: 'z.B. 250 000',
    placeholderSlot: 'Zeitfenster wählen…',
    days: 'Tage', hours: 'Stunden',
    btnSubmit: 'Ministeriumstermin buchen', btnSubmitting: 'Wird gesendet…',
    successTitle: 'Termin gebucht!', successMsg: 'Deine Anfrage wurde an den Discord-Kanal gesendet.', successClose: 'Fertig',
    rowCommander: 'Kommandant', rowAlliance: 'Allianz', rowDay: 'KvK-Tag',
    rowTc: 'TC-Level', rowSlot: 'Zeitfenster', rowSlotDay1: 'Tag-1-Slot', rowSlotDay4: 'Tag-4-Slot',
    errName: 'Spielername ist erforderlich.', errAlliance: 'Wähle deine Allianz.',
    errDay: 'Wähle mindestens einen Vorbereitungstag.', errTc: 'Wähle dein TC-Level.',
    errSlot: 'Wähle ein Zeitfenster.',
    errNetwork: 'Netzwerkfehler', errNetworkMsg: 'Discord konnte nicht erreicht werden.',
    errFailed: 'Übermittlung fehlgeschlagen', errCheck: 'Korrigiere die markierten Felder.',
    footer: 'Alle Zeiten UTC · 30-Minuten-Slots · 2323 KvK',
    closedBadge: 'Registrierung Geschlossen',
    closedTitle: 'KvK-Ministerium Terminbuchung ist Geschlossen',
    closedSubtitle: 'Das Zeitfenster für Terminbuchungen ist abgelaufen.',
    closedDesc: 'Einsendungen sind nun geschlossen, während die Führung (TEA, VIK, ERA, FFF) die Zeitpläne für die KvK-Vorbereitungstage finalisiert. Bitte prüfen Sie den öffentlichen Zeitplan, um Ihre Zeitfenster einzusehen.',
    btnViewSchedule: 'Öffentlichen Zeitplan & Zeitfenster ansehen',
    btnAdminLogin: 'Allianzführung / R4-Portal',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtSpeedups  = (d, h) => !d && !h ? null : d && h ? `${d}d ${h}h` : d ? `${d}d` : `${h}h`
const getSlotLabel = (v) => TIME_SLOTS.find((s) => s.value === v)?.label ?? '—'
const getKvkLabel  = (id, t) =>
  id === 'day1' ? `${t.day1Label} (${t.day1Sub})` :
  id === 'day4' ? `${t.day4Label} (${t.day4Sub})` : '—'

const INITIAL_FORM = {
  playerName:        '',
  alliance:          '',
  kvkDays:           [],    // [] | ['day1'] | ['day4'] | ['day1','day4']
  tcLevel:           '',
  constructionDays:  0, constructionHours:  0,
  researchDays:      0, researchHours:      0,
  trainingDays:      0, trainingHours:      0,
  trueGold:          '',
  timeSlotDay1:      '',    // slot for Day 1 (required when day1 in kvkDays)
  timeSlotDay4:      '',    // slot for Day 4 (required when day4 in kvkDays)
}

// ─── Language Switcher ────────────────────────────────────────────────────────
function LangSwitcher({ lang, setLang }) {
  const [open, setOpen] = useState(false)
  const ref  = useRef(null)
  const curr = LANGUAGES.find((l) => l.code === lang)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors select-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{curr.flag}</span>
        <span className="hidden sm:inline">{curr.name}</span>
        <ChevronDown className="w-3 h-3 opacity-60"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 rounded-xl overflow-hidden py-1"
          style={{ minWidth: 145, background: '#161820', border: '1px solid rgba(255,255,255,0.1)',
                   boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'fadeIn 0.15s ease-out' }}>
          {LANGUAGES.map((l) => (
            <button key={l.code} type="button"
              onClick={() => { setLang(l.code); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors"
              style={{ color: l.code === lang ? '#748ffc' : '#9ca3af',
                       background: l.code === lang ? 'rgba(92,124,250,0.12)' : 'transparent',
                       fontWeight: l.code === lang ? 600 : 400 }}>
              <span className="text-base">{l.flag}</span>
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── KvK Day Multi-Selector ───────────────────────────────────────────────────
function KvkDaySelector({ value, onChange, error, t }) {
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((d) => d !== id) : [...value, id])

  return (
    <div className="space-y-2">
      <MicroLabel text={t.labelDay} />
      <div className="grid grid-cols-2 gap-3">
        {KVK_DAYS.map((day) => {
          const selected   = value.includes(day.id)
          const dayLabel   = day.id === 'day1' ? t.day1Label : t.day4Label
          const daySubLbl  = day.id === 'day1' ? t.day1Sub   : t.day4Sub
          return (
            <button key={day.id} type="button" onClick={() => toggle(day.id)}
              className="relative flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-2xl transition-all duration-200 active:scale-[0.97] text-center overflow-hidden"
              style={selected ? {
                border: `1.5px solid ${day.accentBorder}`,
                background: day.accentBg,
                boxShadow: day.accentGlow,
              } : {
                border: '1.5px solid #1c1f2e',
                background: '#0a0b0f',
              }}>
              {/* checkbox pip top-right */}
              <span className="absolute top-2.5 right-2.5 flex items-center justify-center rounded-full transition-all duration-200"
                style={{
                  width: 18, height: 18,
                  background:  selected ? day.accentBorder : 'transparent',
                  border:      selected ? 'none' : '1.5px solid #2a2d4a',
                }}>
                {selected && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>

              <span style={{ fontSize: 26, lineHeight: 1 }}>{day.emoji}</span>
              <span className="font-bold text-base leading-tight"
                style={{ color: selected ? day.accentText : '#6b7280' }}>
                {dayLabel}
              </span>
              <span className="text-xs leading-snug"
                style={{ color: selected ? day.accentText : '#374151', opacity: selected ? 0.9 : 1 }}>
                {daySubLbl}
              </span>
            </button>
          )
        })}
      </div>
      {error && <FieldErr msg={error} />}
    </div>
  )
}

// ─── TC Level Selector ────────────────────────────────────────────────────────
function TcLevelSelector({ value, onChange, error, t }) {
  return (
    <div className="space-y-2">
      <MicroLabel text={t.labelTc} />
      <div className="grid grid-cols-3 gap-2">
        {TC_LEVELS.map((lvl) => {
          const isGold    = TC_IS_GOLD(lvl)
          const selected  = value === lvl
          // accent colours
          const aC = isGold ? '#f59e0b' : '#4c6ef5'
          const aBg = isGold ? 'rgba(245,158,11,0.14)' : 'rgba(76,110,245,0.14)'
          const aGlow = isGold ? '0 0 12px rgba(245,158,11,0.35)' : '0 0 12px rgba(92,124,250,0.35)'
          return (
            <button key={lvl} type="button" onClick={() => onChange(lvl)}
              className="py-3 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95"
              style={selected ? {
                border:     `1.5px solid ${aC}`,
                background: aBg,
                color:      isGold ? '#fcd34d' : '#748ffc',
                boxShadow:  aGlow,
              } : {
                border:     `1.5px solid ${isGold ? 'rgba(245,158,11,0.22)' : '#1c1f2e'}`,
                background: isGold ? 'rgba(245,158,11,0.04)' : '#0a0b0f',
                color:      isGold ? 'rgba(245,158,11,0.55)' : '#374151',
              }}>
              {lvl}
            </button>
          )
        })}
      </div>
      {/* progression hint */}
      <p style={{ fontSize: 10, color: '#2d3748', letterSpacing: '0.02em' }}>
        25 → 26 → 27 → 28 → 29 → 30 → TG1 → TG2 → TG3
      </p>
      {error && <FieldErr msg={error} />}
    </div>
  )
}

// ─── Slot Dropdown ────────────────────────────────────────────────────────────
function SlotSelect({ value, onChange, placeholder, hasError, isRTL }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl appearance-none focus:outline-none focus:ring-1 transition-all"
        style={{
          background:   '#0a0b0f',
          border:       `1px solid ${hasError ? '#f43f5e66' : '#1c1f2e'}`,
          color:        value ? '#f1f5f9' : '#4b5563',
          padding:      '12px 40px 12px 16px',
          fontSize:     16,
          paddingRight: isRTL ? 16 : 40,
          paddingLeft:  isRTL ? 40 : 16,
        }}
        dir="ltr"
      >
        <option value="" disabled style={{ background: '#0f1117' }}>{placeholder}</option>
        {TIME_SLOTS.map((s) => (
          <option key={s.value} value={s.value} style={{ background: '#0f1117', color: '#f1f5f9' }}>
            {s.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
        style={{ [isRTL ? 'left' : 'right']: 14, color: '#4b5563' }} />
    </div>
  )
}

// ─── Time Slot Section (dynamic) ─────────────────────────────────────────────
function TimeSlotSection({ kvkDays, timeSlotDay1, timeSlotDay4, onDay1, onDay4,
                            errors, t, isRTL }) {
  const hasDay1 = kvkDays.includes('day1')
  const hasDay4 = kvkDays.includes('day4')
  const both    = hasDay1 && hasDay4
  const day1Cfg = KVK_DAYS.find((d) => d.id === 'day1')
  const day4Cfg = KVK_DAYS.find((d) => d.id === 'day4')

  if (!hasDay1 && !hasDay4) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
        style={{ background: '#0a0b0f', border: '1px solid #1c1f2e' }}>
        <Clock className="w-4 h-4 shrink-0" style={{ color: '#374151' }} />
        <span style={{ fontSize: 13, color: '#374151' }}>{t.slotHintNone}</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {both && (
        <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{t.slotHintBoth}</p>
      )}

      {/* Day 1 slot */}
      {hasDay1 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13 }}>{day1Cfg.emoji}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: both ? '#748ffc' : '#6b7280',
                           textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {both ? `${t.day1Label} — ${t.labelSlot}` : t.labelSlot}
            </span>
          </div>
          <SlotSelect
            value={timeSlotDay1}
            onChange={onDay1}
            placeholder={t.placeholderSlot}
            hasError={!!errors.timeSlotDay1}
            isRTL={isRTL}
          />
          {errors.timeSlotDay1 && <FieldErr msg={errors.timeSlotDay1} />}
        </div>
      )}

      {/* Day 4 slot */}
      {hasDay4 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13 }}>{day4Cfg.emoji}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: both ? '#fcd34d' : '#6b7280',
                           textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {both ? `${t.day4Label} — ${t.labelSlot}` : t.labelSlot}
            </span>
          </div>
          <SlotSelect
            value={timeSlotDay4}
            onChange={onDay4}
            placeholder={t.placeholderSlot}
            hasError={!!errors.timeSlotDay4}
            isRTL={isRTL}
          />
          {errors.timeSlotDay4 && <FieldErr msg={errors.timeSlotDay4} />}
        </div>
      )}
    </div>
  )
}

// ─── Speedup Stepper Row ──────────────────────────────────────────────────────
function SpeedupRow({ icon, label, days, hours, onDays, onHours, t, isRTL }) {
  const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v))

  const Counter = ({ value, onChange, max, unitLabel }) => {
    const [raw, setRaw] = useState(String(value))
    useEffect(() => { setRaw(String(value)) }, [value])
    const commit = (s) => { const n = parseInt(s, 10); onChange(isNaN(n) ? 0 : clamp(n, 0, max)) }
    return (
      <div className="flex-1 flex items-stretch rounded-xl overflow-hidden"
        style={{ background: '#0a0b0f', border: '1px solid #1c1f2e', minHeight: 56 }}>
        <button type="button" onPointerDown={() => onChange(clamp(value - 1, 0, max))}
          className="flex items-center justify-center text-gray-500 active:text-white transition-colors select-none"
          style={{ width: 44 }}>
          <Minus className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center justify-center flex-1 gap-0.5 py-1.5">
          <input type="number" inputMode="numeric" value={raw}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(raw) }}
            className="w-full text-center bg-transparent text-white font-bold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            style={{ fontSize: 22, lineHeight: 1 }} min={0} max={max} />
          <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 700,
                         textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {unitLabel}
          </span>
        </div>
        <button type="button" onPointerDown={() => onChange(clamp(value + 1, 0, max))}
          className="flex items-center justify-center text-gray-500 active:text-white transition-colors select-none"
          style={{ width: 44 }}>
          <Plus className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2" style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <span style={{ color: '#374151' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
                       textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
        {(days > 0 || hours > 0) && (
          <span className={isRTL ? 'mr-auto' : 'ml-auto'}
            style={{ fontSize: 11, fontWeight: 600, color: '#748ffc',
                     background: 'rgba(92,124,250,0.12)', borderRadius: 6,
                     padding: '1px 7px', border: '1px solid rgba(92,124,250,0.2)' }}>
            {fmtSpeedups(days, hours)}
          </span>
        )}
      </div>
      <div className="flex gap-2.5" style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Counter value={days}  onChange={onDays}  max={999} unitLabel={t.days}  />
        <Counter value={hours} onChange={onHours} max={23}  unitLabel={t.hours} />
      </div>
    </div>
  )
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────
function MicroLabel({ text }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
      {text}
    </p>
  )
}

function FieldErr({ msg }) {
  return (
    <p className="flex items-center gap-1 text-xs" style={{ color: '#f43f5e', animation: 'fadeIn 0.2s ease-out' }}>
      <AlertCircle className="w-3 h-3 shrink-0" />{msg}
    </p>
  )
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="flex-1 h-px" style={{ background: '#1c1f2e' }} />
      <span style={{ fontSize: 10, fontWeight: 800, color: '#374151',
                     textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: '#1c1f2e' }} />
    </div>
  )
}

function Field({ label, icon, error, isRTL, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1.5" style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          {icon && <span style={{ color: '#374151' }}>{icon}</span>}
          <MicroLabel text={label} />
        </div>
      )}
      {children}
      {error && <FieldErr msg={error} />}
    </div>
  )
}

const inputStyle = (hasError) => ({
  background: '#0a0b0f',
  border: `1px solid ${hasError ? '#f43f5e66' : '#1c1f2e'}`,
  outline: 'none',
})

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onDismiss, 4500)
    return () => clearTimeout(id)
  }, [toast, onDismiss])

  if (!toast) return null
  const ok = toast.type === 'success'
  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
      style={{ transform: 'translateX(-50%)', animation: 'toastIn 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
      <div className="flex items-start gap-3 p-4 rounded-2xl backdrop-blur-xl"
        style={{ background: ok ? 'rgba(6,78,59,0.92)' : 'rgba(69,10,10,0.92)',
                 border: `1px solid ${ok ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'}`,
                 boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        {ok
          ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#6ee7b7' }} />
          : <XCircle      className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#fda4af' }} />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-100">{toast.title}</p>
          {toast.msg && <p className="text-xs text-gray-400 mt-0.5">{toast.msg}</p>}
        </div>
        <button onClick={onDismiss} className="text-gray-500 hover:text-gray-300 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Success Modal ────────────────────────────────────────────────────────────
function SuccessModal({ data, t, onClose }) {
  if (!data) return null
  const s      = ALLIANCE_STYLES[data.alliance] || {}
  const both   = data.kvkDays.includes('day1') && data.kvkDays.includes('day4')
  const day1Cfg = KVK_DAYS.find((d) => d.id === 'day1')
  const day4Cfg = KVK_DAYS.find((d) => d.id === 'day4')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.76)', backdropFilter: 'blur(12px)', animation: 'fadeIn 0.2s ease-out' }}>
      <div className="w-full overflow-hidden"
        style={{ maxWidth: 370, background: '#0f1117', border: '1px solid #1c1f2e',
                 borderRadius: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.7)', animation: 'slideUp 0.35s ease-out' }}>
        <div className="h-1" style={{ background: 'linear-gradient(90deg,#4c6ef5,#748ffc,transparent)' }} />
        <div className="p-6 flex flex-col items-center gap-5 text-center">
          <div className="flex items-center justify-center rounded-full"
            style={{ width: 72, height: 72, background: 'rgba(76,110,245,0.12)',
                     border: '1px solid rgba(76,110,245,0.3)',
                     boxShadow: '0 0 40px rgba(92,124,250,0.25)', animation: 'subtleGlow 3s ease-in-out infinite' }}>
            <CheckCircle2 className="w-9 h-9" style={{ color: '#748ffc' }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{t.successTitle}</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{t.successMsg}</p>
          </div>

          <div className="w-full rounded-xl p-4 space-y-3 text-left"
            style={{ background: '#12141c', border: '1px solid #1c1f2e' }}>
            {/* Commander */}
            <SRow label={t.rowCommander} value={data.playerName} />
            {/* Alliance */}
            <SRow label={t.rowAlliance} value={
              <span className="font-bold px-2 py-0.5 rounded-lg text-xs uppercase tracking-widest"
                style={{ color: s.text, background: s.bg, border: `1px solid ${s.border}` }}>
                {data.alliance}
              </span>
            } />
            {/* TC Level */}
            {data.tcLevel && (
              <SRow label={t.rowTc} value={
                <span className="font-bold px-2 py-0.5 rounded-lg text-xs"
                  style={TC_IS_GOLD(data.tcLevel)
                    ? { color:'#fcd34d', background:'rgba(245,158,11,0.14)', border:'1px solid rgba(245,158,11,0.3)' }
                    : { color:'#748ffc', background:'rgba(76,110,245,0.14)', border:'1px solid rgba(76,110,245,0.3)' }}>
                  {data.tcLevel}
                </span>
              } />
            )}
            {/* Time slots */}
            {!both && data.kvkDays.includes('day1') && (
              <SRow label={t.rowSlot} value={
                <span className="flex items-center gap-1.5 justify-end">
                  <span>{day1Cfg.emoji}</span>
                  <span style={{ color: '#fbbf24' }}>{getSlotLabel(data.timeSlotDay1)}</span>
                </span>
              } />
            )}
            {!both && data.kvkDays.includes('day4') && (
              <SRow label={t.rowSlot} value={
                <span className="flex items-center gap-1.5 justify-end">
                  <span>{day4Cfg.emoji}</span>
                  <span style={{ color: '#fbbf24' }}>{getSlotLabel(data.timeSlotDay4)}</span>
                </span>
              } />
            )}
            {both && (
              <>
                <SRow label={t.rowSlotDay1} value={
                  <span className="flex items-center gap-1.5 justify-end">
                    <span>{day1Cfg.emoji}</span>
                    <span style={{ color: '#748ffc' }}>{getSlotLabel(data.timeSlotDay1)}</span>
                  </span>
                } />
                <SRow label={t.rowSlotDay4} value={
                  <span className="flex items-center gap-1.5 justify-end">
                    <span>{day4Cfg.emoji}</span>
                    <span style={{ color: '#fcd34d' }}>{getSlotLabel(data.timeSlotDay4)}</span>
                  </span>
                } />
              </>
            )}
          </div>

          <button onClick={onClose}
            className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg,#4c6ef5,#5c7cfa)',
                     boxShadow: '0 0 24px rgba(92,124,250,0.35)' }}>
            {t.successClose}
          </button>
        </div>
      </div>
    </div>
  )
}

function SRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[22px]">
      <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
                     textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
        {label}
      </span>
      <span className="text-sm font-semibold text-right" style={{ color: '#e2e8f0' }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ─── Booking Closed Notice Card ───────────────────────────────────────────────
function BookingClosedCard({ t, isRTL, lang, setLang, onUnlockRequest }) {
  const navigate = useNavigate()

  return (
    <div className="w-full overflow-hidden"
      style={{ maxWidth: 650, background: '#0f1117', borderRadius: 22,
               animation: 'slideUp 0.4s ease-out, cardGlow 5s ease-in-out infinite',
               border: '1px solid rgba(244,63,94,0.3)' }}>
      {/* Top Rose Accent Strip */}
      <div className="h-1 w-full"
        style={{ background: 'linear-gradient(90deg, #f43f5e 0%, #fb7185 50%, #4c6ef5 100%)' }} />

      {/* Card Header with Crown & Language Switcher */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid #1c1f2e', background: 'rgba(18,20,28,0.5)' }}>
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4" style={{ color: '#f43f5e' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fda4af',
                         textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Ministry Status
          </span>
        </div>
        <LangSwitcher lang={lang} setLang={setLang} />
      </div>

      <div className="p-6 sm:p-8 space-y-6 text-center">
        {/* Lock Icon Badge */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: 'radial-gradient(circle, rgba(244,63,94,0.22) 0%, rgba(244,63,94,0.04) 70%)',
              border: '1px solid rgba(244,63,94,0.45)',
              boxShadow: '0 0 32px rgba(244,63,94,0.25)',
            }}>
            <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-rose-400" />
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center text-white text-[10px] font-bold shadow-lg">
              ✕
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-bold tracking-wider uppercase mb-2.5"
            style={{
              background: 'rgba(244,63,94,0.15)',
              color: '#fda4af',
              border: '1px solid rgba(244,63,94,0.35)',
            }}>
            <Lock className="w-3 h-3 text-rose-400" />
            <span>{t.closedBadge}</span>
          </span>

          <h2 className="font-bold text-white tracking-tight"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 'clamp(1.5rem, 5vw, 2.15rem)',
              lineHeight: 1.15,
            }}>
            {t.closedTitle}
          </h2>

          <p className="font-sans text-sm text-slate-400 mt-2.5 max-w-lg leading-relaxed">
            {t.closedDesc}
          </p>
        </div>

        {/* KvK Prep Schedule Summary Box */}
        <div className="rounded-xl p-4 text-left space-y-3 font-sans"
          style={{ background: '#0a0b0f', border: '1px solid #1c1f2e' }}>
          <div className="flex items-center justify-between pb-2 border-b border-[#1c1f2e] text-xs font-bold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>KvK Prep Schedule</span>
            </span>
            <span className="text-amber-400 font-semibold text-[11px]">Finalizing Slots</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-base">⚒️</span>
              <div>
                <span className="font-semibold text-slate-200">Day 1</span>
                <span className="text-slate-500 block text-[11px]">{t.day1Sub}</span>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
              Closed
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-base">⚔️</span>
              <div>
                <span className="font-semibold text-slate-200">Day 4</span>
                <span className="text-slate-500 block text-[11px]">{t.day4Sub}</span>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
              Closed
            </span>
          </div>

          <div className="pt-2 border-t border-[#1c1f2e] flex items-center justify-between text-[11px] text-slate-500">
            <span>Kingdom Alliances</span>
            <span className="font-bold text-slate-300">TEA · VIK · ERA · FFF</span>
          </div>
        </div>

        {/* Primary Call-to-Action: View Public Schedule */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={() => navigate('/schedule')}
            className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl font-sans font-bold text-white text-sm sm:text-base tracking-tight transition-all duration-200 active:scale-[0.98] shadow-2xl cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #4c6ef5 0%, #5c7cfa 50%, #748ffc 100%)',
              boxShadow: '0 0 32px rgba(92,124,250,0.4), 0 4px 16px rgba(92,124,250,0.3)',
            }}>
            <Clock className="w-5 h-5" />
            <span>{t.btnViewSchedule}</span>
            <ArrowRight className="w-5 h-5 ml-1" />
          </button>

          {/* Secondary Links: Admin Portal & R4 Override */}
          <div className="flex items-center justify-center gap-3 text-xs font-sans text-slate-400 pt-2 flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors font-medium">
              <Crown className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t.btnAdminLogin}</span>
            </button>

            <span className="text-slate-700">·</span>

            <button
              type="button"
              onClick={onUnlockRequest}
              className="text-slate-500 hover:text-slate-300 transition-colors underline decoration-dotted text-[11px]">
              R4 Form Override
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate()
  const [lang, setLang]     = useState('en')
  const [form, setForm]     = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})
  const [submitting, setSub] = useState(false)
  const [toast, setToast]   = useState(null)
  const [successData, setOk] = useState(null)

  // R4 Leadership Override state
  const [adminUnlocked, setAdminUnlocked]     = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [unlockPasscode, setUnlockPasscode]   = useState('')
  const [unlockError, setUnlockError]         = useState('')

  const handleUnlockSubmit = (e) => {
    e.preventDefault()
    const valid = import.meta.env.VITE_ADMIN_PASSWORD || 'admin2323'
    if (unlockPasscode.trim() === valid) {
      setAdminUnlocked(true)
      setShowUnlockModal(false)
      setUnlockPasscode('')
      setUnlockError('')
      showToast('success', 'Form Unlocked', 'R4 Leadership Override enabled.')
    } else {
      setUnlockError('Incorrect leadership passcode.')
    }
  }

  const t     = T[lang]
  const isRTL = lang === 'ar'

  const showToast = useCallback((type, title, msg) => setToast({ type, title, msg }), [])

  const set = (field) => (val) => {
    setForm((p) => ({ ...p, [field]: val }))
    setErrors((p) => ({ ...p, [field]: null }))
  }
  const setField = (field) => (e) => set(field)(e.target.value)

  const validate = () => {
    const e = {}
    if (!form.playerName.trim())      e.playerName   = t.errName
    if (!form.alliance)               e.alliance     = t.errAlliance
    if (form.kvkDays.length === 0)    e.kvkDays      = t.errDay
    if (!form.tcLevel)                e.tcLevel      = t.errTc
    if (form.kvkDays.includes('day1') && !form.timeSlotDay1) e.timeSlotDay1 = t.errSlot
    if (form.kvkDays.includes('day4') && !form.timeSlotDay4) e.timeSlotDay4 = t.errSlot
    return e
  }

  const buildPayload = (f) => {
    const both    = f.kvkDays.includes('day1') && f.kvkDays.includes('day4')
    const only1   = f.kvkDays.includes('day1') && !both
    const only4   = f.kvkDays.includes('day4') && !both
    const tcDisplay = TC_IS_GOLD(f.tcLevel) ? `${f.tcLevel}` : `TC ${f.tcLevel}`

    // Build the day+slot fields
    const daySlotFields = []
    if (only1) {
      daySlotFields.push({ name: '📅 KvK Day',         value: getKvkLabel('day1', t),        inline: true })
      daySlotFields.push({ name: '🕐 Time Slot (UTC)',  value: getSlotLabel(f.timeSlotDay1),  inline: true })
      daySlotFields.push({ name: '\u200b',              value: '\u200b',                      inline: true })
    } else if (only4) {
      daySlotFields.push({ name: '📅 KvK Day',         value: getKvkLabel('day4', t),        inline: true })
      daySlotFields.push({ name: '🕐 Time Slot (UTC)',  value: getSlotLabel(f.timeSlotDay4),  inline: true })
      daySlotFields.push({ name: '\u200b',              value: '\u200b',                      inline: true })
    } else if (both) {
      daySlotFields.push({ name: '⚒️ Day 1 Slot (UTC)', value: getSlotLabel(f.timeSlotDay1), inline: true })
      daySlotFields.push({ name: '⚔️ Day 4 Slot (UTC)', value: getSlotLabel(f.timeSlotDay4), inline: true })
      daySlotFields.push({ name: '\u200b',               value: '\u200b',                    inline: true })
    }

    return {
      username: '2323 KvK Ministry Bot',
      embeds: [{
        author: { name: '2323 KvK · Ministry Appointment Booking' },
        title:  '⚔️ Ministry Appointment Request',
        color:  0x5c7cfa,
        fields: [
          { name: '👤 Commander', value: f.playerName, inline: true },
          { name: '🛡️ Alliance',  value: f.alliance,   inline: true },
          { name: '\u200b',       value: '\u200b',     inline: true },
          { name: '🏰 TC Level',  value: tcDisplay,    inline: true },
          { name: '\u200b',       value: '\u200b',     inline: false },
          ...daySlotFields,
          ...(fmtSpeedups(f.constructionDays, f.constructionHours)
              ? [{ name: '🔨 Construction', value: fmtSpeedups(f.constructionDays, f.constructionHours), inline: true }] : []),
          ...(fmtSpeedups(f.researchDays, f.researchHours)
              ? [{ name: '🧪 Research',     value: fmtSpeedups(f.researchDays,     f.researchHours),     inline: true }] : []),
          ...(fmtSpeedups(f.trainingDays, f.trainingHours)
              ? [{ name: '⚔️ Training',     value: fmtSpeedups(f.trainingDays,     f.trainingHours),     inline: true }] : []),
          ...(f.trueGold
              ? [{ name: '🪙 True Gold',    value: Number(f.trueGold).toLocaleString(),                  inline: true }] : []),
        ],
        footer:    { text: '2323 KvK · Ministry Booking · Kingshot' },
        timestamp: new Date().toISOString(),
      }],
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!adminUnlocked) {
      showToast('error', 'Booking Closed', 'Public submissions are closed. Contact alliance leadership.')
      return
    }
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      showToast('error', t.errCheck, null)
      return
    }
    setSub(true)
    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload(form)),
      })
      if (res.ok || res.status === 204) {
        setOk({ ...form })
        setForm(INITIAL_FORM)
        setErrors({})

        // ── Supabase save (awaited — explicit type coercion & error surfacing) ─
        const snap = { ...form }  // capture before React state clears

        // Strict type coercion: every numeric field → integer, defaulting to 0
        const supabasePayload = {
          player_name:        String(snap.playerName).trim(),
          alliance:           String(snap.alliance),
          selected_days:      Array.isArray(snap.kvkDays) ? snap.kvkDays : [],
          tc_level:           String(snap.tcLevel),
          construction_days:  parseInt(snap.constructionDays,  10) || 0,
          construction_hours: parseInt(snap.constructionHours, 10) || 0,
          research_days:      parseInt(snap.researchDays,      10) || 0,
          research_hours:     parseInt(snap.researchHours,     10) || 0,
          training_days:      parseInt(snap.trainingDays,      10) || 0,
          training_hours:     parseInt(snap.trainingHours,     10) || 0,
          true_gold_count:    parseInt(snap.trueGold,          10) || 0,
          time_slot_day1:     snap.timeSlotDay1 ? String(snap.timeSlotDay1) : null,
          time_slot_day4:     snap.timeSlotDay4 ? String(snap.timeSlotDay4) : null,
        }

        console.log('[Supabase] Inserting payload:', supabasePayload)

        const { data: sbData, error: sbError } = await supabase
          .from('kvk_appointments')
          .insert([supabasePayload])

        if (sbError) {
          console.error('SUPABASE INSERT ERROR:', sbError)
          // eslint-disable-next-line no-alert
          alert(
            `Supabase Error: ${sbError.message}` +
            (sbError.details ? `\nDetails: ${sbError.details}` : '') +
            (sbError.hint    ? `\nHint: ${sbError.hint}`       : '') +
            (sbError.code    ? `\nCode: ${sbError.code}`       : '')
          )
        } else {
          console.log('SUPABASE INSERT SUCCESS:', sbData)
        }
        // ────────────────────────────────────────────────────────────────────
      } else {
        showToast('error', t.errFailed, `Status ${res.status}`)
      }
    } catch {
      showToast('error', t.errNetwork, t.errNetworkMsg)
    } finally {
      setSub(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes toastIn  { from{opacity:0;transform:translateX(-50%) translateY(16px) scale(0.92)} to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)} }
        @keyframes slideUp  { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes subtleGlow {
          0%,100%{box-shadow:0 0 20px rgba(92,124,250,0.12),0 0 0 1px rgba(76,110,245,0.12)}
          50%    {box-shadow:0 0 40px rgba(92,124,250,0.25),0 0 0 1px rgba(76,110,245,0.22)}
        }
        @keyframes cardGlow {
          0%,100%{box-shadow:0 0 0 1px rgba(76,110,245,0.12),0 24px 64px rgba(0,0,0,0.5)}
          50%    {box-shadow:0 0 0 1px rgba(76,110,245,0.22),0 24px 64px rgba(0,0,0,0.5),0 0 40px rgba(92,124,250,0.08)}
        }
        input[type='number'],input[type='text'],select{font-size:16px}
      `}</style>

      <div dir={isRTL ? 'rtl' : 'ltr'}
        className="min-h-screen flex flex-col items-center justify-start px-4 py-8 sm:py-12">

        {/* Brand */}
        <div className="w-full text-center mb-6" style={{ maxWidth: 650, animation: 'slideUp 0.35s ease-out' }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3"
            style={{ background: 'rgba(76,110,245,0.1)', border: '1px solid rgba(76,110,245,0.22)' }}>
            <Sparkles className="w-3 h-3" style={{ color: '#748ffc' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#748ffc',
                           textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {t.badge}
            </span>
          </div>
          <h1 className="font-bold tracking-tight leading-none mb-1"
            style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 'clamp(2rem,8vw,2.75rem)',
                     background: 'linear-gradient(135deg,#748ffc 0%,#5c7cfa 50%,#91a7ff 100%)',
                     WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            2323 KvK
          </h1>
          <p style={{ color: '#9ca3af', fontWeight: 500, fontSize: '1rem' }}>{t.subtitle}</p>
          <div className="mt-2.5">
            <a
              href="#/schedule"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-semibold text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 transition-all">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>View Live Schedule & Free Slots</span>
              <span>&rarr;</span>
            </a>
          </div>
        </div>

        {!adminUnlocked ? (
          <BookingClosedCard
            t={t}
            isRTL={isRTL}
            lang={lang}
            setLang={setLang}
            onUnlockRequest={() => setShowUnlockModal(true)}
          />
        ) : (
          <div className="w-full space-y-4" style={{ maxWidth: 650 }}>
            {/* R4 Override Banner */}
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs">
              <div className="flex items-center gap-2">
                <Unlock className="w-4 h-4 text-amber-400 shrink-0" />
                <span><strong>R4 Leadership Override Active:</strong> Form unlocked for manual entry.</span>
              </div>
              <button
                type="button"
                onClick={() => setAdminUnlocked(false)}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/30 transition-colors">
                Lock Form
              </button>
            </div>

            {/* Card */}
            <div className="w-full overflow-hidden"
              style={{ maxWidth: 650, background: '#0f1117', borderRadius: 22,
                       animation: 'slideUp 0.4s ease-out, cardGlow 5s ease-in-out infinite' }}>
              <div className="h-0.5 w-full"
                style={{ background: 'linear-gradient(90deg,#4c6ef5 0%,#748ffc 60%,transparent 100%)' }} />

              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: '1px solid #1c1f2e', background: 'rgba(18,20,28,0.5)' }}>
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4" style={{ color: '#4c6ef5' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280',
                                 textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Ministry Booking
                  </span>
                </div>
                <LangSwitcher lang={lang} setLang={setLang} />
              </div>

              <form onSubmit={handleSubmit} noValidate className="p-5 sm:p-6 space-y-5">

                {/* 1 ── Player Details */}
                <div className="space-y-4">
                  <Divider label={t.secPlayer} />
                  <Field label={t.labelName} icon={<User className="w-3.5 h-3.5" />}
                    error={errors.playerName} isRTL={isRTL}>
                    <input type="text" value={form.playerName} onChange={setField('playerName')}
                      placeholder={t.placeholderName} dir={isRTL ? 'rtl' : 'ltr'}
                      className="w-full rounded-xl px-4 py-3.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 transition-all"
                      style={inputStyle(errors.playerName)} />
                  </Field>
                  <Field label={t.labelAlliance} icon={<Shield className="w-3.5 h-3.5" />}
                    error={errors.alliance} isRTL={isRTL}>
                    <div className="grid grid-cols-4 gap-2.5">
                      {ALLIANCES.map((a) => {
                        const s   = ALLIANCE_STYLES[a]
                        const sel = form.alliance === a
                        return (
                          <button key={a} type="button" onClick={() => set('alliance')(a)}
                            className="py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-200 active:scale-95"
                            style={sel
                              ? { border: `1.5px solid ${s.border}`, background: s.bg, color: s.text, boxShadow: s.glow }
                              : { border: '1.5px solid #1c1f2e', background: '#0a0b0f', color: '#4b5563' }}>
                            {a}
                          </button>
                        )
                      })}
                    </div>
                  </Field>
                </div>

                {/* 2 ── KvK Prep Day (multi-select) */}
                <div className="space-y-3">
                  <Divider label={t.secDay} />
                  <KvkDaySelector
                    value={form.kvkDays}
                    onChange={set('kvkDays')}
                    error={errors.kvkDays}
                    t={t}
                  />
                </div>

                {/* 3 ── Town Center Level */}
                <div className="space-y-3">
                  <Divider label={t.secTc} />
                  <TcLevelSelector
                    value={form.tcLevel}
                    onChange={set('tcLevel')}
                    error={errors.tcLevel}
                    t={t}
                  />
                </div>

                {/* 4 ── Speedups & Resources */}
                <div className="space-y-4">
                  <Divider label={t.secSpeedups} />
                  <SpeedupRow icon={<Hammer className="w-3.5 h-3.5" />} label={t.labelConstruction}
                    days={form.constructionDays} hours={form.constructionHours}
                    onDays={set('constructionDays')} onHours={set('constructionHours')}
                    t={t} isRTL={isRTL} />
                  <SpeedupRow icon={<FlaskConical className="w-3.5 h-3.5" />} label={t.labelResearch}
                    days={form.researchDays} hours={form.researchHours}
                    onDays={set('researchDays')} onHours={set('researchHours')}
                    t={t} isRTL={isRTL} />
                  <SpeedupRow icon={<Sword className="w-3.5 h-3.5" />} label={t.labelTraining}
                    days={form.trainingDays} hours={form.trainingHours}
                    onDays={set('trainingDays')} onHours={set('trainingHours')}
                    t={t} isRTL={isRTL} />
                  <Field label={t.labelGold} icon={<Coins className="w-3.5 h-3.5" />} isRTL={isRTL}>
                    <input type="number" inputMode="numeric" min="0" value={form.trueGold}
                      onChange={setField('trueGold')} placeholder={t.placeholderGold} dir="ltr"
                      className="w-full rounded-xl px-4 py-3.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      style={{ ...inputStyle(false), textAlign: isRTL ? 'right' : 'left' }} />
                  </Field>
                </div>

                {/* 5 ── Time Slot (dynamic per day) */}
                <div className="space-y-3">
                  <Divider label={t.secSlot} />
                  <TimeSlotSection
                    kvkDays={form.kvkDays}
                    timeSlotDay1={form.timeSlotDay1}
                    timeSlotDay4={form.timeSlotDay4}
                    onDay1={set('timeSlotDay1')}
                    onDay4={set('timeSlotDay4')}
                    errors={errors}
                    t={t}
                    isRTL={isRTL}
                  />
                </div>

                {/* Submit */}
                <button type="submit" disabled={submitting}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-bold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-55 disabled:cursor-not-allowed"
                  style={{ padding: '16px 24px', fontSize: 15,
                           background: submitting ? '#1c1f2e' : 'linear-gradient(135deg,#4c6ef5 0%,#5c7cfa 60%,#748ffc 100%)',
                           boxShadow: submitting ? 'none' : '0 0 36px rgba(92,124,250,0.4),0 4px 20px rgba(92,124,250,0.25)' }}>
                  {submitting
                    ? <><Loader2 className="w-5 h-5 animate-spin" />{t.btnSubmitting}</>
                    : <><Send    className="w-5 h-5" />{t.btnSubmit}</>}
                </button>

              </form>
            </div>
          </div>
        )}

        <p className="mt-6 text-center" style={{ fontSize: 11, color: '#374151' }}>{t.footer}</p>
      </div>

      {/* R4 Leadership Passcode Unlock Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl p-6 bg-[#0f1117] border border-amber-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <h3 className="font-sans font-bold text-white text-base">R4 Leadership Unlock</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowUnlockModal(false); setUnlockError(''); setUnlockPasscode('') }}
                className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="font-sans text-xs text-slate-400 leading-relaxed">
              Enter the alliance leadership passcode to unlock the booking form for manual submissions.
            </p>

            <form onSubmit={handleUnlockSubmit} className="space-y-3">
              <div>
                <input
                  type="password"
                  autoFocus
                  value={unlockPasscode}
                  onChange={(e) => { setUnlockPasscode(e.target.value); setUnlockError('') }}
                  placeholder="Enter passcode…"
                  className="w-full rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                  style={{ background: '#0a0b0f', border: `1px solid ${unlockError ? '#f43f5e' : '#1c1f2e'}` }}
                />
                {unlockError && <p className="text-xs text-rose-400 mt-1.5">{unlockError}</p>}
              </div>

              <div className="flex gap-2 pt-1 font-sans">
                <button
                  type="button"
                  onClick={() => { setShowUnlockModal(false); setUnlockError(''); setUnlockPasscode('') }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-[#161822] border border-[#1c1f2e] transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-black flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-300 transition-colors shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock Form</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SuccessModal data={successData} t={t} onClose={() => setOk(null)} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}
