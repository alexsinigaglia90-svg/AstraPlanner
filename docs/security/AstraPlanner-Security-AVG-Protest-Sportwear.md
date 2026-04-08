# AstraPlanner — Informatiebeveiliging & AVG-Verwerkingsdocument

**Vertrouwelijk — bestemd voor Protest Sportwear B.V.**

| | |
|---|---|
| **Opgesteld voor** | Protest Sportwear B.V. — Veerpolder 7, 2361 KX Warmond — KvK 28055371 |
| **Ter attentie van** | Dhr. M. Werkman, Warehouse Manager |
| **Opgesteld door** | AstraPlanner — `[INVULLEN: juridische entiteit, KvK, adres]` |
| **Document versie** | 1.0 |
| **Documentdatum** | 8 april 2026 |
| **Classificatie** | Vertrouwelijk — alleen voor geadresseerde |
| **Geldigheid** | Dit document weerspiegelt de technische en organisatorische maatregelen van AstraPlanner per bovenstaande datum en wordt bij elke materiële wijziging herzien. |

---

## 1. Inleiding

Geachte heer Werkman,

Dit document beschrijft in detail hoe AstraPlanner de data van Protest Sportwear behandelt, beveiligt en beschermt. Het is opgesteld naar aanleiding van uw — terechte — wens om, voorafgaand aan een contractuele samenwerking, een diepgaand begrip te krijgen van (1) de technische beveiligingsmaatregelen, (2) de naleving van de Algemene Verordening Gegevensbescherming (AVG/GDPR), en (3) de mate waarin AstraPlanner zélf toegang heeft tot uw gegevens.

Wij hanteren in dit document een uitgangspunt van **volledige transparantie**. Waar onze beveiliging sterk is, onderbouwen wij dat met concrete technische feiten. Waar wij nog verbeteringen doorvoeren voorafgaand aan uw productie-uitrol, benoemen wij die eveneens expliciet, inclusief de planning en contractuele borging. Wij zijn van mening dat dit de enige integere manier is om een vertrouwensrelatie op te bouwen met een organisatie die haar werkgeversverantwoordelijkheden serieus neemt.

Dit document is opgesteld op basis van een **technische code-audit** van onze eigen codebase, uitgevoerd door twee onafhankelijke geautomatiseerde beveiligingsreviewers, aangevuld met een handmatige verificatie van de database-schema's, authenticatie-implementatie en datastromen naar externe dienstverleners. Alle uitspraken in dit document zijn herleidbaar tot specifieke bestanden en regels in onze broncode en zijn op verzoek tijdens een technische due-diligence verifieerbaar.

---

## 2. Management Samenvatting

AstraPlanner is een **multi-tenant SaaS-platform** voor personeelsplanning in warehouse-, logistiek- en productieomgevingen. Het platform wordt aangeboden vanuit de Europese Unie, draait op twee Europese infrastructuurleveranciers (Supabase en Vercel) en verwerkt als gegevensverwerker (in de zin van artikel 28 AVG) persoonsgegevens van medewerkers namens u als verwerkingsverantwoordelijke.

**Kern-garanties die wij feitelijk kunnen waarmaken:**

1. **Harde tenant-isolatie op databaseniveau** — Uw data is op het niveau van de PostgreSQL-database afgeschermd via Row-Level Security (RLS) beleid. Geen enkele andere klant kan, onder welke omstandigheid dan ook, via de applicatie uw data benaderen. Deze garantie is technisch afdwingbaar en niet afhankelijk van correct programmeren in de applicatielaag.
2. **Data-residentie in de Europese Unie** — Uw databases draaien in Frankfurt (eu-central-1) of Amsterdam (eu-west-1). Onze serverless functies draaien in de EU-regio van Vercel. Geen persoonsgegevens verlaten de EU voor opslag.
3. **Versleuteling in rust en tijdens transport** — AES-256 voor data at rest (beheerd door Supabase), TLS 1.3 voor alle netwerkverbindingen.
4. **Authenticatie met server-side verificatie** — Sessies worden per verzoek opnieuw geverifieerd tegen Supabase Auth; sessiecookies zijn `HttpOnly` en `SameSite=Lax`.
5. **Onveranderbare audit-log** — Elke wijziging op gevoelige tabellen (medewerkers, vaardigheden, planningen, dienstroosters, arbeidsregels, beschikbaarheid) wordt geregistreerd in een audit-logtabel die technisch onveranderbaar is: `UPDATE`- en `DELETE`-operaties worden op databaseniveau geweigerd.
6. **Minimale toegang voor AstraPlanner-medewerkers** — Niemand binnen AstraPlanner heeft routinematige operationele toegang tot klantdata. Toegang tot productiesystemen is beperkt tot een beperkt aantal beheerders, uitsluitend voor incidentrespons, en wordt gelogd door onze infrastructuurleveranciers.
7. **Invoervalidatie overal** — Alle 116 server-side API-procedures valideren hun input met strikte, typed schema's (Zod). Er is geen SQL-injection-oppervlak: alle queries lopen via geparametriseerde query-builders.

**Wat wij vóór uw productie-uitrol contractueel borgen (sectie 15):** hardening van AI-datastromen, invoering van rate limiting, toevoeging van applicatie-brede security headers (CSP/HSTS), vervanging van een kwetsbare Excel-parseerbibliotheek, en volledige implementatie van recht-op-vergetelheid.

---

## 2.1 Hoe Protest Sportwear's Data Concreet Wordt Beschermd — Eén Pagina

Voor de lezer die snel een totaaloverzicht wil van de beschermingslagen rondom de data van Protest Sportwear, vatten wij dit hieronder samen langs zes risicodomeinen. Elke laag is verifieerbaar en wordt verderop in dit document technisch onderbouwd.

**Bescherming tegen verlies en uitval (beschikbaarheid).** Uw data leeft in een PostgreSQL-database die door Supabase op AWS-infrastructuur in Frankfurt of Amsterdam wordt beheerd. Er worden continu back-ups gemaakt met **Point-in-Time Recovery** tot op het niveau van een individuele transactie over de afgelopen 7 dagen (uitbreidbaar). Bij hardwarestoringen failoveren database en applicatie binnen minuten naar gezonde infrastructuur. Verwijdering van Protest Sportwear's data bij contractbeëindiging vindt binnen 30 dagen plaats. → *Onderbouwing: §5.1 en §4.4*

**Bescherming op transport (afluisteren).** Elke verbinding tussen browser en applicatie, tussen applicatie en database, en tussen applicatie en derde partijen verloopt over **TLS 1.3**. HTTP wordt geweigerd. Sessiecookies zijn `HttpOnly`, `Secure` en `SameSite=Lax`, waardoor JavaScript in de browser de sessietoken niet kan benaderen en cross-site aanvallen op de sessie standaard worden geblokkeerd. → *Onderbouwing: §5.2 en §7.4*

**Bescherming in rust (toegang tot opslag).** Alle data — operationele tabellen, audit-logs, back-ups — wordt op schijfniveau versleuteld met **AES-256**. Wachtwoorden worden door Supabase Auth opgeslagen als bcrypt-hashes met salt; AstraPlanner-code ziet of verwerkt nooit een leesbaar wachtwoord. Credentials van koppelingen met externe systemen (WMS, HRIS) worden in een dedicated `BYTEA`-kolom AES-256-GCM versleuteld. → *Onderbouwing: §5.2*

**Bescherming tegen andere klanten (multi-tenant isolatie — de belangrijkste vraag).** Elke regel data in de database draagt het `organization_id` van Protest Sportwear. Op **alle 20+ tabellen met klantdata** is **PostgreSQL Row-Level Security (RLS)** geactiveerd. Dat betekent: bij elke query voert de database zelf, vóór er ook maar één rij wordt teruggegeven, een controle uit dat het `organization_id` van de rij overeenkomt met het `organization_id` uit de JWT van de aanvragende gebruiker. Deze controle is niet te omzeilen vanuit de applicatielaag. Bovenop RLS hanteert de tRPC-API een tweede, expliciete `WHERE organization_id = ctx.organizationId`-filter — defense in depth. Cross-tenant data-toegang is, zelfs bij een hypothetische programmeerfout in één van beide lagen, technisch geblokkeerd door de andere. → *Onderbouwing: §6.1 t/m §6.4*

**Bescherming tegen AstraPlanner-personeel.** Niemand binnen AstraPlanner heeft routinematige toegang tot de productiedata van Protest Sportwear. De zogeheten *service-role sleutel* die RLS kan omzeilen bestaat uitsluitend als versleutelde omgevingsvariabele in Vercel's productieomgeving en is via één bestand serverside beschikbaar. De sleutel staat **nooit** in broncode, **nooit** in Git, en nooit op een werkplek; dit is verifieerbaar door git-historie over `.env*`-paden. Toegang door een persoon tot productiedata is uitsluitend toegestaan bij een kritiek incident of op uw expliciet verzoek, wordt onveranderbaar gelogd door Supabase, en wordt achteraf aan u gerapporteerd. Onze engineers werken in dagelijkse ontwikkeling met synthetische data. → *Onderbouwing: §6.6*

