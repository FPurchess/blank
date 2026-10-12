# Signing

Sign what you write in Blank and send it as a PDF: your signature, your name, where and when, on the line where it belongs. For a handwritten signature, the same document prints with an empty line to sign on.

## Your signature {#your-signature}

Make your signature once, and Blank uses it for everything you sign. Make it in **Settings ▸ Signing** (`Mod` `,`) with **Add…**, or change it there with **Edit…**. If you sign before you made it, Blank asks for it first.

- **Draw** it with the mouse, a trackpad or a pen. A pen that knows how hard you press draws a heavier line where you press harder. **Clear** starts again.
- **Type** your name and pick one of four styles: formal (Pinyon Script), quick (Ms Madi), legible (Dancing Script) or handwritten (Caveat). Blank keeps the name you type as yours, for the name under your signature, unless you set another in **Settings ▸ Signing ▸ Your name**.
- **Image:** choose a photo or scan of your signature on white paper. Blank keeps only the ink and trims the edges; turn **Remove background** off for a picture that is already transparent.

Your **initials** are made the same way, in the row below. **Remove** takes either away at once; make it again whenever you like.

Your signature and initials stay on this computer, in the `signing` folder next to [blank.json](./configuration#signing). They are never part of a document until you sign it.

## Signature blocks {#blocks}

A signature block is a line for one person to sign on, with their name and role, place and date below it. Insert one from the [Blocks pane](./blocks#pane) (`Mod` `Alt` `B`), under **Signing**.

Select it and press `Enter` (or click the pencil) to set:

- **Role**, e.g. _Tenant_ or _On behalf of Acme GmbH_.
- **Name**: who signs. Leave it empty for whoever signs it; your own name then goes in when you sign. A block with a name shows that name under the signature, so sign only the block with yours.
- **Place**: where it's signed. Empty, the place is filled in when you sign; set here, the block is always signed there.
- **Date**: **When signed** (today's date when you sign), **Leave blank** (a line to write it by hand, also once signed) or **Fixed date**, a date of your own, written like the others.
- **Width**: how much of the line the block takes: **50%** (as it starts), **75%** or **100%**.

A contract for two people has two blocks, one for each. On the pages and in a printout, a block that isn't signed yet shows an empty line to sign by hand, and the word _Signature_ only on the screen.

## Sign and export {#export}

**Export signed PDF…** (`Mod` `Alt` `Shift` `P`) signs your document:

1. If you haven't made your signature yet, Blank asks for it first.
2. Choose which block is yours, if the document has several (the one with your name is chosen for you), and where you sign. Blank remembers the place for the next time. A block that gives its own place is signed there, and the dialog says so; a block with someone else's name gets a warning. The dialog also shows the date that goes under your signature: it's written in the document's language, which you choose in the status bar.
3. Choose where to save the PDF. Blank suggests the document's name with _signed_ after it (_Untitled signed.pdf_ for a document you haven't saved yet), so the unsigned file stays as it is.

The block shows your signature, your name and the place and today's date, written as **Settings ▸ Signing ▸ Date** says: the long form in the document's language (e.g. _8 October 2026_ in British English), its short form, or _2026-10-08_. The markdown file itself never holds your signature.

### Two or more signers {#others}

You sign only your own block; the other blocks keep their empty lines. Send the signed PDF to the others, and they sign it one of two ways:

- **On paper:** they print it, sign on their line by hand, and scan it or send it back.
- **In their PDF app**, with a signature of their own. If you signed digitally, PDF apps then show that something was added after you signed; an app that rewrites the whole file breaks your digital signature.

Blank can't sign PDFs you received yet, so the others can't sign your PDF in Blank.

A Word document you opened in Blank is signed the same way. Blank lays the pages out a little differently from Word, so check every page before you send it, or ask the sender for a PDF.

## Digital signatures {#digital}

A picture of a signature is easy to copy. A digital signature isn't: your certificate signs the PDF, so PDF apps show whether anything changed after you signed. That it was you, they show once the reader trusts your certificate, e.g. after comparing its fingerprint with you (see [below](#check)).

1. **Create your certificate** in **Settings ▸ Signing ▸ Certificate**, with your name and a passphrase that protects it (at least 8 characters), or from the sign dialog with **Create certificate…**. Creating the key takes a few seconds. Or **Import key file…** to use a key file (`.p12` or `.pfx`) you already have, e.g. from your employer or a certificate authority.
2. When you sign, choose **Digital, with your certificate** and type your passphrase. Blank checks it, then signs the PDF after exporting it; the signature block shows your signature as before. The PDF names you as on your certificate.

If you forgot your passphrase, sign with **Picture only**, or **Remove** your certificate and create a new one. If anything goes wrong while signing, nothing is saved.

Your key never leaves your computer and is kept in the `signing` folder, protected by your passphrase. Blank can't recover a forgotten passphrase: use **Back up key…** to keep a copy somewhere safe. **Save certificate…** saves your certificate alone (a `.cer` file), which you can send to people who should trust your signatures. **Remove** asks first, since Blank can't bring a removed key back: signatures you made with it stay valid, but you can't sign with it again. Back up your key before, if you may need it.

### How others check your signature {#check}

- **Acrobat Reader** shows the signature in its signature panel. A certificate Blank made is your own, not one a certificate authority vouches for, so Acrobat says the signer's identity is _unknown_ until the reader trusts it: they open the signature's properties, compare its fingerprint with yours (**Settings ▸ Signing ▸ Fingerprint**, by phone or in person), and add it to their trusted certificates. From then on, your signatures show as valid.
- **LibreOffice**, **Okular** and `pdfsig` show the signature the same way.
- **Blank** shows it in the status bar of the PDF's tab, see [Check the signatures](./pdf#check-the-signatures).
- The EU's free [validator](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation) checks it too. With a certificate Blank made, it finds the signature intact, but reports it as _indeterminate_: no authority it trusts vouches for your certificate.

A **timestamp server** (**Settings ▸ Signing**) vouches for when you signed, instead of your computer's clock: PDF apps that trust the server show its time as checked (Blank names the server and says _not checked_, see [Check the signatures](./pdf#check-the-signatures)). With a server set, Blank saves the PDF only once its timestamp holds. Blank sends it only a fingerprint of your signature, never the document. **Use DigiCert** fills in a free one Acrobat trusts. If the server doesn't answer, nothing is saved: try again, or clear the server to sign without a timestamp.

## What a signature from Blank is worth {#legal}

A signature from Blank is an electronic signature: a picture of your signature on the document. With your certificate, it also shows whether anything changed after you signed. Whether it counts as an _advanced_ electronic signature under eIDAS depends on how the recipient can tie the certificate to you, e.g. by comparing its fingerprint with you. In the EU (eIDAS), the US (ESIGN and UETA) and the UK, an electronic signature can't be denied legal effect just because it's electronic, and it's enough for most agreements, forms and letters.

It is not a _qualified_ electronic signature (QES), which counts as handwritten wherever the law asks for a handwritten signature. Some documents need one, or still need ink: in Germany, for example, ending a job (§ 623 BGB), a guarantee (§ 766 BGB), and promises or acknowledgements of a debt (§§ 780, 781 BGB). When in doubt, sign those by hand.
