# PDFs

Blank opens the PDFs people send you, so you can read them next to your own writing and see at once whether they're signed, by whom, and whether anything changed since.

## Open a PDF {#open}

Press `Mod` `O` and pick a PDF, or drop one on Blank's icon, or right-click it in your file manager and choose **Open With → Blank**. It opens in a tab of its own, next to your documents.

The pages show as they print: one below the other, white in every theme, as wide as the window allows. Scroll with the mouse, `↑` `↓`, `Page Up` `Page Down`, `Space`, or `Home` and `End` for the first and last page. The status bar says which page you're on; click it to go to another. Next to it is the PDF's paper, e.g. A4.

To see the pages larger or smaller, [zoom](./pages#zoom) as in your documents: `Mod` `=` and `Mod` `-`, `Ctrl` and the mouse wheel, or − and + in the status bar, where a click on the zoom fits the pages to the window again. The zoom is the same in every tab, and the spot under the pointer, or in the middle of the window, stays where it is.

Blank never changes the file itself. What you [place on its pages](#stamps) stays in Blank until you sign; so exporting, formatting, searching and the page setup aren't there: their shortcuts say so, and in the [main menu](./menu) they're greyed out, saying why when you point at them. Close the tab with `Mod` `W` as any other; when you start Blank again, it opens the PDF again from its file. A large PDF opens in the background: its tab says _Opening …_ meanwhile, and you can go on in your other tabs.

## Place your signature, initials, date and place {#stamps}

In a PDF tab, the toolbar above the pages has the signing tools: **Signature**, **Initials**, **Date** and **Place**, then **Sign…**.

- **With the mouse:** click a tool, then click the page where it goes: it's placed there, centred on the click. While a tool waits for the click, the pointer is a crosshair; `Esc` or a second click on the tool puts it down again.
- **With the keyboard:** press `Alt` `F10` (or `F6` until you're in the toolbar), go to a tool with `←` `→` and press `Enter` or `Space`. It's placed on the page you're reading: a signature in the lower third, centred; initials at the bottom right; a date or place below your last signature.

The first time you use **Signature** or **Initials**, Blank asks you to [make them](./signing#your-signature), then places them. The date is today's, written as **Settings ▸ Signing ▸ Date** says, in the document's language; the place is where you signed last.

What you placed is selected, with a ring and four corners, and a small toolbar above it:

| To                                          | Mouse                                   | Keys                                                                  |
| ------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| Move it                                     | drag it                                 | `←` `→` `↑` `↓` by 1 pt, with `Shift` 10 pt                           |
| Make it larger or smaller (its shape stays) | drag a corner                           | `Alt` `→` or `↑` larger, `Alt` `←` or `↓` smaller, with `Shift` 10 pt |
| Remove it                                   | **Remove** on its toolbar               | `Delete` or `Backspace`                                               |
| Put initials on every page                  | **Repeat on every page** on its toolbar | `Tab` to the toolbar, then `Enter`                                    |
| Undo, redo                                  |                                         | `Mod` `Z`, `Mod` `Shift` `Z`                                          |
| Leave it                                    | click elsewhere on the pages            | `Esc`                                                                 |

It stays on its page, with at least a little of it showing, and grows to at most three times its size and shrinks to half. Repeated initials show faded on the other pages, at the same spot, moved into smaller pages. `Tab` goes from one stamp to the next in reading order, and a screen reader names each, e.g. _Signature on page 2_.

A PDF tab with something placed on it has a dot, as a document with unsaved changes has. Blank keeps what you placed when you close Blank, and when you start it again, it's back on the pages, as long as the file is the same. If the file changed, what was on pages it no longer has is gone, and Blank says so. Closing the tab asks whether to **Sign…** it first; **Discard** drops what you placed.

Some PDFs don't allow everything, and the tools say why when you point at them:

- **Signed already:** only your signature can be added, in a signature field of its own. Initials, a date or a place would change pages the earlier signers signed.
- **Allows no changes** (certified so by its author), **restricted** by its author, or **damaged:** nothing can be added, and the toolbar says why.
- When Blank's page layout didn't start, the tools are off, and the toolbar says so.

### Sign it {#sign-received}

**Sign…**, or `Mod` `S` in a PDF tab, will sign the PDF with what you placed on it. Signing PDFs you received, and filling in their forms, is still being finished: for now, **Sign…** says so. Until then, sign them in your PDF app, or print, sign and scan them. Your own documents you sign in Blank with [Export signed PDF](./signing#export).

## Print a PDF {#print}

Press `Mod` `P`, or choose **Print…** in the main menu or the tab's menu, and the PDF goes straight to your system's print dialog, as it is: Blank's own print dialog is for the pages Blank lays out. Choose the printer and its options there.

- **Linux:** Blank prints the PDF whole, at its own size, and says so before the print dialog opens: leave all pages and 100% there. If you choose some pages or another scale anyway, Blank prints nothing and says why; print it again with all pages at 100%, or open the PDF in another app to print part of it.
- **macOS** and **Windows:** the print dialog prints the pages you choose there.

If the file changed since Blank opened it, Blank doesn't print it, since it wouldn't be what the tab shows: the tab says the PDF changed, with **Open again** to show it as it is now, and then you can print it. If it was moved or deleted, the tab offers **Find it…**.

## When a PDF can't be shown {#problems}

Instead of the pages, the tab then says why, with what you can do about it:

- **Moved or deleted:** the file isn't where it was, also when you start Blank again. **Find it…** picks where it went.
- **Changed:** another app changed the file after Blank opened it. **Open again** shows it as it is now.
- **Damaged, too large or complex:** Blank can't read it, or it would take too much memory or time. Open it in another app.
- **Needs a password:** Blank can't open PDFs with a password yet.

Blank draws a PDF's pages with a separate program, `blank-pdf`, one for each PDF tab. A PDF that takes it down only takes down its tab: Blank starts it again once, and a page it couldn't draw says _Blank couldn't draw this page_. If it stops while it opens the PDF, or a second time, the tab says so, with **Open again** to try once more and **Close tab**. Everything else in Blank goes on as before.

## Check the signatures {#check-the-signatures}

The status bar of a PDF tab says what the PDF's digital signatures say:

| Status bar               | What it means                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not signed               | The PDF has no digital signatures.                                                                                                                                                                                                                 |
| Signed, Signed by 2      | Nothing changed since it was signed, and each certificate is yours or one you trust.                                                                                                                                                               |
| Signed, signer unknown   | Nothing changed since it was signed, but Blank doesn't know a certificate: see below how to trust it.                                                                                                                                              |
| Changed and signed again | A signature is valid for the version it signed, but the PDF was changed after it and signed again later; its list says by whom. Check who made the changes.                                                                                        |
| Weak signature           | A signature relies on SHA-1, an old algorithm whose signatures can be forged. Don't rely on it.                                                                                                                                                    |
| Changed after signing    | Someone changed the PDF after it was signed.                                                                                                                                                                                                       |
| Signature invalid        | A signature doesn't match the PDF.                                                                                                                                                                                                                 |
| Signatures not checked   | Blank couldn't read the PDF's signatures. Open the PDF in your PDF app to check them. If the file changed or was moved after Blank opened it, the status says so, and the list offers **Open again** for a changed file, to check it as it is now. |

When the check finds something wrong or doubtful, a screen reader reads it out.

Click it to see each signature: who signed, when, by whose clock, and what Blank found. **Details…** shows the signer's certificate and its fingerprint. The time comes from one of two clocks:

- _computer clock_: only the signer's computer says so, and it can be set to any time. A time without a time zone is shown as the PDF writes it.
- _timestamped by_ a server, e.g. _timestamped by DigiCert (not checked)_: a timestamp server vouched for the time. Blank checks that the timestamp belongs to the signature, but not who made it, so it says _not checked_ unless you trust the server's certificate. Your PDF app checks timestamp servers, if you need it.

A signature whose certificate a certificate authority issued shows as _Intact · says it's issued by_ that authority: Blank repeats what the certificate claims. It checks that the PDF hasn't changed since, but it doesn't check certificate authorities or whether a certificate was revoked: your PDF app does that, if you need it.

### Trust a certificate {#trust}

To have someone's signatures show as **Signed**, trust their certificate once:

1. Open the signature's **Details…**.
2. Compare all of the **Fingerprint**, every group, with the one the signer tells you, by phone or in person. If they sign with Blank, they find theirs in **Settings ▸ Signing ▸ Fingerprint**.
3. If it's the same, choose **Trust this certificate…** and confirm.

From then on, their signatures show as **Signed** in every PDF. Your own certificate is always trusted. **Settings ▸ Signing ▸ Trusted certificates** lists the ones you trust, where **Remove** takes one off the list again.