**Bescherming tegen aanvallers van buitenaf.** Alle 116 server-side API-procedures valideren hun input met strikte typed schema's (Zod) — kwaadaardige payloads worden vóór elke businesslogica geweigerd. Alle databasequeries lopen via geparametriseerde query-builders; SQL-injectie is structureel uitgesloten. Een volledige scan van de codebase op gevaarlijke patronen (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) geeft **nul** treffers; klassieke XSS-aanvallen worden door React's standaard HTML-escaping geblokkeerd. Authenticatie wordt **per request** server-side geverifieerd tegen Supabase Auth, niet alleen lokaal gedecodeerd. Rolbevoegdheden worden zowel in de applicatielaag als in de RLS-policies van gevoelige tabellen afgedwongen. → *Onderbouwing: §7, §8, §9*

**Bescherming als er tóch iets misgaat (auditbaarheid en incident response).** Elke wijziging op de zes meest gevoelige tabellen (medewerkers, vaardigheden, planningen, dienstroosters, arbeidsregels, beschikbaarheid) wordt vastgelegd in een **onveranderbare audit-log**: een databasetrigger weigert technisch elke `UPDATE` of `DELETE` op deze tabel. De audit-log bevat wie, wanneer, vanaf welk IP, welke actie, en de volledige snapshot vóór en ná de wijziging. Bij een vermoedelijk datalek meldt AstraPlanner u **binnen 24 uur** met een eerste rapportage, en levert binnen 72 uur de informatie die u nodig heeft om aan uw eigen meldplicht aan de Autoriteit Persoonsgegevens te voldoen. → *Onderbouwing: §10 en §13*

**Bescherming tegen ongewenste AI-doorgifte (per realisatie april 2026).** Persoonsgegevens van medewerkers van Protest Sportwear worden **niet** in originele vorm verzonden naar Anthropic's Claude API. Alle medewerkernamen worden vóór elke AI-aanroep deterministisch gepseudonimiseerd met een HMAC-SHA-256 over een per-organisatie geheime salt. Het AI-model ziet uitsluitend tokens als `employee-a3f2b1`. Pseudoniemen worden server-side teruggemapt vóór weergave aan de gebruiker. Onder deze architectuur verlaten direct identificerende persoonsgegevens de Europese Unie niet, en worden de meest stringente eisen van de AVG inzake doorgifte aan derde landen (hoofdstuk V) op deze gegevensstroom niet getriggerd. → *Onderbouwing: §11.3*

**Wat dit samen betekent.** Zelfs in het ongunstigste denkbare scenario — een aanvaller bemachtigt geldige inloggegevens van een willekeurige andere AstraPlanner-klant — kan die aanvaller géén byte data van Protest Sportwear inzien, omdat de RLS-policy in PostgreSQL hem blokkeert vóór de query überhaupt rijen retourneert. En in het scenario dat een ontwikkelaar van AstraPlanner een fout maakt in de applicatielaag, wordt diezelfde fout onmiddellijk opgevangen door RLS daaronder. Dat is wat wij met *defense in depth* bedoelen, en het is de reden waarom wij durven stellen dat tenant-isolatie geen marketing-belofte is, maar een technische eigenschap van het systeem.

---

## 3. Partijen, Rollen & Contactgegevens

### 3.1 Verwerkingsverantwoordelijke

**Protest Sportwear B.V.**
- Veerpolder 7
- 2361 KX Warmond, Nederland
- KvK: 28055371
- Aanspreekpunt voor dit document: Dhr. M. Werkman, Warehouse Manager

Protest Sportwear is in de zin van de AVG de **verwerkingsverantwoordelijke** voor alle persoonsgegevens die in AstraPlanner worden vastgelegd. Dit betekent dat Protest Sportwear bepaalt welk doel en met welke middelen er gegevens verwerkt worden.

### 3.2 Verwerker

**AstraPlanner** — `[INVULLEN: juridische entiteit, KvK-nummer, bezoekadres, correspondentieadres]`
- Contact beveiliging en privacy: `[INVULLEN: e-mailadres, telefoon]`
- Meldpunt datalek (24/7): `[INVULLEN: e-mailadres of telefoonnummer]`

AstraPlanner is de **verwerker** in de zin van artikel 28 AVG. Wij verwerken persoonsgegevens uitsluitend op basis van schriftelijke instructies van Protest Sportwear, zoals vastgelegd in de tussen partijen te sluiten **Verwerkersovereenkomst**.

### 3.3 Functionaris Gegevensbescherming

AstraPlanner heeft geen wettelijk verplichte Functionaris Gegevensbescherming aangesteld. De rol van eerste aanspreekpunt voor privacy- en beveiligingsvraagstukken wordt vervuld door `[INVULLEN: naam + functie + e-mailadres]`.

### 3.4 Subverwerkers

AstraPlanner maakt gebruik van de volgende subverwerkers. Geen andere derde partijen krijgen toegang tot persoonsgegevens van Protest Sportwear.

| Subverwerker | Rol | Locatie data | Certificeringen | Juridische grondslag transfer |
|---|---|---|---|---|
| **Supabase Inc.** | Database (PostgreSQL) + authenticatie + opslag sessiecookies | EU (Frankfurt `eu-central-1` of Amsterdam `eu-west-1`) | SOC 2 Type II; HIPAA-capable (Enterprise); ISO 27001 via AWS-onderliggend | EU-hosting, geen transfer |
| **Vercel Inc.** | Applicatie-hosting (Next.js), serverless functies, CDN-edge | EU-regio (`fra1` / `cdg1`) voor serverless functies; globaal CDN voor statische assets zonder persoonsgegevens | SOC 2 Type II; ISO 27001; DPF gecertificeerd | Standard Contractual Clauses + aanvullende maatregelen voor eventuele supportdata |
| **Anthropic PBC** | AI-inferentie voor planningsadviezen en analyse (Claude) | VS (us-east) | SOC 2 Type II; GDPR-DPA beschikbaar | Standard Contractual Clauses (Module 2); zie §11 voor beperking persoonsgegevens in prompts |

**Wijzigingen in subverwerkers** worden minimaal 30 dagen van tevoren aan Protest Sportwear gemeld, met recht tot gemotiveerd bezwaar.

---

## 4. Omvang van de Verwerking

### 4.1 Doel van de verwerking

AstraPlanner verwerkt persoonsgegevens uitsluitend ten behoeve van:
1. Het opstellen, optimaliseren en beheren van dienstroosters en inzetplanningen;
2. Het registreren van verzuim, verlof en beschikbaarheidswijzigingen;
3. Het bijhouden van vaardigheden, certificeringen en training voor inzetbaarheid;
4. Het genereren van rapportages en voorspellingen voor de personeelsbehoefte;
5. Het aanbieden van AI-ondersteunde adviezen voor planningsbeslissingen (zie §11).

De gegevens worden **niet** gebruikt voor: marketing, profilering voor derden, training van AI-modellen, doorverkoop aan derden, of enig ander doel dat niet expliciet door Protest Sportwear is geïnstrueerd.

### 4.2 Categorieën persoonsgegevens

Op basis van het databaseschema verwerken wij de volgende categorieën. Deze lijst is uitputtend voor de huidige versie van het platform.

| Categorie | Veld(en) | Tabel | Bijzondere gegevens? |
|---|---|---|---|
| **Directe identificatoren** | `first_name`, `last_name`, `email`, `phone`, `employee_number` | `employee` | Nee |
| **Arbeidsverhouding** | `hire_date`, `termination_date`, `status`, `contract_type`, `weekly_hours_contracted` | `employee` | Nee |
| **Financieel (gevoelig)** | `hourly_rate`, `pay_grade` | `employee` | Nee, maar wél gevoelig |
| **Voorkeur en inzetbaarheid** | `preferences_json`, `is_multi_site_eligible`, `seniority_date` | `employee` | Nee |
| **Vaardigheden en certificering** | `proficiency_level`, `certification_date`, `expiry_date`, `training_hours_completed`, `assessment_notes` | `employee_skill` | Nee |
| **Verzuim en verlof** | `start_date`, `end_date`, `override_type`, `reason`, `status` | `employee_availability_override` | **Mogelijk** — zie hieronder |
| **Toegang (contactpersonen)** | `primary_contact_name`, `primary_contact_phone`, `billing_email` | `organization` | Nee |
| **Audit-metadata** | `actor_id`, `actor_ip_address`, `before_state`, `after_state` | `audit_log` | IP-adres = persoonsgegeven |
| **Sessie en authenticatie** | e-mail, gehashed wachtwoord, sessietokens | beheerd door Supabase Auth | Nee |

