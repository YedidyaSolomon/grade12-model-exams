import {
  Atom,
  BookMarked,
  BookOpen,
  Brain,
  Dna,
  FlaskConical,
  Globe,
  Landmark,
  Monitor,
  Scale,
  Sigma,
  Sprout,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Subject is free text typed by admins, so match on keywords and fall back to a book.
 * Icons are decorative: the subject name is always shown next to the tile.
 */
const SUBJECTS: [RegExp, LucideIcon, string][] = [
  [/math/i, Sigma, 'bg-indigo-100 text-indigo-700'],
  [/phys/i, Atom, 'bg-sky-100 text-sky-700'],
  [/chem/i, FlaskConical, 'bg-fuchsia-100 text-fuchsia-700'],
  [/bio/i, Dna, 'bg-emerald-100 text-emerald-700'],
  [/english|amharic|afaan|language|literature/i, BookOpen, 'bg-rose-100 text-rose-700'],
  [/geo/i, Globe, 'bg-teal-100 text-teal-700'],
  [/hist/i, Landmark, 'bg-orange-100 text-orange-800'],
  [/econ/i, TrendingUp, 'bg-lime-100 text-lime-800'],
  [/civic|citizen/i, Scale, 'bg-violet-100 text-violet-700'],
  [/aptitude|scholastic/i, Brain, 'bg-amber-100 text-amber-800'],
  [/\bict\b|computer|information tech/i, Monitor, 'bg-cyan-100 text-cyan-800'],
  [/agri/i, Sprout, 'bg-green-100 text-green-800'],
]

export function SubjectIcon({ subject, className }: { subject: string; className?: string }) {
  const match = SUBJECTS.find(([re]) => re.test(subject))
  const Icon = match?.[1] ?? BookMarked
  const tone = match?.[2] ?? 'bg-gold-soft text-gold-foreground'
  return (
    <span aria-hidden className={cn('grid size-11 shrink-0 place-items-center rounded-lg', tone, className)}>
      <Icon className="size-[1.375rem]" strokeWidth={2.25} />
    </span>
  )
}
