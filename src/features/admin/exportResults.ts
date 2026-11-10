import { formatEAT } from '@/lib/time'
import type { ExamResults } from './types'

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'results'
}

function hms(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Downloads an .xlsx with two sheets: Results (one row per student) and Questions
 * (per-question statistics). SheetJS is imported on demand so it never ships to students.
 * Times are East Africa Time.
 */
export async function exportResultsXlsx(data: ExamResults): Promise<void> {
  const XLSX = await import('xlsx')

  const results = data.rows.map((r) => ({
    Rank: r.rank ?? '',
    Name: r.full_name ?? '',
    School: r.school ?? '',
    Stream: r.stream ?? '',
    Score: r.score,
    'Max score': r.max_score,
    'Percent': r.percentage ?? '',
    'Time taken': hms(r.time_taken_seconds),
    'Auto-submitted': r.auto_submitted ? 'Yes' : 'No',
    Attempt: r.attempt_no,
    'Submitted (EAT)': formatEAT(r.submitted_at),
    Banned: r.is_banned ? 'Yes' : '',
  }))

  const questions = data.questions.map((q) => {
    const wrong = (['A', 'B', 'C', 'D'] as const)
      .filter((l) => l !== q.correct_option)
      .map((l) => ({ l, n: q.counts[l] }))
      .sort((a, b) => b.n - a.n)[0]
    return {
      No: q.position,
      Question: q.body,
      'Correct answer': q.correct_option ?? '',
      Points: q.points,
      Answered: q.answered,
      Correct: q.correct,
      '% correct': q.participants ? Math.round((1000 * q.correct) / q.participants) / 10 : '',
      'Most chosen wrong': wrong && wrong.n > 0 ? `${wrong.l} (${wrong.n})` : '',
      A: q.counts.A,
      B: q.counts.B,
      C: q.counts.C,
      D: q.counts.D,
    }
  })

  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(results)
  ws1['!cols'] = [6, 28, 28, 10, 7, 9, 8, 10, 14, 8, 20, 8].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws1, 'Results')
  const ws2 = XLSX.utils.json_to_sheet(questions)
  ws2['!cols'] = [5, 60, 14, 7, 9, 8, 10, 18, 5, 5, 5, 5].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws2, 'Questions')

  XLSX.writeFile(wb, `${safeFileName(data.exam.title)} - results.xlsx`, { compression: true })
}