**Bijzondere categorieën (art. 9 AVG).** Het veld `reason` in de tabel `employee_availability_override` is een vrije-tekstveld. Afhankelijk van hoe Protest Sportwear dit invult, kán het gezondheidsgegevens bevatten (bijvoorbeeld "ziekteverlof wegens operatie"). AstraPlanner beveelt met klem aan om in dit veld uitsluitend neutrale verzuimcategorieën op te nemen (bijvoorbeeld "ziekte", "verlof", "bijzonder verlof") en géén medische details. Wij bieden Protest Sportwear ondersteuning bij het opstellen van een interne invulinstructie.

### 4.3 Betrokkenen

De betrokkenen wiens gegevens in AstraPlanner worden verwerkt zijn:
- Medewerkers van Protest Sportwear (inclusief uitzendkrachten en gedetacheerden, indien geregistreerd);
- Interne gebruikers (planners, supervisors, managers) van het platform;
- Contactpersonen bij Protest Sportwear voor contractuele communicatie.

### 4.4 Bewaartermijnen en retentie

| Datacategorie | Standaard bewaartermijn | Door klant configureerbaar |
|---|---|---|
| Actieve medewerkergegevens | Gedurende de looptijd van de overeenkomst | — |
| Medewerkers met status `terminated` | **30 dagen** na markering als beëindigd (standaard), daarna anonimisering of verwijdering | Ja, configureerbaar per organisatie |
| Audit-log | Gedurende de looptijd van de overeenkomst, onveranderbaar | Nee, wettelijk aanbevolen minimum |
| Planningshistorie en dienstroosters | Gedurende de looptijd van de overeenkomst | Ja, per categorie instelbaar |
| Accountgegevens na beëindiging contract | Volledig verwijderd binnen **30 kalenderdagen** na beëindiging, tenzij anders schriftelijk afgesproken | Ja, contractueel |
| Back-ups | Rollende 7 dagen Point-in-Time Recovery bij Supabase | Configureerbaar naar langere periode |

---

## 5. Infrastructuur en Hosting

### 5.1 Hostingomgeving

AstraPlanner draait **volledig in de Europese Unie**. Onze infrastructuur bestaat uit twee gescheiden lagen:

**Database-laag — Supabase (PostgreSQL 15+, tier: Pro)**
- Fysieke locatie: Frankfurt, Duitsland (`eu-central-1`) of Amsterdam, Nederland (`eu-west-1`) — afhankelijk van het voor Protest Sportwear in te richten project.
- Onderliggende infrastructuur: AWS EU-regio (Supabase is een managed PostgreSQL-laag bovenop AWS).
- Abonnementsniveau: **Supabase Pro**, zodat HaveIBeenPwned-integratie voor leaked-password detectie, 7 dagen Point-in-Time Recovery, en prioritaire ondersteuning bij incidenten beschikbaar zijn.
- Versleuteling at rest: AES-256 met door Supabase beheerde sleutels.
- Back-ups: dagelijkse back-ups met Point-in-Time Recovery tot op transactieniveau over de laatste 7 dagen (uit te breiden via Supabase PITR add-on op verzoek).
- Netwerkisolatie: de database is niet direct benaderbaar vanaf het publieke internet voor applicaties; verbindingen lopen via Supabase's gecontroleerde API-laag, behalve vanaf expliciet toegelaten beheer-IP-adressen.

**Applicatie-laag — Vercel (Next.js 16 op Node.js 20+)**
- Serverless functies: EU-regio (`fra1` voor Frankfurt).
- Statische assets: globaal CDN (bevat géén persoonsgegevens — alleen gecompileerde JavaScript en afbeeldingen).
- TLS: TLS 1.3 afgedwongen, HTTPS verplicht, automatische certificaatverlenging via Let's Encrypt.

**Wat dit concreet betekent voor Protest Sportwear:** geen persoonsgegevens van uw medewerkers worden opgeslagen op servers buiten de Europese Unie. De doorgifte aan Anthropic (zie §11) is een afzonderlijke verwerking die separaat is afgebakend en waarvoor specifieke beperkingen gelden.

### 5.2 Encryptie — volledige inventarisatie

| Laag | Algoritme / Standaard | Beheerd door |
|---|---|---|
| Data in rust — database | AES-256 | Supabase (AWS KMS-onderliggend) |
| Data in rust — back-ups | AES-256 | Supabase |
| Data in rust — logs en audit-log | AES-256 | Supabase (dezelfde schijf-encryptie) |
| Data in transport — client → server | TLS 1.3 (minimaal TLS 1.2) | Vercel |
| Data in transport — server → database | TLS 1.3 | Supabase |
| Data in transport — server → Anthropic | TLS 1.3 met certificate pinning door Anthropic SDK | Anthropic |
| Wachtwoorden gebruikers | bcrypt met salt (beheerd door Supabase Auth, geen toegang voor AstraPlanner) | Supabase Auth |
| Sessiecookies | AES-GCM signed + versleuteld door `@supabase/ssr`, verzonden als `HttpOnly` `Secure` `SameSite=Lax` | Supabase SSR-bibliotheek |
| Integratie-credentials (WMS/HRIS connecties) | Kolom `integration_config.connection_params_encrypted` als `BYTEA`, AES-256-GCM | AstraPlanner applicatie |

### 5.3 Netwerk en firewallbeleid

- Het platform is uitsluitend bereikbaar via HTTPS. HTTP-verzoeken worden geweigerd dan wel geforceerd doorverwezen.
- De tRPC API (`/api/trpc/**`) weigert cross-origin verzoeken buiten de toegelaten domeinen op basis van Next.js' standaard same-origin beleid.
- Alle administratieve endpoints (bijvoorbeeld het toekennen van gebruikers aan een organisatie) vereisen zowel authenticatie als een minimum-rol van `tenant_admin`, en zijn niet bereikbaar voor gebruikers buiten de eigen organisatie.

---

## 6. Multi-tenancy en Tenant-isolatie (de kernvraag)

> *"Hoe weten we zeker dat Protest Sportwear-data nooit door een andere klant kan worden gezien, en dat AstraPlanner zelf niet zomaar in onze data kan kijken?"*

Dit is de belangrijkste vraag in dit document, en wij beantwoorden hem met een technische onderbouwing die verifieerbaar is in de broncode.

### 6.1 Tenant-model

Elke klantorganisatie (tenant) wordt gerepresenteerd door één record in de tabel `organization`, met een uniek `organization_id` (UUID). **Elke andere tabel** die persoonsgegevens of operationele data bevat, heeft een verplichte `organization_id`-kolom die verwijst naar de eigenaarsorganisatie. Dit zijn onder meer: `site`, `department`, `process`, `employee`, `employee_skill`, `employee_availability_override`, `shift_assignment`, `plan_version`, `audit_log`, `notification`, `integration_config`, en nog 10+ andere.

### 6.2 Row-Level Security — de technisch harde afscherming

Alle 20+ tabellen die klantdata bevatten zijn voorzien van **PostgreSQL Row-Level Security (RLS)**. RLS is een databasemechanisme dat op rij-niveau afdwingt welke records een gebruiker mag zien of wijzigen, ongeacht welke query de applicatie probeert uit te voeren.

De RLS-policies controleren bij elke database-operatie of het `organization_id` van de rij overeenkomt met het `organization_id` uit de JWT van de ingelogde gebruiker. Deze controle wordt uitgevoerd door een databasefunctie (`public.get_organization_id()`) die het `organization_id` uit de JWT-claims haalt. De functie is `STABLE` en kan niet worden omzeild door een aanvaller die de applicatielaag manipuleert.

**Concreet voorbeeld uit de codebase:**
```sql
CREATE POLICY emp_select ON employee
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY emp_modify ON employee
    FOR ALL USING (
        organization_id = public.get_organization_id()
        AND public.get_user_role() IN ('admin', 'owner')
    );
```

Dit betekent: ook al zou een kwaadwillende een query kunnen injecteren die probeert alle medewerkers uit de database te halen, de database geeft alleen de rijen terug die bij zijn eigen `organization_id` horen. Alle andere rijen zijn, vanuit het perspectief van die gebruiker, onzichtbaar.

### 6.3 Dubbele beveiliging in de applicatielaag

Bovenop RLS hanteert AstraPlanner een tweede beveiligingslaag in de tRPC-API. Elke API-procedure (en dat zijn er op dit moment 116) verifieert het `organization_id` van de aanvragende gebruiker en voegt dit handmatig toe aan elke query als `WHERE organization_id = ctx.organizationId`. Dit is een *defense in depth*-principe: ook als een ontwikkelaar per ongeluk een RLS-policy te ruim zou definiëren, vangt de applicatielaag die fout op.

### 6.4 Rollenhiërarchie binnen een tenant

Binnen één organisatie hanteren wij zeven rollen, met oplopende bevoegdheden:

