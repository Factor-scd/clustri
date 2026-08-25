import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function initReveal() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]')
  if (!els.length) return
  if (prefersReduced) {
    els.forEach((el) => el.classList.add('revealed'))
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          const delay = parseInt(el.dataset.revealDelay || '0', 10)
          setTimeout(() => el.classList.add('revealed'), delay)
          observer.unobserve(el)
        }
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  )
  els.forEach((el) => observer.observe(el))
}

function initStagger() {
  const groups = document.querySelectorAll<HTMLElement>('[data-stagger]')
  if (!groups.length) return
  if (prefersReduced) {
    groups.forEach((g) => {
      g.querySelectorAll<HTMLElement>('[data-stagger-child]').forEach((c) => c.classList.add('staggered'))
    })
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const group = entry.target as HTMLElement
          const children = group.querySelectorAll<HTMLElement>('[data-stagger-child]')
          children.forEach((child, i) => {
            setTimeout(() => child.classList.add('staggered'), i * 70)
          })
          observer.unobserve(group)
        }
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -30px 0px' },
  )
  groups.forEach((g) => observer.observe(g))
}

function initNav() {
  const header = document.querySelector<HTMLElement>('.nav-header')
  if (!header) return
  let ticking = false
  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      header.classList.toggle('nav-scrolled', window.scrollY > 60)
      ticking = false
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
}

function initParallax() {
  if (prefersReduced) return
  const targets = document.querySelectorAll<HTMLElement>('[data-parallax]')
  if (!targets.length) return
  let ticking = false
  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      targets.forEach((el) => {
        const speed = parseFloat(el.dataset.parallax || '0.12')
        const rect = el.getBoundingClientRect()
        el.style.transform = `translateY(${rect.top * speed}px)`
      })
      ticking = false
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
}

function initTerminalTyping() {
  if (prefersReduced) return
  const terminals = document.querySelectorAll<HTMLElement>('[data-terminal]')
  if (!terminals.length) return
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const container = entry.target as HTMLElement
          const lines = container.querySelectorAll<HTMLElement>('[data-line]')
          lines.forEach((line, i) => {
            setTimeout(() => {
              line.classList.add('line-visible')
              const out = line.querySelector<HTMLElement>('[data-output]')
              if (out) setTimeout(() => out.classList.add('output-visible'), 280)
            }, i * 550)
          })
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.3 },
  )
  terminals.forEach((el) => observer.observe(el))
}

function initCountUp() {
  const els = document.querySelectorAll<HTMLElement>('[data-countup]')
  if (!els.length) return
  if (prefersReduced) {
    els.forEach((el) => { el.textContent = el.dataset.countup || '' })
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          const target = parseInt(el.dataset.countup || '0', 10)
          const suffix = el.dataset.countupSuffix || ''
          const obj = { v: 0 }
          gsap.to(obj, {
            v: target,
            duration: 1.2,
            ease: 'power3.out',
            onUpdate: () => { el.textContent = Math.round(obj.v).toString() + suffix },
            onComplete: () => { el.textContent = target.toString() + suffix },
          })
          observer.unobserve(el)
        }
      })
    },
    { threshold: 0.5 },
  )
  els.forEach((el) => observer.observe(el))
}

function initLiveDashboard() {
  if (prefersReduced) return
  const root = document.querySelector<HTMLElement>('[data-live-dashboard]')
  if (!root) return

  const cpuEls = root.querySelectorAll<HTMLElement>('[data-live-cpu]')
  const ramEls = root.querySelectorAll<HTMLElement>('[data-live-ram]')
  const barEls = root.querySelectorAll<HTMLElement>('[data-live-bar]')
  const taskList = root.querySelector<HTMLElement>('[data-live-tasks]')

  const pool = [
    { chip: 'RUNNING', cls: 'border-warning/30 bg-warning/10 text-warning', text: 'Start VM 104', node: 'pve3', time: 'now' },
    { chip: 'OK', cls: 'border-success/25 bg-success/10 text-success', text: 'Snapshot vm-100', node: 'pve1', time: 'now' },
    { chip: 'RUNNING', cls: 'border-warning/30 bg-warning/10 text-warning', text: 'Move VM 102 to pve3', node: 'pve1 → pve3', time: 'now' },
    { chip: 'OK', cls: 'border-success/25 bg-success/10 text-success', text: 'Back up ct-201 to PBS', node: 'pve2', time: 'now' },
    { chip: 'DONE', cls: 'border-white/10 bg-white/[0.04] text-muted-foreground', text: 'Prune main datastore', node: 'pbs', time: 'now' },
  ]
  let poolIdx = 0

  function jitterBars() {
    barEls.forEach((bar) => {
      const base = parseFloat(bar.dataset.base || '30')
      const next = Math.max(8, Math.min(92, base + (Math.random() - 0.5) * 10))
      bar.style.width = next.toFixed(0) + '%'
      bar.dataset.base = next.toFixed(1)
    })
  }

  function jitterNumbers() {
    cpuEls.forEach((el) => {
      const base = parseFloat(el.dataset.base || '32')
      const next = Math.max(6, Math.min(88, base + (Math.random() - 0.5) * 6))
      el.textContent = next.toFixed(0) + '%'
      el.dataset.base = next.toFixed(1)
      el.classList.remove('ticker-flash')
      void el.offsetWidth
      el.classList.add('ticker-flash')
    })
    ramEls.forEach((el) => {
      const base = parseFloat(el.dataset.base || '24')
      const next = Math.max(8, Math.min(85, base + (Math.random() - 0.5) * 5))
      el.textContent = next.toFixed(0) + '%'
      el.dataset.base = next.toFixed(1)
    })
  }

  function pushTask() {
    if (!taskList) return
    const item = pool[poolIdx % pool.length]
    poolIdx++
    const row = document.createElement('div')
    row.className = 'flex items-center justify-between gap-3 px-3 py-2 opacity-0 translate-y-1 transition-all duration-500'
    row.innerHTML = `<div class="flex min-w-0 items-center gap-2"><span class="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium ${item.cls}">${item.chip}</span><p class="truncate font-mono text-[11px] tabular-nums text-foreground">${item.text}<span class="text-muted-foreground"> · ${item.node}</span></p></div><span class="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">${item.time}</span>`
    taskList.prepend(row)
    requestAnimationFrame(() => {
      row.classList.remove('opacity-0', 'translate-y-1')
    })
    const rows = taskList.children
    if (rows.length > 4) taskList.removeChild(rows[rows.length - 1]!)
  }

  setInterval(() => { jitterBars(); jitterNumbers() }, 1800)
  setInterval(pushTask, 3200)
}

