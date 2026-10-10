# PDFs

Blank opens the PDFs people send you, so you can read them next to your own writing and see at once whether they're signed, by whom, and whether anything changed since.

## Open a PDF {#open}

Press `Mod` `O` and pick a PDF, or drop one on Blank's icon, or right-click it in your file manager and choose **Open With → Blank**. It opens in a tab of its own, next to your documents.

The pages show as they print: one below the other, white in every theme, as wide as the window allows. Scroll with the mouse, `↑` `↓`, `Page Up` `Page Down`, `Space`, or `Home` and `End` for the first and last page. The status bar says which page you're on; click it to go to another. Next to it is the PDF's paper, e.g. A4.

To see the pages larger or smaller, [zoom](./pages#zoom) as in your documents: `Mod` `=` and `Mod` `-`, `Ctrl` and the mouse wheel, or − and + in the status bar, where a click on the zoom fits the pages to the window again. The zoom is the same in every tab, and the spot under the pointer, or in the middle of the window, stays where it is.

A PDF tab only shows the PDF: Blank never changes the file. So saving, exporting, formatting and the page setup aren't there: their shortcuts say so, and in the [main menu](./menu) they're greyed out, saying why when you point at them. Close the tab with `Mod` `W` as any other; when you start Blank again, it opens the PDF again from its file.

Blank can't open PDFs with a password yet. A damaged PDF Blank can't read says so instead of its pages. If the file was moved or deleted since you last opened it, the tab says so too, with **Find it…** to pick where it went.

## Print a PDF {#print}

Press `Mod` `P`, or choose **Print…** in the main menu or the tab's menu, and the PDF goes straight to your system's print dialog, as it is: Blank's own print dialog is for the pages Blank lays out. Choose the printer and its options there.

- **Linux:** Blank prints the PDF whole, at its own size. If you choose some pages or another scale in the print dialog, Blank says so and prints nothing; print it again with all pages at 100%, or open the PDF in another app to print part of it.
- **macOS** and **Windows:** the print dialog prints the pages you choose there.

If the file changed since Blank opened it, Blank doesn't print it, since it wouldn't be what the tab shows: close the tab and open the PDF again.

### When a PDF can't be shown {#problems}

Blank draws a PDF's pages with a separate program, `blank-pdf`, one for each PDF tab. A PDF that takes it down only takes down its tab: Blank starts it again once, and a page it couldn't draw says _Blank couldn't draw this page_. If it stops again, the tab says _Blank can't show this PDF any more_, with **Open again** to try once more and **Close tab**. Everything else in Blank goes on as before.

## Check the signatures {#check-the-signatures}

The status bar of a PDF tab says what the PDF's digital signatures say:

| Status bar             | What it means                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Not signed             | The PDF has no digital signatures.                                                                    |
| Signed, Signed by 2    | Nothing changed since it was signed, and each certificate is yours or one you trust.                  |
| Signed, signer unknown | Nothing changed since it was signed, but Blank doesn't know a certificate: see below how to trust it. |
| Changed after signing  | Someone changed the PDF after it was signed.                                                          |
| Signature invalid      | A signature doesn't match the PDF.                                                                    |
| Signatures not checked | Blank couldn't read the PDF's signatures. Open the PDF in your PDF app to check them.                 |

Click it to see each signature: who signed, when (_timestamped_ when a timestamp server says so, _computer clock_ when only the signer's computer does), and what Blank found. **Details…** shows the signer's certificate and its fingerprint.

A signature whose certificate a certificate authority issued shows as _Intact · says it's issued by_ that authority: Blank repeats what the certificate claims. It checks that the PDF hasn't changed since, but it doesn't check certificate authorities or whether a certificate was revoked: your PDF app does that, if you need it.

### Trust a certificate {#trust}

To have someone's signatures show as **Signed**, trust their certificate once:

1. Open the signature's **Details…**.
2. Compare the **Fingerprint** with the one the signer tells you, by phone or in person. If they sign with Blank, they find theirs in **Settings ▸ Signing ▸ Fingerprint**.
3. If it's the same, choose **Trust this certificate…** and confirm.

From then on, their signatures show as **Signed** in every PDF. Your own certificate is always trusted. **Settings ▸ Signing ▸ Trusted certificates** lists the ones you trust, where **Remove** takes one off the list again.