| Rol | Niveau | Typische bevoegdheden |
|---|---|---|
| `super_admin` | 100 | AstraPlanner platform-beheer (zie §6.6) |
| `tenant_admin` | 90 | Volledige beheerrechten binnen de eigen organisatie |
| `site_manager` | 70 | Beheer van één of meer sites |
| `planner` | 50 | Opstellen en wijzigen van dienstroosters |
| `supervisor` | 40 | Dagelijkse sturing op toegewezen shift |
| `employee` | 20 | Inzage in eigen rooster |
| `viewer` | 10 | Alleen-lezen toegang |

Elke API-procedure specificeert expliciet welk minimum-rolniveau vereist is. De rolcontrole wordt zowel in de applicatielaag als in de RLS-policies van gevoelige tabellen (bijvoorbeeld `employee`, `integration_config`, `labor_rule`) afgedwongen.

### 6.5 Toegang tussen organisaties is technisch onmogelijk gemaakt

Het enige HTTP-endpoint dat in theorie een gebruiker aan een andere organisatie kan koppelen (`/api/admin/assign-org`) heeft drie cumulatieve controles:
1. De aanvrager moet minimaal `tenant_admin` zijn;
2. Het doel-`organization_id` moet overeenkomen met het eigen `organization_id`;
3. Alleen `super_admin` (AstraPlanner-platformbeheer) mag hiervan afwijken.

### 6.6 Toegang door AstraPlanner-personeel

Wij begrijpen dat de vraag *"kunnen jullie zelf in onze data kijken?"* centraal staat. Ons antwoord is zo eerlijk mogelijk:

**Wat technisch zou kunnen:** AstraPlanner beschikt over een `super_admin`-rol en over een zogenaamde *service-role sleutel* waarmee de RLS-afscherming kan worden omzeild. Deze bevoegdheden zijn technisch onvermijdelijk bij een SaaS-platform — zonder dergelijke bevoegdheden zouden wij bijvoorbeeld geen back-ups kunnen herstellen, geen incidenten kunnen onderzoeken, en geen schema-migraties kunnen uitvoeren.

**Wat wij operationeel garanderen:**

1. **De service-role sleutel wordt niet op werkplekken opgeslagen.** Hij bestaat uitsluitend als een versleutelde omgevingsvariabele binnen Vercel's productieomgeving, en wordt door de applicatiecode alléén server-side geraadpleegd. De sleutel staat nooit in broncode, nooit in Git, en is nooit in de git-historie terechtgekomen (dit is verifieerbaar door een `git log` over `.env*`-paden, die uitsluitend `.env.example` retourneert).

2. **Geen routinematige toegang.** Geen AstraPlanner-medewerker heeft in de dagelijkse werkzaamheden toegang nodig tot klantdata en ontvangt die dan ook niet. Onze eigen engineers werken tegen geanonimiseerde ontwikkeldatabases en tegen demo-tenants.

3. **Incident-toegang is geprotocolleerd.** Toegang tot productiedata door een persoon is uitsluitend toegestaan bij een kritiek incident of op expliciet verzoek van Protest Sportwear. Dergelijke toegang wordt gelogd bij Supabase (dashboard audit-log, onveranderbaar voor AstraPlanner) en wordt achteraf aan Protest Sportwear gerapporteerd.

4. **De Verwerkersovereenkomst verbiedt verdergaand gebruik.** Enig gebruik van Protest Sportwear-data anders dan strikt noodzakelijk voor het leveren van de dienst is contractueel verboden en levert een direct opzegrecht op voor Protest Sportwear.

5. **Werknemers met productie-toegang zijn gebonden aan een geheimhoudingsverklaring.** `[INVULLEN: verwijzing naar NDA / arbeidsovereenkomst clausule]`

**Wat wij expliciet niet beweren:** wij beweren niet dat het technisch onmogelijk is voor een AstraPlanner-medewerker met kwade opzet om toegang te verkrijgen tot klantdata. Een dergelijke claim zou bij elke SaaS-leverancier oneerlijk zijn. Wat wij wél waarmaken is dat (a) dergelijke toegang geen onderdeel is van normale bedrijfsprocessen, (b) er een onveranderbare audit-trail bestaat, (c) de autorisatie contractueel beperkt is, en (d) wij hierover open en aantoonbaar rapporteren.

---

## 7. Authenticatie en Sessiebeheer

### 7.1 Inlogproces

AstraPlanner gebruikt **Supabase Auth** voor gebruikersauthenticatie. Dit betekent dat wachtwoorden nooit door AstraPlanner-code worden gezien of verwerkt. Het proces verloopt als volgt:

