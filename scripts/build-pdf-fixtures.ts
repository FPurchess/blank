// Writes the small PDFs the PDF helper's tests open (src-tauri/pdf/fixtures/),
// by hand, object by object, so each holds exactly what its test needs:
//
// - form.pdf: a form of every kind of field (text, checkbox, combo box,
//   radio buttons, list box), a nested one, a read-only one and an empty
//   signature field, over a label and a line;
// - rotated.pdf: a page turned by /Rotate 90 with an offset crop box and a
//   box drawn under a field, an A5 page, resources inherited from the pages;
// - signature.pdf: a signature field that holds a signature's dictionary
//   (not a valid signature: the helper only reads where it is and what it says);
// - cjk.pdf: Chinese in a font the PDF names but doesn't embed;
// - repaired.pdf: form.pdf with its cross-reference offsets wrong;
// - password.pdf: form.pdf encrypted with the password "secret" (needs qpdf).
//
// Run with `bun scripts/build-pdf-fixtures.ts` and commit the result.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = join(import.meta.dir, "..", "src-tauri", "pdf", "fixtures");
mkdirSync(out, { recursive: true });

/** a PDF of `objects` (object n is objects[n - 1]) with `/Root 1 0 R` */
const pdf = (objects: string[]) => {
  let body = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
};

