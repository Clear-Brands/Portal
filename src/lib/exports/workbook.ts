import 'server-only'

import ExcelJS from 'exceljs'

/**
 * Excel exports, generated on the server.
 *
 * The original loaded SheetJS from a CDN at runtime and, if that request failed,
 * silently produced a CSV instead — the person clicking "Export for Excel" got a
 * different file and was never told. Here the library is a bundled dependency,
 * the file is built server-side and streamed, and a failure is a real error.
 */

export interface Column {
  header: string
  key: string
  width?: number
  /** Right-aligned with a currency format and tabular figures. */
  money?: boolean
}

const VOLT = 'FFC8F52F'
const INK = 'FF0D0D0F'

export interface SheetSpec {
  name: string
  title?: string
  subtitle?: string
  columns: Column[]
  rows: Record<string, unknown>[]
  /** Rendered as a bold row at the bottom. */
  totals?: Record<string, unknown>
  /** Inserted as a bold divider before the row at this index. */
  groups?: { atIndex: number; label: string; totals?: Record<string, unknown> }[]
}

export async function buildWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Clear Brands Partner Portal'
  workbook.created = new Date()

  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31))
    let cursor = 1

    if (spec.title) {
      const cell = sheet.getCell(cursor, 1)
      cell.value = spec.title
      cell.font = { bold: true, size: 14 }
      sheet.mergeCells(cursor, 1, cursor, Math.max(spec.columns.length, 2))
      cursor += 1
    }

    if (spec.subtitle) {
      const cell = sheet.getCell(cursor, 1)
      cell.value = spec.subtitle
      cell.font = { size: 10, color: { argb: 'FF666666' } }
      sheet.mergeCells(cursor, 1, cursor, Math.max(spec.columns.length, 2))
      cursor += 1
    }

    if (spec.title || spec.subtitle) cursor += 1

    const headerRow = sheet.getRow(cursor)
    spec.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { bold: true, color: { argb: INK } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VOLT } }
      cell.alignment = { horizontal: col.money ? 'right' : 'left' }
    })
    headerRow.commit()
    const headerIndex = cursor
    cursor += 1

    const groupsByIndex = new Map((spec.groups ?? []).map((g) => [g.atIndex, g]))

    spec.rows.forEach((row, index) => {
      const group = groupsByIndex.get(index)
      if (group) {
        const groupRow = sheet.getRow(cursor)
        groupRow.getCell(1).value = group.label
        groupRow.getCell(1).font = { bold: true }
        cursor += 1
      }

      const sheetRow = sheet.getRow(cursor)
      spec.columns.forEach((col, i) => {
        const cell = sheetRow.getCell(i + 1)
        const value = row[col.key]
        cell.value = col.money ? Number(value ?? 0) : ((value as string) ?? '')
        if (col.money) {
          cell.numFmt = '$#,##0.00'
          cell.alignment = { horizontal: 'right' }
        }
      })
      cursor += 1
    })

    if (spec.totals) {
      const totalRow = sheet.getRow(cursor)
      spec.columns.forEach((col, i) => {
        const cell = totalRow.getCell(i + 1)
        const value = spec.totals![col.key]
        if (value != null) {
          cell.value = col.money ? Number(value) : (value as string)
          if (col.money) {
            cell.numFmt = '$#,##0.00'
            cell.alignment = { horizontal: 'right' }
          }
        }
        cell.font = { bold: true }
        cell.border = { top: { style: 'thin' } }
      })
      cursor += 1
    }

    spec.columns.forEach((col, i) => {
      sheet.getColumn(i + 1).width = col.width ?? Math.max(col.header.length + 4, 14)
    })

    sheet.views = [{ state: 'frozen', ySplit: headerIndex }]
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/** A safe, dated filename. */
export function exportFilename(base: string, today: string): string {
  const clean = base.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '')
  return `${clean}-${today}.xlsx`
}

export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