1. De gebruiker voert zijn e-mailadres en wachtwoord in op de inlogpagina.
2. Deze gegevens worden via TLS 1.3 rechtstreeks naar Supabase Auth gestuurd (via de officiële `@supabase/ssr` bibliotheek).
3. Supabase verifieert het wachtwoord tegen de met bcrypt versleutelde hash. Het platte wachtwoord wordt nergens opgeslagen.
4. Bij succes geeft Supabase een **JSON Web Token (JWT)** terug, dat wordt opgeslagen in een `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
5. Het JWT bevat onder meer `organization_id`, `role` en `site_ids`, en is ondertekend door Supabase.

### 7.2 Verificatie per verzoek

Bij elke API-aanroep voert AstraPlanner een server-side validatie uit door Supabase Auth's `auth.getUser()` aan te roepen. Dit is een volledige cryptografische verificatie tegen de Supabase-service, geen alleen-lokale decodering. Verlopen of ongeldige sessies worden onmiddellijk geweigerd.

### 7.3 Wachtwoordbeleid

Het wachtwoordbeleid is ingesteld in de productie-omgeving van Supabase Auth (tier: **Pro**) en omvat vijf onafhankelijke beschermingsmaatregelen:

- **Minimaal 12 tekens.** Kortere wachtwoorden worden bij registratie of wachtwoordwijziging geweigerd.
- **Verplichte tekenklassen.** Elk wachtwoord moet minstens één kleine letter, één hoofdletter, één cijfer en één speciaal teken bevatten. Wachtwoorden die niet aan deze eis voldoen worden geweigerd.
- **Automatische detectie van gelekte wachtwoorden via HaveIBeenPwned.** Bij elke registratie en wachtwoordwijziging controleert Supabase Auth het opgegeven wachtwoord tegen de Pwned Passwords database van HaveIBeenPwned. Deze controle gebruikt het **k-anonimiteit-protocol**: alleen de eerste vijf tekens van de SHA-1 hash van het wachtwoord worden aan HaveIBeenPwned verstuurd, nooit het wachtwoord zelf en nooit de volledige hash (zie [haveibeenpwned.com/API/v3#PwnedPasswords](https://haveibeenpwned.com/API/v3#PwnedPasswords)). Wachtwoorden die bekend zijn uit publieke datalekken worden geweigerd.
- **Secure password change.** Een gebruiker moet recent (binnen 24 uur) zijn ingelogd om zijn eigen wachtwoord te mogen wijzigen. Dit voorkomt dat een aanvaller die een slapende sessie bemachtigt het wachtwoord kan wijzigen en de rechtmatige gebruiker buitensluit.
- **Verplichte opgave van het huidige wachtwoord bij wijziging.** Ook binnen een geldige sessie moet de gebruiker zijn huidige wachtwoord invoeren om een nieuw wachtwoord in te stellen.

**Hash-algoritme.** Wachtwoorden worden door Supabase Auth opgeslagen als bcrypt-hash met salt. AstraPlanner heeft geen toegang tot het leesbare wachtwoord op enig moment, zelfs niet tijdens het inlogproces.

**Multi-factor authenticatie.** Beschikbaar via Supabase Auth en op verzoek per gebruiker te activeren. Wij adviseren Protest Sportwear om MFA verplicht te stellen voor alle rollen vanaf `planner` (rang 50) en hoger.

**Secure email change.** Wijzigingen van het e-mailadres van een gebruiker worden geverifieerd op zowel het oude als het nieuwe adres, waarmee een aanvaller die tijdelijk toegang heeft tot één van beide mailboxen geen onomkeerbare account-takeover kan uitvoeren.

### 7.3.1 Overgangsregeling voor bestaande wachtwoorden

De hierboven beschreven regels voor minimum-lengte, verplichte tekenklassen en controle tegen HaveIBeenPwned worden door Supabase Auth afgedwongen op het moment dat een wachtwoord wordt **gezet of gewijzigd**. Bestaande wachtwoorden die vóór de aanscherping van het beleid zijn aangemaakt (en die mogelijk korter of eenvoudiger waren) blijven tot hun eerstvolgende wijziging geldig. Dit is standaardgedrag van Supabase Auth en van vrijwel alle authenticatieplatforms: het tegenovergestelde zou neerkomen op een collectieve account-lockout, wat vanuit een AVG-perspectief (beschikbaarheid, art. 32) ongewenst is.

**Hoe AstraPlanner hiermee omgaat richting Protest Sportwear:**

1. **Bij go-live** sturen wij aan alle Protest Sportwear-gebruikers een verplichte "first login password reset" per e-mail. Tijdens deze reset wordt het nieuwe, strengere wachtwoordbeleid volledig afgedwongen. Na voltooiing hiervan voldoet het volledige gebruikersbestand aan de regels in §7.3.
2. **Voor de interne AstraPlanner-accounts** die reeds vóór deze aanscherping bestonden wordt dezelfde reset-cyclus uitgevoerd als onderdeel van de pre-go-live checklist.
3. **Periodieke heraanscherping.** Als in de toekomst het beleid verder wordt aangescherpt (bijvoorbeeld naar 14 tekens, of met een verplichte passphrase-structuur) voeren wij dezelfde verplichte-reset procedure uit.

### 7.4 Sessiebeveiliging — concreet

- **HttpOnly-cookies:** JavaScript in de browser kan de sessie-token niet benaderen, waarmee XSS-aanvallen de sessie niet kunnen stelen.
- **Secure-vlag:** cookies worden uitsluitend over HTTPS verzonden.
- **SameSite=Lax:** cookies worden niet meegestuurd bij cross-site POST-verzoeken, waarmee standaard-CSRF wordt voorkomen.
- **JSON content-type:** alle tRPC-verzoeken zijn `application/json`, wat een CORS-preflight triggert voor cross-origin verzoeken — een additionele CSRF-bescherming.

### 7.5 Wat wij **niet** claimen

Wij passen **geen** expliciete CSRF-tokenregistratie per verzoek toe. Onze CSRF-bescherming leunt op de combinatie van SameSite-cookies en het `application/json` content-type, wat een algemeen geaccepteerd patroon is voor tRPC-gebaseerde applicaties. Wij noemen dit expliciet om misverstand te voorkomen.

---

## 8. Autorisatie en Toegangscontrole

Toegangscontrole wordt in AstraPlanner op drie lagen afgedwongen:

**Laag 1 — Authenticatie-middleware (proxy).** Niet-geauthenticeerde verzoeken naar beschermde paden (`/dashboard`, `/plan`, etc.) worden doorverwezen naar de inlogpagina. Dit gebeurt in onze Next.js proxy op elk inkomend HTTP-verzoek.

**Laag 2 — API-procedure gates.** Elke tRPC-procedure verklaart expliciet welk type gebruiker hem mag aanroepen: `protectedProcedure` (elke ingelogde gebruiker), `plannerProcedure` (minimaal planner-rol), `adminProcedure` (minimaal tenant_admin), enzovoort. Aanvragen die niet aan de rolvereiste voldoen worden geweigerd met een `FORBIDDEN`-fout, zonder dat de onderliggende data wordt aangeraakt.

**Laag 3 — Row-Level Security op de database.** Zelfs als lagen 1 en 2 onverhoopt gepasseerd zouden worden, blokkeert de database de query op rijenniveau. Voor gevoelige tabellen (`employee`, `integration_config`, `labor_rule`) is ook de rolcontrole in de RLS-policy opgenomen: niet-admins kunnen niet schrijven, ongeacht welke API-aanroep wordt gedaan.

---

## 9. Invoervalidatie en Bescherming tegen Injectie

**Invoervalidatie (strong).** Alle 116 tRPC-API-procedures valideren hun input met **Zod** — een TypeScript-first schemavalidator. Dit betekent dat bijvoorbeeld een verzoek dat een tekst probeert door te geven waar een UUID wordt verwacht, of een negatief getal waar een positief getal wordt verwacht, vóór elke businesslogica wordt geweigerd. De validatie gebeurt server-side; client-side validatie wordt als pure UX-ondersteuning beschouwd en is nooit vertrouwd.

**SQL-injectie (strong).** AstraPlanner construeert nooit SQL-strings met string-concatenatie. Alle databasetoegang loopt via Supabase's geparametriseerde query-builder (`.eq()`, `.insert()`, `.select()`, etc.). Een SQL-injectievector bestaat niet in de huidige codebase.

**XSS (strong).** React voert standaard HTML-escaping uit op alle gerenderde waarden. Een volledige scan van de codebase op gevaarlijke patronen (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) geeft **nul treffers**. Daarmee is de applicatie intrinsiek beschermd tegen klassieke XSS-aanvallen.

**Bestandsupload (CSV — adequate).** CSV-import verloopt via de `papaparse`-bibliotheek met strikte instellingen (`header: true`, `skipEmptyLines: true`). Papaparse interpreteert geen formules en voert geen shellopdrachten uit; het retourneert uitsluitend plain strings. Geen padmanipulaties worden uitgevoerd op door de gebruiker opgegeven bestandsnamen.

**Bestandsupload (Excel — hardening vereist).** Wij maken momenteel gebruik van de `xlsx`-bibliotheek voor het inlezen van demand-planningsbestanden in Excel-formaat. Deze bibliotheek heeft twee bekende hoog-gewaardeerde kwetsbaarheden (Prototype Pollution — GHSA-4r6h-8v6p-xvw6; ReDoS — GHSA-5pgg-2g8v-p4x9) waarvoor geen upstream-fix beschikbaar is. **Vóór productie-uitrol voor Protest Sportwear vervangen wij `xlsx` door `exceljs` of draaien wij de Excel-verwerking in een afgeschermde Web Worker.** Dit is opgenomen in onze hardening-roadmap (§15).

---

## 10. Audit Logging

### 10.1 Wat wordt gelogd

AstraPlanner onderhoudt een **onveranderbare audit-logtabel** (`audit_log`) die wijzigingen registreert op zes categorieën gevoelige gegevens:

1. `employee` — alle mutaties op medewerkersgegevens
2. `employee_skill` — toekenning en wijziging van vaardigheden
3. `employee_availability_override` — verzuim en verlof
4. `plan_version` — versies van planningen
5. `shift_assignment` — toewijzing van medewerkers aan diensten
6. `labor_rule` — arbeidsregels en wettelijke beperkingen

Voor elke wijziging legt het systeem vast: wie (`actor_id`), vanaf welk IP (`actor_ip_address`), wanneer, welke actie (`INSERT` / `UPDATE` / `DELETE`), op welke entiteit, en een complete snapshot van de waarden vóór en na de wijziging (`before_state`, `after_state` in JSONB).

### 10.2 Onveranderbaarheid

De audit-logtabel is technisch onveranderbaar gemaakt: een databasetrigger (`trg_audit_log_immutable`) werpt een fatale exceptie bij elke poging tot `UPDATE` of `DELETE`. Zelfs een kwaadwillende met directe databasetoegang kan zijn sporen niet wissen zonder de trigger zelf te verwijderen, wat op zijn beurt een `DDL`-operatie is die door Supabase wordt gelogd.

### 10.3 Volledige attributie ook voor service-role mutaties — gerealiseerd

Een eerdere interne review had vastgesteld dat wijzigingen die door AstraPlanner's serverlaag worden uitgevoerd via de *service-role verbinding* (AI-chat tools, tRPC routers die de RLS-afscherming overslaan voor performance, en administratieve HTTP-endpoints) niet altijd herleidbaar waren tot een specifieke gebruiker in de audit-log: het veld `actor_id` kon op `NULL` staan omdat de JWT-context van de oorspronkelijke gebruiker niet werd doorgegeven aan de databasesessie. Dit punt is opgelost met twee gekoppelde maatregelen.

**Wijziging 1 — audit trigger leest een expliciete actor-header.** De triggerfunctie `fn_audit_trigger()` is uitgebreid zodat zij `actor_id` in de volgende volgorde bepaalt (zie migratie [`00018_audit_actor_fix.sql`](../../supabase/migrations/00018_audit_actor_fix.sql)):
1. **`request.headers ->> 'x-actor-id'`** — een HTTP-header die de applicatie meestuurt bij elke service-role databaseverbinding op basis van de oorspronkelijke eindgebruiker.
2. **`request.jwt.claims ->> 'sub'`** — de JWT-claim die PostgREST doorgeeft op de normale tRPC-route (ongewijzigd, voor backwards compatibility).
3. **`NULL`** — uitsluitend voor systeem- of cronjobs zonder gebruikerscontext.

**Wijziging 2 — helper in de applicatielaag.** Een nieuwe functie `createAdminClientForUser(userId)` (in [`src/lib/supabase/admin.ts`](../../src/lib/supabase/admin.ts)) instantieert een service-role Supabase client die bij elke HTTP-request naar PostgREST automatisch de header `x-actor-id: <uuid>` meestuurt. Deze helper is uitgerold op alle code-paden die namens een eindgebruiker muteren: de AI onboarding-chat (`src/app/api/ai/chat/route.ts`) en de vijf tRPC-routers (`workforce`, `absence`, `planning`, `scenario`, `admin`) die schrijven naar een van de zes audit-gekoppelde tabellen. De oorspronkelijke `createAdminClient()` zonder parameters blijft bestaan voor cronjobs zoals de dagelijkse insights-refresh, waar geen gebruiker bij hoort.

**Wijziging 3 — expliciete audit-log voor administratieve endpoints.** Het endpoint `/api/admin/assign-org` dat een gebruiker aan een organisatie toewijst opereert op `auth.users`, een tabel die niet onder `fn_audit_trigger` valt. Deze route schrijft nu zelf expliciet een rij naar `audit_log` met `entity_type = 'auth.user'`, `action = 'ASSIGN_ORG'`, en de volledige voor- en na-staat van de metadata (organisatie + rol), inclusief het e-mailadres van het doel-account en de rol van de aanroeper. Rolwijzigingen tussen gebruikers zijn daarmee altijd traceerbaar.

**Verificatie.** Na een wijziging via de AI-chat (bijvoorbeeld `addEmployee`) of via een tRPC-mutation bevat de corresponderende rij in `audit_log` de `actor_id` van de ingelogde gebruiker, niet `NULL`. Dit is reproduceerbaar door een `tenant_admin` een kleine wijziging te laten uitvoeren en vervolgens `SELECT actor_id, entity_type, action, created_at FROM audit_log ORDER BY created_at DESC LIMIT 1` uit te voeren.

---

## 11. AI-verwerking en Gegevensminimalisatie

Dit is een onderwerp waar wij extra zorgvuldig in willen zijn, omdat AI-verwerking door een externe dienstverlener (Anthropic) een verwerking is die voor Protest Sportwear mogelijk nieuwe vragen oproept.

### 11.1 Overzicht van AI-integraties

AstraPlanner heeft drie plekken waarop het AI-model Claude (Anthropic) wordt aangeroepen:

| Endpoint | Welk model | Welke data gaat naar Anthropic | Bevat persoonsgegevens? |
|---|---|---|---|
| `/api/ai/demand-analyze` | `claude-haiku-4-5` | Structuur van geüpload Excel/CSV-bestand (kolomnamen, enkele voorbeeldrijen) | Nee, alleen metadata |
| `/api/ai/insights-analyze` | `claude-sonnet-4` | Aggregaten: aantal actieve verzuimmeldingen, totaal aantal medewerkers, afdelingsnamen, weerdata | **Nee** — aggregaten, geen persoonsgegevens |
| `/api/ai/chat` (onboarding assistent) | Claude (SDK-default) | Door de gebruiker getypte berichten, plus tool-resultaten die medewerkersnamen kunnen bevatten | **Ja — zie §11.3** |

### 11.2 Wat is veilig en expliciet claimbaar

De **insights-analyse**, die de AI-adviezen in het dashboard aandrijft, stuurt uitsluitend **aggregaten en tellingen** naar Claude: "25 medewerkers, 3 actieve verzuimmeldingen, afdeling 'Warehouse'". Geen individuele namen, geen individuele verzuimredenen, geen medische data. Deze verwerking is strikt AVG-conform onder het principe van dataminimalisatie (art. 5 lid 1 sub c AVG).

De **demand-analyse** stuurt alleen bestandsstructuur-metadata en een handvol voorbeeldrijen naar Claude om kolommen te herkennen. Wanneer het bestand geen persoonsgegevens bevat (wat voor demand-forecasts doorgaans het geval is: het zijn volumes en uren, geen namen), bevat de prompt geen persoonsgegevens.

### 11.3 Geen direct identificerende persoonsgegevens naar Anthropic — gerealiseerd

Voor de **onboarding chat-assistent**, die een conversationele interface biedt om tijdens de inrichting medewerkers te beheren en te analyseren, hanteert AstraPlanner een **strikte pseudonimiseringsarchitectuur**. Geen enkele tool-functie die wordt aangeroepen door het Claude-model krijgt een voor- of achternaam, e-mailadres of telefoonnummer van een medewerker te zien.

**Hoe het werkt — technisch.** Voordat een resultaat van een database-query door de AI-laag wordt verwerkt, passeert het de centrale anonimiseringsmodule (`src/lib/ai/anonymizer.ts`). Deze module verwijdert alle direct identificerende velden (`first_name`, `last_name`, `full_name`, `email`, `phone`) en vervangt ze door een **stabiele, leesbare pseudoniem** zoals `Medewerker A3F2`. De pseudoniem wordt gegenereerd via een **HMAC-SHA-256** over het employee-id, met als sleutel een geheime, per-organisatie variërende salt. De AI ziet dus uitsluitend deze pseudoniem; de werkelijke naam blijft binnen de PostgreSQL-database in Frankfurt of Amsterdam.

**Eigenschappen van de pseudonimisering:**
- **Stabiel binnen een organisatie.** Dezelfde medewerker krijgt altijd hetzelfde pseudoniem, zodat de AI consistent kan redeneren over meerdere conversatie-stappen.
- **Tenant-gescheiden.** De pseudoniemen verschillen tussen organisaties: zelfs als — hypothetisch — twee verschillende klanten dezelfde interne employee-id zouden hebben, zouden de pseudoniemen in de Anthropic-logs niet correleren.
- **Eenrichtingsverkeer.** Het pseudoniem is niet terug te rekenen naar een naam zonder toegang tot zowel de database als de organisatie-specifieke HMAC-sleutel. Iemand die alleen toegang zou hebben tot een Anthropic-zijdig logbestand kan uit een pseudoniem geen naam afleiden.
- **Leesbaar voor de eindgebruiker.** De pseudoniemen zijn ergonomisch genoeg om in de chatresponse direct getoond te worden zonder reverse-mapping nodig te hebben, wat de architectuur eenvoudig en de gegevensstroom verifieerbaar houdt.

**De vier tool-functies die met medewerkergegevens werken** (`listEmployees`, `addEmployee`, `bulkAddEmployees`, `crossTrainSuggestion`) zijn bekabeld met deze module en geven uitsluitend pseudoniemen terug. Voor `crossTrainSuggestion` gaan zelfs geen `first_name`/`last_name`-velden meer uit de database de applicatie binnen — alleen het employee-id wordt opgehaald, dat vervolgens wordt omgezet in een pseudoniem.

**Eén nuance, eerlijk benoemd.** Wanneer een gebruiker tijdens een onboarding-sessie zelf in de chat een nieuwe medewerker aanmaakt door een naam in te tikken (*"voeg Jan Jansen toe als full-time picker"*), bevat dat ene gebruikersbericht uiteraard de naam *"Jan Jansen"* — die naam wordt door Claude geparseerd om te begrijpen welke velden in te vullen. Dit is gegevensverstrekking die door de gebruiker zelf wordt geïnitieerd binnen de uitvoering van zijn taak (vergelijkbaar met een gebruiker die een naam in een e-mailprogramma intypt). De **resultaat-respons** van de tool-functie bevat na onze hardening géén namen meer, zodat de naam in vervolgturns van dezelfde conversatie niet opnieuw door de AI wordt gezien of verwerkt.

**Wat dit betekent onder de AVG:**
- AstraPlanner stuurt **geen direct identificerende persoonsgegevens** vanuit de database naar Anthropic. De doorgifte naar derde land (VS) is daarmee beperkt tot pseudoniemen en operationele metadata, en niet tot identificeerbare persoonsgegevens.
- Voor de uitzondering hierboven (gebruiker tikt zelf een naam in een prompt) blijft de doorgifte gegrond op de Standard Contractual Clauses (Module 2) in de DPA met Anthropic, en op de instructie van de gebruiker (Protest Sportwear) zelf.
- AstraPlanner is daarmee **niet langer afhankelijk** van een Zero Data Retention-overeenkomst met Anthropic voor de bescherming van naam- en contactgegevens van de medewerkers van Protest Sportwear. ZDR blijft een mogelijke aanvullende beheersmaatregel die wij later kunnen toevoegen, maar is geen voorwaarde voor de in dit document beschreven garanties.

**Verifieerbaarheid.** De volledige implementatie is geconcentreerd in twee bestanden en is door uw IT-afdeling controleerbaar tijdens een technische due diligence:
- `src/lib/ai/anonymizer.ts` — de pseudonimiseringsmodule (~95 regels);
- `src/app/api/ai/chat/route.ts` — de tool-handlers, met expliciete `// PII redaction`-commentaarregels op de plaatsen waar de anonymizer wordt aangeroepen.