const stream = (content: string, dict = "") =>
  `<< ${dict} /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;

const helvetica = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

// form.pdf: 1 catalog, 2 pages, 3 page, 4 font, 5 content, 6 name, 7 agree,
// 8 its on appearance, 9 its off appearance, 10 color, 11 signature,
// 12 id, 13 address, 14 street, 15 size (radio buttons), 16 and 17 its
// buttons S and L, 18 fruit (a list box)
const form = pdf([
  "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R 7 0 R 10 0 R 11 0 R 12 0 R 13 0 R 15 0 R 18 0 R] /DA (/Helv 10 Tf 0 g) /DR << /Font << /Helv 4 0 R >> >> >> >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R 7 0 R 10 0 R 11 0 R 12 0 R 14 0 R 16 0 R 17 0 R 18 0 R] >>",
  helvetica,
  stream(
    "BT /F1 12 Tf 100 760 Td (Contract) Tj ET\n" +
      "BT /F1 10 Tf 100 470 Td (Unterschrift) Tj ET\n" +
      "0.5 w 100 490 m 300 490 l S\n" +
      "BT /F1 10 Tf 350 470 Td (Ort, Datum: ______________) Tj ET",
  ),
  "<< /FT /Tx /T (name) /TU (Your name) /Type /Annot /Subtype /Widget /Rect [100 700 300 720] /P 3 0 R /F 4 /DA (/Helv 10 Tf 0 g) /MaxLen 40 >>",
  "<< /FT /Btn /T (agree) /V /Off /AS /Off /Type /Annot /Subtype /Widget /Rect [100 650 115 665] /P 3 0 R /F 4 /AP << /N << /Yes 8 0 R /Off 9 0 R >> >> >>",
  stream("0 g 3 3 9 9 re f", "/Type /XObject /Subtype /Form /BBox [0 0 15 15]"),
  stream("", "/Type /XObject /Subtype /Form /BBox [0 0 15 15]"),
  "<< /FT /Ch /Ff 131072 /T (color) /Opt [(Red) (Green) (Blue)] /V (Green) /Type /Annot /Subtype /Widget /Rect [100 600 250 620] /P 3 0 R /F 4 /DA (/Helv 10 Tf 0 g) >>",
  "<< /FT /Sig /T (signature) /Type /Annot /Subtype /Widget /Rect [100 500 300 550] /P 3 0 R /F 4 >>",
  "<< /FT /Tx /Ff 1 /T (id) /V (A-17) /Type /Annot /Subtype /Widget /Rect [350 700 500 720] /P 3 0 R /F 4 /DA (/Helv 10 Tf 0 g) >>",
  "<< /FT /Tx /T (address) /Kids [14 0 R] >>",
  "<< /T (street) /Parent 13 0 R /Type /Annot /Subtype /Widget /Rect [100 550 300 570] /P 3 0 R /F 4 /DA (/Helv 10 Tf 0 g) >>",
  "<< /FT /Btn /Ff 49152 /T (size) /V /Off /Kids [16 0 R 17 0 R] >>",
  "<< /Parent 15 0 R /Type /Annot /Subtype /Widget /Rect [100 420 115 435] /P 3 0 R /F 4 /AS /Off /AP << /N << /S 8 0 R /Off 9 0 R >> >> >>",
  "<< /Parent 15 0 R /Type /Annot /Subtype /Widget /Rect [130 420 145 435] /P 3 0 R /F 4 /AS /Off /AP << /N << /L 8 0 R /Off 9 0 R >> >> >>",
  "<< /FT /Ch /T (fruit) /Opt [(Apple) (Pear)] /Type /Annot /Subtype /Widget /Rect [350 600 500 640] /P 3 0 R /F 4 /DA (/Helv 10 Tf 0 g) >>",
]);
writeFileSync(join(out, "form.pdf"), form);

// rotated.pdf: page 3 turned by 90 degrees, its crop box 50 pt in from the
// media box, with a box drawn under the field on it (in PDF space
// [100 100 200 130]); page 4 is A5 with no rotation; both take the font
// from the pages
writeFileSync(
  join(out, "rotated.pdf"),
  pdf([
    "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] >> >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Type /Page /Parent 2 0 R /Rotate 90 /MediaBox [0 0 595 842] /CropBox [50 50 545 792] /Contents 6 0 R /Annots [7 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents 8 0 R >>",
    helvetica,
    stream("0 g 100 100 100 30 re f\nBT /F1 12 Tf 100 300 Td (Turned) Tj ET"),
    "<< /FT /Tx /T (stamp) /Type /Annot /Subtype /Widget /Rect [100 100 200 130] /P 3 0 R /F 4 >>",
    stream("BT /F1 12 Tf 72 500 Td (A5) Tj ET"),
  ]),
);

// signature.pdf: a signed signature field, as far as its dictionaries go
writeFileSync(
  join(out, "signature.pdf"),
  pdf([
    "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /SigFlags 3 >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [4 0 R] >>",
    "<< /FT /Sig /T (Signature1) /V 5 0 R /Type /Annot /Subtype /Widget /Rect [72 72 272 122] /P 3 0 R /F 132 >>",
    "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /Name (Ada Lovelace) /Reason (I agree) /Location (London) /M (D:20261008120000Z) /ByteRange [0 0 0 0] /Contents <00> >>",
  ]),
);

// cjk.pdf: 中文 in Adobe-GB1, in a font the PDF names but doesn't embed
writeFileSync(
  join(out, "cjk.pdf"),
  pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 6 0 R /DW 1000 >>",
    "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>",
    stream("BT /F1 40 Tf 20 30 Td <4E2D6587> Tj ET"),
  ]),
);

// repaired.pdf: the offsets of form.pdf's cross-reference table off by one
const text = form.toString("latin1");
writeFileSync(
  join(out, "repaired.pdf"),
  Buffer.from(
    text.replace(
      /^(\d{10}) 00000 n /gm,
      (_, offset: string) =>
        `${String(Number(offset) + 1).padStart(10, "0")} 00000 n `,
    ),
    "latin1",
  ),
);

// the same file on every run: qpdf's options for tests
const qpdf = spawnSync("qpdf", [
  "--static-id",
  "--static-aes-iv",
  "--encrypt",
  "secret",
  "owner",
  "256",
  "--",
  join(out, "form.pdf"),
  join(out, "password.pdf"),
]);
if (qpdf.status !== 0) {
  throw new Error(`qpdf failed: ${qpdf.stderr?.toString() ?? qpdf.error}`);
}
console.log(`Wrote the fixtures to ${out}`);
