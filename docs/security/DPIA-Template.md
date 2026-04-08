# Data Protection Impact Assessment (DPIA)

## Astra — Template voor verwerkingsverantwoordelijken

**Versie:** 1.0 — opgesteld door Astra als hulpmiddel voor klanten
**Doel:** Dit template stelt een verwerkingsverantwoordelijke in staat om — met beperkte aanvullende informatie die door Astra wordt geleverd — zelfstandig een Data Protection Impact Assessment uit te voeren conform artikel 35 AVG.

---

## 1. Inleiding

### 1.1 Wat is een DPIA?

Een Data Protection Impact Assessment (gegevensbeschermingseffectbeoordeling) is een systematisch proces om de mogelijke gevolgen voor de bescherming van persoonsgegevens van een voorgenomen verwerking in kaart te brengen en te beoordelen, en om de noodzakelijke maatregelen te treffen om risico's af te dekken. De juridische basis staat in artikel 35 AVG.

### 1.2 Wanneer is een DPIA verplicht?

Een DPIA is verplicht wanneer een verwerking "waarschijnlijk een hoog risico" met zich meebrengt voor de rechten en vrijheden van natuurlijke personen. De Autoriteit Persoonsgegevens hanteert een lijst van negen criteria; bij twee of meer daarvan is een DPIA doorgaans verplicht. Voor Astra zijn de volgende criteria relevant:

- **Systematische en uitgebreide evaluatie van persoonlijke aspecten** — planning en beschikbaarheid van medewerkers worden systematisch geoptimaliseerd;
- **Grootschalige verwerking** — wanneer de verwerkingsverantwoordelijke meer dan 100 medewerkers in het systeem heeft;
- **Gevoelige gegevens** — verzuimdata kunnen gezondheidsgerelateerd zijn afhankelijk van invulling;
- **Innovatieve technologie** — AI-ondersteuning voor planningsadviezen.

**Onze aanbeveling:** omdat Astra meestal twee of drie van deze criteria raakt, adviseren wij elke verwerkingsverantwoordelijke om een DPIA uit te voeren voordat het platform in productie wordt genomen. Dit template versnelt dat proces.

### 1.3 Hoe dit template te gebruiken

Elk hoofdstuk bevat:
- **Input van Astra** — vooraf ingevulde feitelijke informatie, gebaseerd op het Security Document en de Verwerkersovereenkomst.
- **Input van verwerkingsverantwoordelijke** — velden die je als klant zelf moet invullen op basis van je eigen context.
- **Beoordeling** — ruimte voor je eigen risicoanalyse en conclusies.

De DPIA is een **levend document**: werk hem bij wanneer de verwerking materieel wijzigt.

---

## 2. Beschrijving van de verwerking

### 2.1 Aard van de verwerking

**Input van Astra:**
Astra is een multi-tenant SaaS-platform voor personeelsplanning. De verwerking omvat:
- het opslaan van medewerker-basisgegevens;
- het registreren van verzuim en beschikbaarheid;
- het bijhouden van vaardigheden, certificeringen en training;
- het genereren van dienstroosters via een optimalisatie-algoritme;
- het aanbieden van AI-ondersteunde planningsadviezen;
- het rapporteren van capaciteit en bezettingsgraad.

**Input van verwerkingsverantwoordelijke:**

| Vraag | Antwoord |
|---|---|
| Welke Astra-modules gebruiken jullie actief? | `[INVULLEN: bv. planning, verzuim, AI-assistent]` |
| Voor welke sites / afdelingen? | `[INVULLEN]` |
| Aantal Betrokkenen (medewerkers) in het systeem? | `[INVULLEN]` |
| Gebruiken jullie de AI-chat assistent tijdens onboarding? | `[INVULLEN]` |
| Gebruiken jullie de demand-forecast upload? | `[INVULLEN]` |

### 2.2 Doel van de verwerking

**Input van Astra:**
Het platform is ontworpen om doelmatige personeelsplanning te ondersteunen, waarbij het vinden van een optimale inzet met respect voor arbeidsregels, vaardigheden en voorkeuren centraal staat.

**Input van verwerkingsverantwoordelijke:**

| Vraag | Antwoord |
|---|---|
| Welk zakelijk doel wil je bereiken? | `[INVULLEN: bv. reductie van onderbezetting, betere voorspelbaarheid]` |
| Welke processen wil je ermee vervangen? | `[INVULLEN: bv. handmatige Excel-planningen]` |
| Welke juridische verplichting (bv. arbeidstijdenregistratie) ondersteunt het? | `[INVULLEN]` |

### 2.3 Rechtsgrondslag (artikel 6 en 9 AVG)