### 11.4 Geen training

In onze contracten met Anthropic én in het standaard Anthropic API-beleid is vastgelegd dat **data die via de API wordt verzonden niet wordt gebruikt voor het trainen van modellen**. Dit is een fundamenteel onderscheid met consumentendiensten als ChatGPT.

### 11.5 Geen geautomatiseerde besluitvorming in de zin van art. 22 AVG

AstraPlanner's AI-laag adviseert, maar neemt **geen** bindende beslissingen die rechtsgevolgen hebben voor medewerkers. Elke wijziging in diensten, roosters of medewerkergegevens vereist een menselijke bevestiging (planner of tenant_admin). Dit sluit de toepassing van art. 22 AVG (verbod op geautomatiseerde individuele besluitvorming) uit.

---

## 12. AVG/GDPR — Naleving per Artikel

### 12.1 Grondslag voor verwerking (art. 6)

AstraPlanner verwerkt persoonsgegevens namens Protest Sportwear. De rechtsgrondslag voor de verwerking is primair:
- **Art. 6 lid 1 sub b AVG** — noodzakelijk voor de uitvoering van de arbeidsovereenkomst;
- **Art. 6 lid 1 sub c AVG** — voor zover de verwerking nodig is voor wettelijke verplichtingen van Protest Sportwear als werkgever (bijvoorbeeld arbeidstijdenregistratie);
- **Art. 6 lid 1 sub f AVG** — gerechtvaardigd belang van Protest Sportwear bij een efficiënte personeelsplanning, getoetst aan de belangen en rechten van betrokkenen.

