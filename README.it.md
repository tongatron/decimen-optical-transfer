# Decimen Optical Transfer — italiano

Trasferisci file direttamente dallo schermo di un dispositivo alla fotocamera
di un altro usando un flusso animato di QR code con codifica fountain. Non sono
necessari rete tra i dispositivi, account, abbinamento, app nativa o server di
inoltro: il contenuto viaggia sotto forma di luce.

[![CI](https://github.com/tongatron/decimen-optical-transfer/actions/workflows/ci.yml/badge.svg)](https://github.com/tongatron/decimen-optical-transfer/actions/workflows/ci.yml)
[![Licenza MIT](https://img.shields.io/badge/licenza-MIT-blue.svg)](LICENSE)

**[Apri l’app online](https://optical-transfer.tongatron.org/)** ·
**[English README](README.md)**

> **Stato:** prototipo mantenuto. Il limite attuale è 2 MB per file; il pacchetto
> macOS non è firmato né notarizzato.

> **Data e ora del commit:** `2026-08-03T01:47:00+02:00` (Europe/Rome)

## In breve

- Trasferimento da schermo a fotocamera tramite QR animati.
- Codifica LT fountain: tollera frame persi, duplicati, fuori ordine e avvio
  ritardato senza ricominciare da capo.
- I byte del file restano sui due dispositivi; non è necessario un relay.
- App web installabile come PWA, con modalità **Sender** e **Receiver**.
- CLI `decimen send` e integrazioni opzionali per Finder, Esplora file e file
  manager Linux.
- Dimensione massima: 2 MB per file.

## Uso dell’app online

1. Apri [optical-transfer.tongatron.org](https://optical-transfer.tongatron.org/)
   su entrambi i dispositivi.
2. Scegli **Sender** sul dispositivo che mostrerà il QR animato.
3. Seleziona un file, oppure incolla un’immagine con <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+
   <kbd>V</kbd>, quindi avvia la trasmissione.
4. Sull’altro dispositivo scegli **Receiver**, autorizza la fotocamera e inquadra
   il QR.
5. Attendi la verifica e salva il file ricostruito.

Per velocizzare il trasferimento, aumenta la luminosità dello schermo,
ingrandisci il QR e tieni ferma la fotocamera. L’accesso alla fotocamera è
richiesto solo nella modalità Receiver.

## Sviluppo locale

Requisiti: Node.js 18 o superiore, npm e due dispositivi per una prova reale.

```bash
git clone https://github.com/tongatron/decimen-optical-transfer.git
cd decimen-optical-transfer
npm install
npm run dev
```

Apri `/send/` sul dispositivo Sender e l’URL di rete `/receive/` sull’altro.
Il server di sviluppo usa HTTPS con un certificato autofirmato; il primo avvio
può quindi mostrare un avviso del browser.

Per creare e provare il sito di produzione:

```bash
npm run build
npm run preview
```

La cartella pubblicabile è `dist/`. Per una spiegazione del protocollo e delle
opzioni di self-hosting consulta il [README principale](README.md).

## CLI

```bash
npm run build:cli
npm link
decimen setup
decimen send ./document.pdf
```

`decimen setup` sceglie il Receiver pubblico, un host HTTPS personalizzato o un
deployment locale. La pagina Sender viene servita solo da `127.0.0.1`; il file
non viene caricato online.

Opzioni utili:

```bash
decimen send ./document.pdf --fps 8 --frame-bytes 300 --ecc L
decimen config show
decimen --help
```

Le integrazioni desktop sono documentate nel README inglese:
`macos/install-decimen.sh`, `windows/install-explorer-action.ps1` e
`linux/install-file-manager-actions.sh`.

## Test

I test Vitest verificano envelope binari, protocollo, vettori fissi, codifica e
decodifica fountain, integrità, CLI e simulazioni con perdite, duplicati,
riordinamento, corruzione e sessioni estranee. I test Playwright verificano i
vettori nel browser Chromium/WebKit e la pagina diagnostica.

```bash
npm test
npm run check
npx playwright install chromium webkit   # solo la prima volta
npm run test:browsers
```

## Privacy e limiti

- I contenuti vengono elaborati localmente nel browser e non sono caricati
  dall’app.
- Il trasferimento richiede una fotocamera funzionante e dipende da luminosità,
  messa a fuoco, distanza, riflessi e frequenza di acquisizione.
- Eventuali analytics Umami configurati dal deployer ricevono solo metriche di
  utilizzo, mai file, nomi, hash o identificativi di sessione.

## Licenza

Distribuito con la stessa [licenza MIT](LICENSE) del progetto originale.
Vedi il [README principale](README.md) per architettura, diagnostica,
acknowledgements e istruzioni complete per piattaforma.
