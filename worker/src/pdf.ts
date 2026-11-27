/** A small text PDF. No third-party renderer and no images. */
export function textPdf(title: string, body: string): Uint8Array {
  const lines = [title, "", ...wrap(body, 88)];
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));
  if (!pages.length) pages.push([""]);

  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((pageLines, index) => {
    const contentId = 4 + index * 2;
    const pageId = contentId + 1;
    pageIds.push(pageId);
    const commands = ["BT", "/F1 11 Tf", "50 780 Td", "14 TL"];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex === 0 && index === 0) commands.push("/F1 16 Tf", `(${pdfEscape(line)}) Tj`, "/F1 11 Tf", "T*");
      else commands.push(`(${pdfEscape(line)}) Tj`, "T*");
    });
    commands.push("ET");
    const stream = commands.join("\n");
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  });

  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>`;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    if (!objects[id]) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  const size = objects.length;
  pdf += `xref\n0 ${size}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id < size; id++) {
    pdf += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function wrap(value: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of value.split("\n")) {
    if (!paragraph) {
      out.push("");
      continue;
    }
    let rest = paragraph;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut < 20) cut = width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    out.push(rest);
  }
  return out;
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