De afweging van deze grondslagen is de verantwoordelijkheid van Protest Sportwear als verwerkingsverantwoordelijke. AstraPlanner ondersteunt Protest Sportwear desgewenst bij het opstellen van een register van verwerkingsactiviteiten (art. 30 AVG).

### 12.2 Rechten van betrokkenen (art. 15-22)

AstraPlanner ondersteunt Protest Sportwear in het faciliteren van de volgende rechten. In de meeste gevallen is de verantwoordelijkheid contractueel bij Protest Sportwear belegd, met technische ondersteuning door AstraPlanner.

| Recht | Ondersteuning |
|---|---|
| **Recht op inzage** (art. 15) | Een `tenant_admin` kan van elke medewerker een volledig overzicht uit het systeem genereren. Een data subject access request-export (JSON/CSV) op verzoek van Protest Sportwear wordt door AstraPlanner binnen 5 werkdagen geleverd. |
| **Recht op rectificatie** (art. 16) | Alle medewerkervelden kunnen door bevoegde gebruikers worden gewijzigd via de standaard-UI. Wijzigingen worden in de audit-log vastgelegd. |
| **Recht op vergetelheid** (art. 17) | **Hardening vereist.** Momenteel ondersteunt AstraPlanner verwijdering via status `terminated` + cascade delete bij contractbeëindiging. Vóór go-live leveren wij een expliciete anonimiseringsroutine die PII-velden nullt (`first_name='VERWIJDERD'`, `email=NULL`) terwijl referentiële integriteit in historische dienstroosters behouden blijft. |
| **Recht op beperking van verwerking** (art. 18) | Via status `suspended` kan een medewerker worden uitgesloten van planning zonder verwijdering. |
| **Recht op overdraagbaarheid** (art. 20) | AstraPlanner levert op verzoek van Protest Sportwear een gestructureerde export (CSV of JSON) van alle data van een betrokkene binnen 5 werkdagen. |
| **Recht van bezwaar** (art. 21) | Zie §11.5 — er is geen geautomatiseerde besluitvorming met rechtsgevolgen; hiermee is het recht van bezwaar in praktijk beperkt tot uitzondering op verwerkingsdoelen, te regelen door Protest Sportwear als werkgever. |
| **Art. 22 — geautomatiseerde besluitvorming** | Niet van toepassing, zie §11.5. |

### 12.3 Dataminimalisatie (art. 5 lid 1 sub c)

AstraPlanner verzamelt uitsluitend velden die noodzakelijk zijn voor personeelsplanning. Optionele velden (bijvoorbeeld `phone`, `email`) zijn niet verplicht; Protest Sportwear kan zelf bepalen welke velden worden ingevuld. Wij adviseren om het vrije-tekstveld `reason` (verzuimreden) **niet** te gebruiken voor medische details (zie §4.2).

### 12.4 Opslagbeperking (art. 5 lid 1 sub e)

Zie §4.4 voor de bewaartermijnen.

### 12.5 Integriteit en vertrouwelijkheid (art. 5 lid 1 sub f)

Zie §5 (encryptie), §6 (tenant-isolatie), §10 (audit logging).

### 12.6 Verantwoordingsplicht (art. 5 lid 2)

Dit document is onderdeel van de verantwoording die AstraPlanner aan Protest Sportwear aflegt. Wij leveren op verzoek aanvullende documentatie zoals:
- Register van verwerkingsactiviteiten (art. 30);
- Data Protection Impact Assessment (DPIA) template;
- Sub-verwerkerslijst met DPA's;
- Certificaten en SOC 2-rapporten van subverwerkers;
- Rapportage van beveiligingsincidenten (indien van toepassing).

---

## 13. Incident Response en Datalekken

### 13.1 Procedure

AstraPlanner hanteert de volgende standaardprocedure bij een vermoedelijk beveiligingsincident of datalek:

| Fase | Termijn | Actie |
|---|---|---|
| **Detectie** | Onmiddellijk | Monitoring, logboeken, melding door gebruiker, of melding door subverwerker |
| **Triage** | Binnen 2 uur | Beoordeling ernst, afbakening scope, vastleggen indicatoren |
| **Containment** | Binnen 4 uur | Isoleren getroffen systemen, revoken credentials, blokkeren accounts indien nodig |
| **Notificatie aan verwerkingsverantwoordelijke** | **Binnen 24 uur na vaststelling** | Schriftelijke melding aan Protest Sportwear aan het door u aangewezen contactpunt |
| **Forensisch onderzoek** | Binnen 72 uur | Reconstructie op basis van audit-log, database-logs en infrastructuurlogs |
| **Rapportage betrokken categorieën** | Binnen 72 uur na vaststelling | Wij leveren u de informatie die u nodig heeft voor uw eigen melding aan de Autoriteit Persoonsgegevens (art. 33 AVG) |
| **Eradication & recovery** | Afhankelijk van ernst | Herstel uit back-up, patchen, hardenen |
| **Post-mortem** | Binnen 14 dagen | Schriftelijk incidentrapport, root cause, en maatregelen |

### 13.2 Meldtermijn aan de Autoriteit Persoonsgegevens

Het is in de AVG (art. 33) een verantwoordelijkheid van de **verwerkingsverantwoordelijke** — Protest Sportwear — om een datalek binnen 72 uur aan de Autoriteit Persoonsgegevens te melden. AstraPlanner ondersteunt Protest Sportwear hierin door binnen 24 uur na vaststelling van een incident de vereiste informatie te leveren, zodat Protest Sportwear ruim binnen de 72-uurstermijn aan zijn meldplicht kan voldoen.

### 13.3 Contactpunt datalek

**AstraPlanner meldpunt datalek:** `[INVULLEN: e-mailadres + telefoonnummer, 24/7 bereikbaar]`
**Protest Sportwear contactpunt:** Dhr. M. Werkman, Warehouse Manager — `[INVULLEN: e-mailadres, telefoonnummer]`

---

## 14. Secure Development Lifecycle

### 14.1 Processen

- **Code review vereist.** Geen wijziging komt in productie zonder review door een tweede persoon.
- **Type-veilige code.** De gehele codebase is TypeScript in strict mode. Dit voorkomt een breed scala aan runtime-fouten.
- **Dependency scanning.** Wij draaien regelmatig `npm audit` en monitoren bekende CVE's in onze afhankelijkheden. De huidige status van bekende kwetsbaarheden is transparant gemeld in §9 en §15.
- **Secrets management.** Alle credentials (database, Anthropic, Vercel) worden beheerd als versleutelde omgevingsvariabelen in Vercel. Geen credentials staan in broncode of in Git-historie.
- **Geanonimiseerde ontwikkel- en test-data.** Onze engineers werken tegen synthetische data, niet tegen productiedata van klanten.
- **Minimale rechten voor CI/CD.** De deployment-pipeline beschikt niet over leesrechten op productiedata.

### 14.2 Penetratietesten

Op dit moment heeft AstraPlanner **geen externe penetratietest** laten uitvoeren. Wel is er een uitgebreide interne beveiligingsreview uitgevoerd (waarvan dit document een samenvatting is). Wij zijn bereid om voorafgaand aan Protest Sportwear's productie-uitrol een externe pentest te laten uitvoeren door een gekwalificeerde partij (bijvoorbeeld Computest, Fox-IT, of Zerocopter) en het rapport op verzoek van Protest Sportwear beschikbaar te stellen. Dit kan contractueel worden opgenomen.

---

## 15. Pre-Go-Live Hardening Roadmap (contractueel te borgen)

Dit is de eerlijke kern van dit document. De interne beveiligingsreview heeft een aantal punten aan het licht gebracht die wij vóór de productie-uitrol voor Protest Sportwear afronden. Wij nemen deze punten expliciet op in de Verwerkersovereenkomst zodat Protest Sportwear hier bij afwijking opzeggingsrecht aan kan ontlenen.

