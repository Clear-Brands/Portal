import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { listPrizeLines, PRIZE_STATUS_LABEL } from '@/lib/data/programs'
import { buildWorkbook, exportFilename, xlsxResponse } from '@/lib/exports/workbook'

const SOURCE_LABEL: Record<string, string> = {
  competition: 'Competition',
  sprint_team: 'Sprint (pod)',
  sprint_rep: 'Sprint (rep)',
  annual_goal: 'Annual goal',
}

/** The prize list, exactly as /programs/prizes shows it. */
export async function GET() {
  const profile = await requireSession()
  if (!can(profile, 'exports.run')) return new Response('Not permitted', { status: 403 })

  const partner = await getActivePartner()
  const today = await partnerToday()
  const lines = await listPrizeLines()

  const rows = lines.map((line) => ({
    program: SOURCE_LABEL[line.source] ?? line.source,
    name: line.sourceName,
    who: line.personName,
    prize: line.prize,
    status: PRIZE_STATUS_LABEL[line.status],
  }))

  const buffer = await buildWorkbook([
    {
      name: 'Prizes',
      title: `${partner?.name ?? 'Partner'} — prize list`,
      subtitle: `As of ${today}.`,
      columns: [
        { header: 'Program', key: 'program', width: 16 },
        { header: 'Name', key: 'name', width: 26 },
        { header: 'Who', key: 'who', width: 24 },
        { header: 'Prize', key: 'prize', width: 26 },
        { header: 'Status', key: 'status', width: 18 },
      ],
      rows,
    },
  ])

  return xlsxResponse(buffer, exportFilename(`${partner?.slug ?? 'partner'}-prizes`, today))
}