function initCommandPalette() {
  const overlay = document.getElementById('cmdk-overlay') as HTMLElement | null
  const panel = document.getElementById('cmdk-panel') as HTMLElement | null
  const input = document.getElementById('cmdk-input') as HTMLInputElement | null
  const list = document.getElementById('cmdk-list') as HTMLElement | null
  if (!overlay || !panel || !input || !list) return

  const commands = [
    { label: 'See features', desc: 'Failover, credentials, guests', action: () => scrollToId('features') },
    { label: 'Open console', desc: 'VM and container consoles', action: () => scrollToId('console') },
    { label: 'See architecture', desc: 'Watch requests move', action: () => scrollToId('architecture') },
    { label: 'See releases', desc: 'Packages are not published yet', action: () => scrollToId('download') },
    { label: 'Stop pve1 (demo)', desc: 'Stop pve1 and watch failover', action: () => { scrollToId('failover-playground'); setTimeout(() => document.getElementById('fp-kill-pve1')?.click(), 600) } },
    { label: 'Copy install command', desc: 'Copy npm run tauri dev', action: () => navigator.clipboard.writeText('npm run tauri dev') },
  ]

  let filtered = [...commands]
  let selected = 0
  let open = false

  function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' })
  }

  function render() {
    list!.innerHTML = ''
    filtered.forEach((cmd, i) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = `flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${i === selected ? 'bg-white/[0.06] text-foreground' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}`
      row.innerHTML = `<span class="min-w-0"><span class="block text-[13px] font-medium leading-none">${cmd.label}</span><span class="mt-1 block font-mono text-[11px]">${cmd.desc}</span></span><span class="shrink-0 font-mono text-[10px] text-muted-foreground/60">${i === selected ? '↵' : ''}</span>`
      row.addEventListener('click', () => { close(); cmd.action() })
      list!.appendChild(row)
    })
  }

  function openPalette() {
    if (open) return
    open = true
    overlay!.classList.remove('hidden')
    overlay!.classList.add('flex')
    input!.value = ''
    filtered = [...commands]
    selected = 0
    render()
    requestAnimationFrame(() => input!.focus())
    document.body.style.overflow = 'hidden'
  }

  function close() {
    if (!open) return
    open = false
    overlay!.classList.add('hidden')
    overlay!.classList.remove('flex')
    document.body.style.overflow = ''
  }

  input!.addEventListener('input', () => {
    const q = input!.value.toLowerCase().trim()
    filtered = q ? commands.filter((c) => (c.label + c.desc).toLowerCase().includes(q)) : [...commands]
    selected = 0
    render()
  })

  overlay!.addEventListener('click', (e) => { if (e.target === overlay) close() })

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (open) close(); else openPalette()
      return
    }
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); close() }
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, filtered.length - 1); render() }
    if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); render() }
    if (e.key === 'Enter') { e.preventDefault(); const cmd = filtered[selected]; if (cmd) { close(); cmd.action() } }
  })

  document.querySelectorAll<HTMLElement>('[data-cmdk-trigger]').forEach((el) => {
    el.addEventListener('click', (ev) => { ev.preventDefault(); openPalette() })
  })
}

function init() {
  initReveal()
  initStagger()
  initNav()
  initParallax()
  initTerminalTyping()
  initCountUp()
  initLiveDashboard()
  initCommandPalette()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