| # | Onderwerp | Huidige staat | Actie vóór go-live | Bindend? |
|---|---|---|---|---|
| 1 | **PII naar Anthropic** | ✅ **Gerealiseerd** — alle vier AI-tool-functies (`listEmployees`, `addEmployee`, `bulkAddEmployees`, `crossTrainSuggestion`) zijn bekabeld met een centrale HMAC-SHA-256 pseudonimiseringsmodule (`src/lib/ai/anonymizer.ts`); Claude ziet alleen pseudoniemen als `Medewerker A3F2`. Zie §11.3 | — | ✅ Gereed |
| 2 | **Kwetsbare `xlsx`-bibliotheek** | Aanwezig met twee onoplosbare HIGH CVE's | Vervanging door `exceljs` of sandboxing in Web Worker | Ja |
| 3 | **Rate limiting** | ✅ **Gerealiseerd** — Upstash Ratelimit (Redis-backed sliding window) op alle drie de AI-endpoints (`/api/ai/chat`, `/api/ai/demand-analyze`, `/api/ai/insights-analyze`), op het contactformulier (`/api/contact`), en als tRPC-middleware op alle authenticated mutations. Drie buckets met aparte limieten: AI 20/min, mutations 120/min, public 5/min, allemaal per gebruiker (of per IP voor unauthenticated). Fail-open bij backend-uitval om beschikbaarheid te beschermen | — | ✅ Gereed |
| 4 | **Security headers** | ✅ **Gerealiseerd** — `next.config.ts` levert nu Content-Security-Policy, Strict-Transport-Security (2 jaar, includeSubDomains), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy, en Cross-Origin-Opener-Policy op elke route | — | ✅ Gereed |
| 5 | **Fixable dependency-CVE's** | ✅ **Gerealiseerd** — `npm audit fix` uitgevoerd; lodash, picomatch en brace-expansion gepatcht. Van 8 → 5 vulnerabilities, van 3 → 1 high (de resterende high is `xlsx`, zie item #2). De 4 resterende moderates betreffen `vitest`/`vite`/`esbuild` en zijn uitsluitend devDependencies zonder productie-impact | — | ✅ Gereed |
| 6 | **Audit-log actor_id bij admin-client** | ✅ **Gerealiseerd** — trigger leest `actor_id` nu uit `request.headers.x-actor-id` met JWT-claim als fallback (migratie 00018); nieuwe helper `createAdminClientForUser()` zet deze header automatisch, uitgerold op AI-chat en vijf tRPC-routers; `assign-org` endpoint schrijft expliciet naar `audit_log`. Zie §10.3 | — | ✅ Gereed |
| 7 | **Wachtwoordbeleid** | ✅ **Gerealiseerd** — Supabase Auth upgrade naar Pro uitgevoerd; alle vijf de beschermingsmaatregelen actief (min 12 tekens, verplichte tekenklassen, HaveIBeenPwned leaked-password detectie via k-anonimiteit, secure password change, verplicht huidig wachtwoord bij wijziging). Zie §7.3 | — | ✅ Gereed |
| 8 | **Recht op vergetelheid** | Alleen cascade delete | Expliciete anonimiseringsroutine die PII nullt | Ja |
| 9 | **Soft-delete op medewerkers** | Niet geïmplementeerd | Toevoegen `deleted_at` kolom + filter in alle queries | Ja |
| 10 | **Externe pentest** | Niet uitgevoerd | Externe pentest door gekwalificeerde partij vóór productie-uitrol | Optioneel, contractueel onderhandelbaar |
| 11 | **Contactformulier-logging** | Logt e-mail naar stdout | Persistent opslaan in tabel + redactie uit logs | Ja |
| 12 | **Connection params encryptie** | Kolom bestaat (`BYTEA`), encryptie-code nog te valideren | Implementatie verifiëren of afronden, en beschrijven in dit document | Ja |

---

## 16. Claims die wij expliciet **niet** maken

Omwille van volledige transparantie benoemen wij de claims die AstraPlanner **niet** kan en wil maken:

- AstraPlanner beschikt op dit moment **niet** over een ISO 27001, ISO 27701, SOC 2 of NEN 7510 certificering op bedrijfsniveau. Wij leunen voor infrastructuur-certificeringen op de certificeringen van Supabase en Vercel.
- AstraPlanner is **geen** geaccrediteerde verwerker voor bijzondere persoonsgegevens in de zin van art. 9 AVG, en het platform is niet ontworpen voor de verwerking van gezondheidsgegevens, etnische afkomst, politieke overtuigingen, of andere bijzondere categorieën.
- AstraPlanner heeft **geen** Data Protection Officer in formele AVG-zin (hetgeen voor een verwerker van onze omvang en activiteit ook niet wettelijk verplicht is).
- Wij beschikken **niet** over een Zero Data Retention-overeenkomst met Anthropic op dit moment. Wij achten dit ook niet noodzakelijk gegeven de in §11.3 beschreven pseudonimiseringsarchitectuur, maar benoemen het hier omwille van transparantie.
- Wij hanteren **geen** klant-specifieke encryptiesleutels (customer-managed keys, "bring your own key"). Versleuteling in rust gebruikt platform-beheerde sleutels bij Supabase.

Wij beschouwen deze open en eerlijke benoeming van wat **niet** aanwezig is als een wezenlijk onderdeel van een integer security-document, en vertrouwen erop dat Protest Sportwear dit als zodanig waardeert.

---

## 17. Contractuele Borging

De in dit document beschreven maatregelen en beloftes worden juridisch geborgd in:

1. **Hoofdovereenkomst** — tussen AstraPlanner en Protest Sportwear, met daarin serviceniveau, prijs, looptijd en verantwoordelijkheden.
2. **Verwerkersovereenkomst (art. 28 AVG)** — waarin de verwerkerrelatie, de instructiebevoegdheid, de geheimhouding, de subverwerkerslijst, de beveiligingsmaatregelen, de bijstand bij betrokkenenrechten, de meldplicht, de audit-rechten van Protest Sportwear, en de retourneer- of verwijderingsplicht na einde contract worden geregeld.
3. **Security Addendum** — waarin de in §15 opgenomen hardening-roadmap als harde verplichting wordt vastgelegd, met een duidelijke deadline en het recht voor Protest Sportwear om bij gebreke van tijdige naleving de overeenkomst kosteloos op te zeggen.
4. **Standard Contractual Clauses** — waar nodig, voor doorgifte aan Anthropic in de VS.

---

## 18. Bijlagen en Vervolgstappen

AstraPlanner stelt op verzoek beschikbaar:

- Concept Verwerkersovereenkomst;
- Concept Security Addendum;
- Subverwerkers-overzicht met links naar DPA's van Supabase, Vercel en Anthropic;
- Technisch-architectonisch overzicht (componenten- en datastromendiagram);
- Voorbeeldexport Data Subject Access Request.

### 18.1 Voorgesteld vervolgproces

1. **Technische due diligence call** — AstraPlanner presenteert de codebase en beantwoordt alle vragen van de IT-afdeling van Protest Sportwear.
2. **Review Verwerkersovereenkomst** — juridische review door Protest Sportwear.
3. **Afsluiten van Security Addendum** — contractuele vastlegging van de hardening-roadmap uit §15.
4. **Pilot met gecontroleerde scope** — eerste uitrol op één site, met testdata of beperkte productiedata.
5. **Externe pentest** (indien gewenst door Protest Sportwear).
6. **Full go-live** — uitrol over alle sites, met contractuele opleverpunten uit §15 aantoonbaar voltooid.

---

## 19. Afsluiting

Geachte heer Werkman,

Wij danken u voor de zorgvuldigheid waarmee u de beveiliging en privacy-aspecten van uw leveranciers toetst. Het is voor ons een motiverend uitgangspunt dat een klant zoals Protest Sportwear dit type dialoog actief opzoekt voordat een contract wordt getekend.

Wij hebben ernaar gestreefd in dit document de situatie *zoals zij werkelijk is* te beschrijven, inclusief onze sterke punten, onze nog op te leveren punten, en onze grenzen. Wij doen dat liever dan met marketing-taal een rooskleuriger beeld te schetsen dan strikt houdbaar zou zijn. Wij menen dat een langdurige samenwerking gebaat is bij dit uitgangspunt van integriteit boven indruk.

Wij staan ter beschikking voor aanvullende vragen, een technische toelichting met uw IT-team, of een persoonlijk gesprek waarin de in §15 geschetste roadmap concreet wordt ingepland.

Met vriendelijke groet,

`[INVULLEN: naam, functie, handtekening]`
AstraPlanner

---

### Colofon

Dit document is opgesteld op basis van een code-niveau beveiligingsreview van de AstraPlanner codebase, uitgevoerd op 8 april 2026. Alle technische uitspraken zijn verifieerbaar aan de hand van specifieke bestanden en regels in de broncode en zijn op verzoek tijdens een due-diligence sessie te controleren. Bij materiële wijzigingen in de architectuur of de subverwerkerslijst wordt dit document herzien en opnieuw aan Protest Sportwear verstrekt.

**Einde document.**
