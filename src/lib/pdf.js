import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Export a single song or setlist to PDF.
 * Renders a hidden div, captures with html2canvas, assembles with jsPDF.
 */

const A4_WIDTH_PX = 794
const A4_HEIGHT_PX = 1123
const MARGIN_PX = 0

export async function exportSongToPDF(songTitle, key, renderElement) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: 'a4',
    hotfixes: ['px_scaling'],
  })

  const canvas = await html2canvas(renderElement, {
    width: A4_WIDTH_PX,
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/png')
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pdfWidth
  const imgHeight = (canvas.height * pdfWidth) / canvas.width

  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
  heightLeft -= pdfHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pdfHeight
  }

  const safeTitle = (songTitle || 'song').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const safeKey = (key || 'unknown').replace(/[^a-z0-9#b]/gi, '')
  pdf.save(`${safeTitle}-${safeKey}.pdf`)
}

export async function exportSetlistToPDF(setlistName, songElements) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: 'a4',
    hotfixes: ['px_scaling'],
  })

  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()

  for (let i = 0; i < songElements.length; i++) {
    const el = songElements[i]
    if (!el) continue

    const canvas = await html2canvas(el, {
      width: A4_WIDTH_PX,
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const imgData = canvas.toDataURL('image/png')
    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * pdfWidth) / canvas.width

    if (i > 0) pdf.addPage()

    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pdfHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight
    }
  }

  const date = new Date().toISOString().split('T')[0]
  const safeName = (setlistName || 'setlist').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  pdf.save(`${safeName}-${date}.pdf`)
}

/**
 * Create a hidden print container sized to A4.
 * Caller is responsible for cleanup.
 */
export function createPrintContainer() {
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${A4_WIDTH_PX}px;
    background: white;
    color: black;
    padding: ${MARGIN_PX}px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
  `
  document.body.appendChild(container)
  return container
}