**Input van verwerkingsverantwoordelijke:**

Voor elke categorie persoonsgegevens moet je een rechtsgrondslag aangeven. Vul onderstaande tabel aan:

| Categorie | Voorgestelde grondslag | Jouw beoordeling |
|---|---|---|
| Medewerker-basisgegevens (naam, e-mail, telefoon, functie) | art. 6 lid 1 sub b AVG (uitvoering arbeidsovereenkomst) | `[INVULLEN]` |
| Arbeidstijden en dienstroosters | art. 6 lid 1 sub b + sub c (wettelijke verplichting arbeidstijdenwet) | `[INVULLEN]` |
| Verzuim | art. 6 lid 1 sub c (wettelijke verplichting werkgever) + art. 9 lid 2 sub b (uitvoering arbeidsrecht) indien gezondheidsdata | `[INVULLEN]` |
| Vaardigheden en certificering | art. 6 lid 1 sub b (uitvoering arbeidsovereenkomst) of sub f (gerechtvaardigd belang) | `[INVULLEN]` |
| Inzetvoorkeuren | art. 6 lid 1 sub f (gerechtvaardigd belang) | `[INVULLEN]` |
| Audit-metadata (IP-adres) | art. 6 lid 1 sub c + f (wettelijke logging + beveiligingsbelang) | `[INVULLEN]` |

---

## 3. Noodzaak en evenredigheid

### 3.1 Dataminimalisatie

**Input van Astra:**
Het platform is ontworpen rond het principe van dataminimalisatie. De meeste velden zijn optioneel; de verwerkingsverantwoordelijke bepaalt zelf welke categorieën worden gevuld. De AI-functionaliteit gebruikt waar mogelijk aggregaten in plaats van individuele persoonsgegevens (zie §11 Security Document) en pseudonimiseert direct identificerende velden voordat data naar externe AI-dienstverleners gaat.

**Beoordeling door verwerkingsverantwoordelijke:**

| Vraag | Antwoord |
|---|---|
| Welke optionele velden laat je leeg om data te minimaliseren? | `[INVULLEN]` |
| Vul je de verzuim-reden niet in met medische details? | `[INVULLEN: wij hebben de gebruikers geïnstrueerd om uitsluitend neutrale categorieën te gebruiken]` |
| Heb je alternatieven voor de verwerking overwogen? | `[INVULLEN]` |

### 3.2 Bewaartermijn

**Input van Astra:**
De standaardbewaartermijnen zijn vastgelegd in §4.4 van het Security Document. Medewerkergegevens worden bewaard gedurende de arbeidsrelatie plus een configureerbare nabewaartermijn. Na beëindiging van de overeenkomst verwijdert Astra alle data binnen 30 dagen, met uitzondering van back-ups die automatisch aflopen binnen 7 dagen.

**Beoordeling door verwerkingsverantwoordelijke:**

| Vraag | Antwoord |
|---|---|
| Welke bewaartermijn hanteer je voor ex-medewerkers? | `[INVULLEN]` |
| Sluit dat aan op je wettelijke bewaarplicht (fiscaal 7 jaar, arbeidsrechtelijk variabel)? | `[INVULLEN]` |

---

## 4. Identificatie van risico's

Voor elk risico scoor je waarschijnlijkheid (1-4) en impact (1-4). Het residuele risico is het risico dat resteert na de reeds getroffen maatregelen van Astra.

### Risico 1 — Ongeautoriseerde toegang door een andere Astra-klant

**Bron:** gedeeld multi-tenant platform.

**Mitigatie door Astra (reeds aanwezig):** Row-Level Security op database-niveau plus expliciete `organization_id`-filter in de applicatielaag — defense-in-depth. Geen cross-tenant data-toegang mogelijk zonder tegelijk meerdere onafhankelijke lagen te doorbreken. Zie §6 Security Document.

| Score | Waarde |
|---|---|
| Waarschijnlijkheid na mitigatie | 1 (zeer laag) |
| Impact bij optreden | 4 (zeer hoog — alle gegevens zijn inzichtelijk) |
| **Residueel risico** | **Laag** |

**Jouw beoordeling:** `[INVULLEN — ga je akkoord met deze score?]`

### Risico 2 — Ongeautoriseerde toegang door Astra-personeel

**Bron:** de verwerker heeft technisch de mogelijkheid om via een service-role sleutel RLS te omzeilen.

**Mitigatie door Astra:** geen routinematige toegang door personeel; service-role sleutel is uitsluitend als versleutelde omgevingsvariabele aanwezig in productieomgeving; toegang wordt onveranderbaar gelogd; contractuele beperkingen in de Verwerkersovereenkomst. Zie §6.6 Security Document.

