# Key files for the signing tests

Test keys only: their passphrase is `correct horse`, and nothing they sign is trusted. Made with OpenSSL 3.0 and NSS's `pk12util`:

```sh
# rsa.p12, nomac.p12, legacy.p12: an RSA key, its certificate's CN has a comma
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -subj "/CN=Lovelace, Ada" -days 36500 -sha256
openssl pkcs12 -export -inkey key.pem -in cert.pem -out rsa.p12 \
  -passout "pass:correct horse" -iter 1000
# no MAC: only decrypting tells a wrong passphrase
openssl pkcs12 -export -inkey key.pem -in cert.pem -out nomac.p12 \
  -passout "pass:correct horse" -iter 1000 -nomac
# RC2 and 3DES with a SHA-1 MAC, as older software writes them
openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem -out legacy.p12 \
  -passout "pass:correct horse" -iter 1000

# nss.p12: BER, as Firefox and Thunderbird export it (a P-256 key). pk12util
# has no option for the rounds, so it has NSS's 600,000.
openssl ecparam -name prime256v1 -genkey -noout -out eckey.pem
openssl req -x509 -key eckey.pem -out eccert.pem -subj "/CN=Grace Hopper" -days 36500 -sha256
openssl pkcs12 -export -inkey eckey.pem -in eccert.pem -out ec.p12 \
  -passout "pass:correct horse" -iter 1000 -name grace
mkdir nssdb && certutil -N -d sql:nssdb --empty-password
pk12util -i ec.p12 -d sql:nssdb -W "correct horse" -K ""
pk12util -o nss.p12 -n grace -d sql:nssdb -W "correct horse" -K ""
```

## blank.pdf

What Blank's layout engine (`src-tauri/layout`) writes for three paragraphs and an unsigned signature block, A4, with the default settings: `Engine::new(repository_fonts())`, `set_items` with three `Content::Text` paragraphs and a `Content::Signature` (lines `["Ada Lovelace · Tenant"]`), then `blank_layout::pdf::write` with the title "Lease" and the author "Ada Lovelace", written to this file from a throwaway test in `layout/tests/`. Make it again when the engine's PDF changes in a way that matters to signing (its cross-reference section, its trailer, its form).
