# Signing

Sign what you write in Blank and send it as a PDF: your signature, your name, where and when, on the line where it belongs. For a handwritten signature, the same document prints with an empty line to sign on.

## Your signature {#your-signature}

Make your signature once, and Blank uses it for everything you sign. Open it from **Settings ▸ Signing**, or with **Your signature…** in the command search.

- **Draw** it with the mouse, a trackpad or a pen. A pen that knows how hard you press draws a heavier line where you press harder. **Clear** starts again.
- **Type** your name and pick one of four styles: formal (Pinyon Script), quick (Ms Madi), legible (Dancing Script) or handwritten (Caveat).
- **Image:** choose a photo or scan of your signature on white paper. Blank keeps only the ink and trims the edges; turn **Remove background** off for a picture that is already transparent.

Your **initials** are made the same way (**Your initials…**).

Your signature and initials stay on this computer, in the `signing` folder next to [blank.json](./configuration#signing). They are never part of a document until you sign it.

## Signature blocks {#blocks}

A signature block is a line for one person to sign on, with their name and role, place and date below it. Insert one from the [Blocks pane](./blocks#pane), under **Signing**, or with **Signature block** in the command search.

Select it and press `Enter` (or click the pencil) to set:

- **Role**, e.g. _Tenant_ or _On behalf of Acme GmbH_.
- **Name**: who signs. Leave it empty for whoever signs it; your own name then goes in when you sign.
- **Place**: where it's signed. Empty, the place is filled in when you sign.
- **Date**: **When signed** (today's date when you sign), **Leave blank** (a line to write it by hand) or **Fixed…**, a date of your own.
- **Width**: how much of the line the block takes.

A contract for two people has two blocks, one for each. On the pages and in a printout, a block that isn't signed yet shows an empty line to sign by hand, and the word _Signature_ only on the screen.

## Sign and export {#export}

**Export signed PDF…** (in the command search and the export commands) signs your document:

1. If you haven't made your signature yet, Blank asks for it first.
2. Choose which block is yours, if the document has several (the one with your name is chosen for you), and where you sign.
3. Choose where to save the PDF. Blank suggests the document's name with _signed_ after it, so the unsigned file stays as it is.

The block shows your signature, your name and the place and today's date, written as **Settings ▸ Signing ▸ Date** says. The other blocks keep their empty lines for the others to sign. The markdown file itself never holds your signature.

A Word document you opened in Blank is signed the same way. Blank lays the pages out a little differently from Word, so check every page before you send it, or ask the sender for a PDF.

## Digital signatures {#digital}

A picture of a signature is easy to copy. A digital signature isn't: your certificate signs the PDF, so anyone can check in their PDF app that you signed it and that nothing changed since.

1. **Create your certificate** in **Settings ▸ Signing ▸ Certificate**, with your name and a passphrase that protects it (at least 8 characters). Or **Import…** a key file (`.p12` or `.pfx`) you already have, e.g. from your employer or a certificate authority.
2. When you sign, choose **Digital, with your certificate** and type your passphrase. Blank signs the PDF after exporting it; the signature block shows your signature as before.

Your key never leaves your computer and is kept in the `signing` folder, protected by your passphrase. Blank can't recover a forgotten passphrase: use **Back up key…** to keep a copy somewhere safe. **Export…** saves your certificate alone (a `.cer` file), which you can send to people who should trust your signatures.

### How others check your signature {#check}

- **Acrobat Reader** shows the signature in its signature panel. A certificate Blank made is your own, not one a certificate authority vouches for, so Acrobat says the signer's identity is _unknown_ until the reader trusts it: they open the signature's properties, compare its fingerprint with yours (**Settings ▸ Signing ▸ Fingerprint**, by phone or in person), and add it to their trusted certificates. From then on, your signatures show as valid.
- **LibreOffice**, **Okular** and `pdfsig` show the signature the same way.
- The EU's free [validator](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation) checks it too.

A **timestamp server** (**Settings ▸ Signing**) proves when you signed, instead of your computer's clock. Blank sends it only a fingerprint of your signature, never the document. **Use DigiCert** fills in a free one Acrobat trusts.

## What a signature from Blank is worth {#legal}

A signature from Blank is an electronic signature: a picture of your signature on the document, the way most e-signing services sign. With your certificate, it is also an advanced one in the sense of eIDAS: only you hold the key, and any change after signing shows. In the EU (eIDAS), Switzerland, the US (ESIGN and UETA) and the UK, it can't be refused just because it's electronic, and it's enough for most agreements, forms and letters.

It is not a _qualified_ electronic signature (QES), which counts as handwritten wherever the law asks for a handwritten signature. Some documents need one, or still need ink: in Germany, for example, ending a job (§ 623 BGB), a guarantee (§ 766 BGB), and promises or acknowledgements of a debt (§§ 780, 781 BGB). When in doubt, sign those by hand.