| Score | Waarde |
|---|---|
| Waarschijnlijkheid | 1 (zeer laag — vereist kwade opzet van een bevoegde Astra-medewerker) |
| Impact | 4 (zeer hoog) |
| **Residueel risico** | **Laag-middel** |

**Jouw beoordeling:** `[INVULLEN]`

### Risico 3 — Datalek door externe aanvaller

**Bron:** extern aanvalsoppervlak (HTTPS API, authenticatie).

**Mitigatie door Astra:** Zod-validatie op alle invoer, geparametriseerde queries (geen SQL-injectie), React-escaping (geen XSS), server-side JWT-verificatie per request, rate limiting, HTTPS-only met HSTS + CSP headers, geautomatiseerde dependency-scanning, externe pen-test vóór productie-uitrol. Zie §§7-9 en §14 Security Document.

| Score | Waarde |
|---|---|
| Waarschijnlijkheid | 2 (laag) |
| Impact | 4 (zeer hoog) |
| **Residueel risico** | **Middel** |

**Jouw beoordeling:** `[INVULLEN]`

### Risico 4 — Doorgifte aan derde land (Anthropic — VS)

**Bron:** AI-functionaliteit wordt uitgevoerd door Anthropic in de Verenigde Staten.

**Mitigatie door Astra:** pseudonimisering van direct identificerende velden vóór verzending; Standard Contractual Clauses Module 2 via Anthropic's DPA; aggregaten in plaats van individuele data bij de Insights-functionaliteit. Zie §11 Security Document.

| Score | Waarde |
|---|---|
| Waarschijnlijkheid dat er *identificeerbare* persoonsgegevens lekken | 1 (zeer laag — pseudoniemen zijn niet terug te rekenen zonder sleutel) |
| Impact bij doorgifte van pseudoniemen | 2 (laag — geen directe identificeerbaarheid) |
| **Residueel risico** | **Laag** |

**Jouw beoordeling:** `[INVULLEN]`

### Risico 5 — Onvoldoende afhandeling van betrokkenenrechten

**Bron:** verzoeken van betrokkenen (inzage, rectificatie, vergetelheid) moeten binnen AVG-termijnen worden afgehandeld.

**Mitigatie door Astra:** directe UI-knoppen voor `tenant_admins` om alle betrokkenenrechten zelfstandig af te handelen, inclusief AVG-art. 17 recht op vergetelheid met dubbele audit-trail. Zie §12.2 Security Document.

| Score | Waarde |
|---|---|
| Waarschijnlijkheid | 2 (laag) |
| Impact bij optreden | 2 (bestuurlijke boete, reputatieschade) |
| **Residueel risico** | **Laag** |

**Jouw beoordeling:** `[INVULLEN]`

### Risico 6 — Geautomatiseerde besluitvorming met rechtsgevolgen (art. 22)

**Bron:** AI-ondersteunde planningsadviezen.

**Mitigatie door Astra:** elk advies is adviserend van aard; elke wijziging in dienstroosters of medewerkerdata vereist een handmatige bevestiging door een bevoegde gebruiker. Artikel 22 AVG is daarmee niet van toepassing. Zie §11.5 Security Document.

| Score | Waarde |
|---|---|
| Waarschijnlijkheid dat art. 22 van toepassing is | 1 (zeer laag) |
| Impact | 3 (hoog) |
| **Residueel risico** | **Laag** |

**Jouw beoordeling:** `[INVULLEN]`

### Risico 7 — Onvoldoende bewaartermijn / vergeten te verwijderen

**Bron:** handmatige afhandeling van datasubjectieve verwijderingsverzoeken.

**Mitigatie door Astra:** directe erasure-UI voor `tenant_admins`; `status = 'terminated'` als archiveer-modus; `deleted_at` + `deleted_by` markeringen; automatische opruimroutine voor contact-formulier-submissies na 1 jaar.

| Score | Waarde |
|---|---|
| Waarschijnlijkheid | 2 (laag — afhankelijk van organisatorische discipline bij klant) |
| Impact | 2 (middel) |
| **Residueel risico** | **Laag-middel** |

**Jouw beoordeling:** `[INVULLEN]`

### Risico's toevoegen

Er kunnen organisatie-specifieke risico's zijn die hier niet benoemd worden (bv. ondernemingsraad-consultatie, CAO-verplichtingen, bijzondere arbeidsrelaties). Voeg deze toe:

| Risico | Bron | Mitigatie | Score |
|---|---|---|---|
| `[INVULLEN]` | | | |
| `[INVULLEN]` | | | |

---

## 5. Maatregelen om risico's te verminderen

### 5.1 Reeds aanwezige maatregelen

Zie het Security Document voor de volledige lijst van technische en organisatorische maatregelen. Samengevat:

1. Tenant-isolatie via RLS
2. Encryptie in rust (AES-256) en transport (TLS 1.3)
3. Rolgebaseerde toegangscontrole
4. Onveranderbare audit-log
5. Rate limiting
6. Beveiligingsheaders (CSP, HSTS, X-Frame, etc.)
7. Wachtwoordbeleid met HaveIBeenPwned-integratie
8. Pseudonimisering richting AI
9. Automatische dependency-scanning in CI
10. AVG-recht-op-vergetelheid UI

### 5.2 Aanvullende maatregelen door de verwerkingsverantwoordelijke

**Jouw organisatorische maatregelen:**

| Maatregel | Door wie | Wanneer |
|---|---|---|
| Schrijven van een invulinstructie voor het verzuim-veld (geen medische details) | `[INVULLEN]` | `[INVULLEN]` |
| Instellen van MFA voor alle `planner`+ rollen | `[INVULLEN]` | `[INVULLEN]` |
| Training van gebruikers over DSAR-afhandeling | `[INVULLEN]` | `[INVULLEN]` |
| Consultatie ondernemingsraad indien vereist | `[INVULLEN]` | `[INVULLEN]` |
| Periodieke review van toegewezen rollen | `[INVULLEN]` | `[INVULLEN]` |
| Bijhouden van eigen verwerkingsregister | `[INVULLEN]` | `[INVULLEN]` |

---

## 6. Consultatie

### 6.1 Functionaris voor Gegevensbescherming

Als je een Functionaris voor Gegevensbescherming hebt aangesteld, leg deze DPIA aan hem of haar voor conform artikel 35 lid 2 AVG.

| Vraag | Antwoord |
|---|---|
| Is een FG aangesteld? | `[INVULLEN]` |
| Naam FG | `[INVULLEN]` |
| Advies FG op deze DPIA | `[INVULLEN]` |

### 6.2 Consultatie betrokkenen

Indien passend, verifieer dat de ondernemingsraad of de betrokken medewerkers zijn geconsulteerd.

| Vraag | Antwoord |
|---|---|
| Ondernemingsraad geïnformeerd? | `[INVULLEN]` |
| Datum | `[INVULLEN]` |
| Standpunt | `[INVULLEN]` |

### 6.3 Voorafgaande raadpleging Autoriteit Persoonsgegevens

Conform artikel 36 AVG is voorafgaande raadpleging van de AP verplicht indien de DPIA aantoont dat de verwerking een hoog risico zou opleveren in afwezigheid van mitigerende maatregelen door de verwerkingsverantwoordelijke.

**Onze beoordeling voor Astra:** gegeven de in §4 van deze DPIA geïdentificeerde residuele risico's (allemaal laag tot middel) is voorafgaande raadpleging doorgaans **niet** vereist. Bevestig dit echter zelf op basis van je specifieke implementatie.

| Vraag | Antwoord |
|---|---|
| Is voorafgaande raadpleging vereist? | `[INVULLEN]` |
| Indien ja: datum van raadpleging | `[INVULLEN]` |

---

## 7. Conclusie

### 7.1 Eindoordeel

Vul onderstaand in of de verwerking na alle getroffen maatregelen acceptabel is.

| Vraag | Antwoord |
|---|---|
| Is de verwerking rechtmatig? | `[INVULLEN: ja / nee / ja onder voorwaarden]` |
| Zijn de risico's tot een acceptabel niveau verminderd? | `[INVULLEN]` |
| Zijn er nog openstaande acties? | `[INVULLEN]` |
| Wanneer wordt deze DPIA herzien? | `[INVULLEN: bv. jaarlijks, of bij materiële wijziging]` |

### 7.2 Ondertekening

**Opgesteld door:** `[INVULLEN: naam + functie]` **Datum:** `[INVULLEN]`

**Akkoord door:** `[INVULLEN: naam verwerkingsverantwoordelijke vertegenwoordiger]` **Datum:** `[INVULLEN]`

**Akkoord FG (indien aanwezig):** `[INVULLEN]` **Datum:** `[INVULLEN]`

---

**Einde DPIA-template.**

> **Support:** Indien je vragen hebt bij het invullen van deze DPIA, neem dan contact op met Astra's privacy-contactpunt via `[INVULLEN: e-mailadres]`. Wij helpen je kosteloos met feitelijke vragen over onze verwerking. Voor juridische interpretatie van de AVG verwijzen wij je naar je eigen juridisch adviseur of Functionaris voor Gegevensbescherming.
